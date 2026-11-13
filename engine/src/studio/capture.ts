// studio_capture job (launch videos): record real footage of the user's public site (SSRF-guarded), store each clip,
// screenshot and the logo as ready StudioUploads on the session, then queue the launch studio_turn.
// Friendly failure: the chat says the site couldn't be opened and suggests the CLI for private/local apps.
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  STUDIO_CAPTURE_LIMITS,
  STUDIO_TURN_JOB_TYPE,
  StudioCapturePayloadSchema,
  studioKeys,
  type StudioLaunchInfo,
  type StudioPhase,
  type StudioTurnPayload,
} from "../../../src/lib/studio/contracts";
import { PermanentJobError, type JobContext } from "../jobs/context";
import { guardRoute } from "../jobs/extract/crawl";
import { errMsg, log } from "../log";
import { ffmpegPath } from "../modules/ezmotion/runtime";
import { assertPublicUrl } from "../net/ssrf";
import { recordSite, type CaptureResult } from "./capture-record";
import { posterFrame } from "./media";
import { posterKeyFor } from "./probe";

export const CAPTURE_FAILED_MESSAGE = "I couldn't open your site to record it. Check the address is public and loads in a normal browser, then try again. For a local or staging app, run `npx komendly launch <url>` on your machine.";

export async function studioCaptureJob(ctx: JobContext): Promise<unknown> {
  const p = StudioCapturePayloadSchema.safeParse(ctx.job.payload);
  if (!p.success) throw new PermanentJobError("bad studio_capture payload");
  const { sessionId, userMessageId, assistantMessageId, url, paths, notes, aspect } = p.data;
  const { db, storage } = ctx;
  const session = await db.studioSession.findUnique({ where: { id: sessionId } });
  const asst = await db.studioMessage.findUnique({ where: { id: assistantMessageId } });
  const userMsg = await db.studioMessage.findUnique({ where: { id: userMessageId } });
  if (!session || !asst || !userMsg) throw new PermanentJobError("session or message not found");
  if (asst.status === "cancelled") return { skipped: "cancelled" };
  if (asst.status !== "queued" || (asst.jobId && asst.jobId !== ctx.job.id)) return { skipped: "already queued" };

  const ev = (rows: Array<{ type: string; data: object }>) => db.studioEvent.createMany({ data: rows.map((r) => ({ sessionId, messageId: assistantMessageId, type: r.type, data: r.data })) }).catch(() => undefined);
  await ev([{ type: "status", data: { phase: "looking" satisfies StudioPhase, label: "Recording your product" } }, { type: "tool", data: { label: "Opening your site to record it" } }]);

  const dir = await mkdtemp(join(ctx.config.scratchDir, "studio-capture-"));
  try {
    let rec: CaptureResult | null = null;
    try {
      await assertPublicUrl(url);
      const ff = await ffmpegPath();
      if (!ff) throw new Error("ffmpeg missing");
      const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(STUDIO_CAPTURE_LIMITS.totalMs)]);
      const browser = await ctx.shared.renderBrowser();
      let lastStep = "";
      rec = await recordSite({
        browser, url, ...(paths ? { paths } : {}), aspect, outDir: dir, ffmpeg: ff, signal, guard: guardRoute,
        onStep: (label) => { if (label !== lastStep) { lastStep = label; void ev([{ type: "tool", data: { label } }]); } },
        log: (msg, data) => log("warn", msg, data),
      });
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      log("warn", "studio capture failed", { url, error: errMsg(e) });
    }
    if (!rec || rec.clips.length === 0) return await failCapture(ctx, sessionId, assistantMessageId);

    // Store: clips (video), page screenshots and the logo (images), each a ready upload on this session.
    const footage: StudioLaunchInfo["footage"] = [];
    const ids: string[] = [];
    const items = [
      ...rec.clips.map((c) => ({ file: c.file, filename: c.filename, shows: c.shows, mime: "video/mp4", seconds: c.seconds, width: c.width, height: c.height })),
      ...rec.shots.map((s) => ({ file: s.file, filename: s.filename, shows: s.shows, mime: "image/jpeg", seconds: null, width: null, height: null })),
      ...(rec.logo ? [{ file: rec.logo, filename: "site-logo.png", shows: "the logo as it appears on the site (cropped from the header)", mime: "image/png", seconds: null, width: null, height: null }] : []),
    ];
    for (const it of items) {
      const body = await readFile(it.file);
      const up = await db.studioUpload.create({ data: { workspaceId: session.workspaceId, userId: session.userId, sessionId, key: `pending-capture-${ctx.job.id}-${it.filename}`, filename: it.filename, mime: it.mime, bytes: body.length, status: "pending" } });
      const key = studioKeys.upload(session.workspaceId, up.id, it.filename);
      await storage.put(key, body, it.mime);
      let posterKey: string | null = null;
      let width = it.width, height = it.height;
      if (it.mime.startsWith("image/")) {
        const m = await sharp(body).metadata().catch(() => null);
        width = m?.width ?? null;
        height = m?.height ?? null;
      } else {
        const jpg = join(dir, `${up.id}-poster.jpg`);
        if (await posterFrame(it.file, jpg, it.seconds, ctx.signal)) {
          posterKey = posterKeyFor(key);
          await storage.put(posterKey, await readFile(jpg), "image/jpeg");
        }
      }
      await db.studioUpload.update({ where: { id: up.id }, data: { key, bytes: (await stat(it.file)).size, durationSec: it.seconds, width, height, posterKey, status: "ready" } });
      ids.push(up.id);
      footage.push({ filename: it.filename, shows: it.shows });
    }
    log("info", "studio capture ok", { url, clips: rec.clips.length, shots: rec.shots.length, logo: Boolean(rec.logo), pages: rec.pages.length });
    await ev([{ type: "tool", data: { label: `Recorded ${rec.clips.length} clip${rec.clips.length === 1 ? "" : "s"} of your product` } }]);

    const hasBrand = (await db.brandProfile.count({ where: { workspaceId: session.workspaceId } })) > 0;
    const launch: StudioLaunchInfo = { url, aspect, footage, ...(notes ? { notes } : {}), ...(!hasBrand ? { brand: { ...(rec.brand.name ? { name: rec.brand.name } : {}), colors: rec.brand.colors } } : {}) };
    const turn: StudioTurnPayload = { sessionId, userMessageId, assistantMessageId, launch };
    const priority = (await db.adJob.findUnique({ where: { id: ctx.job.id }, select: { priority: true } }))?.priority ?? 0;
    const prior = Array.isArray(userMsg.attachments) ? userMsg.attachments : [];
    const jobId = await db.$transaction(async (tx) => {
      const m = await tx.studioMessage.findUnique({ where: { id: assistantMessageId }, select: { jobId: true, status: true } });
      if (!m || m.status !== "queued" || (m.jobId && m.jobId !== ctx.job.id)) return null;
      await tx.studioMessage.update({ where: { id: userMessageId }, data: { attachments: [...prior, ...ids.map((uploadId) => ({ uploadId }))] as object[] } });
      const job = await tx.adJob.create({ data: { type: STUDIO_TURN_JOB_TYPE, workspaceId: session.workspaceId, payload: { ...turn } as object, priority, maxAttempts: 2 } });
      await tx.studioMessage.update({ where: { id: assistantMessageId }, data: { jobId: job.id } });
      return job.id;
    });
    return { ok: true, clips: rec.clips.length, shots: rec.shots.length, turnJobId: jobId };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function failCapture(ctx: JobContext, sessionId: string, assistantMessageId: string) {
  const { db } = ctx;
  await db.studioEvent.createMany({
    data: [
      { sessionId, messageId: assistantMessageId, type: "status", data: { phase: "error", label: "Couldn't open your site" } },
      { sessionId, messageId: assistantMessageId, type: "error", data: { message: CAPTURE_FAILED_MESSAGE, code: "capture_failed" } },
      { sessionId, messageId: assistantMessageId, type: "done", data: { messageId: assistantMessageId } },
    ],
  });
  await db.studioMessage.update({ where: { id: assistantMessageId }, data: { status: "error", content: CAPTURE_FAILED_MESSAGE, error: "capture_failed" } });
  await db.studioSession.update({ where: { id: sessionId }, data: { status: "idle", lastActivityAt: new Date() } });
  return { ok: false, reason: "capture_failed" };
}
