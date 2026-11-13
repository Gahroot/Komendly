// studio_ingest job ("Remix any ad"): fetch the ad behind a link into a StudioUpload, probe it like an upload,
// then queue the remix studio_turn. Platform links (YouTube, TikTok, Instagram, Facebook, X) go through yt-dlp
// when it is installed; everything else (and yt-dlp misses) is fetched directly, or via the page's
// og:video / twitter:player:stream / og:image. Every direct fetch is SSRF-guarded (public http(s) only).
import { access, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import sharp from "sharp";
import {
  STUDIO_INGEST_LIMITS,
  STUDIO_REMIX_LINK_FAILED,
  STUDIO_TURN_JOB_TYPE,
  StudioIngestPayloadSchema,
  studioKeys,
  type StudioPhase,
  type StudioTurnPayload,
} from "../../../src/lib/studio/contracts";
import { PermanentJobError, type JobContext } from "../jobs/context";
import { errMsg, log } from "../log";
import { ffmpegPath, run } from "../modules/ezmotion/runtime";
import { assertPublicUrl, safeFetch } from "../net/ssrf";
import { posterFrame, probeMedia } from "./media";
import { posterKeyFor } from "./probe";

const PLATFORM_HOSTS = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|fb\.com|x\.com|twitter\.com|vimeo\.com|threads\.net|linkedin\.com|snapchat\.com|pinterest\.com)$/i;

export function isPlatformUrl(url: string): boolean {
  try {
    return PLATFORM_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};
const MIME_BY_EXT: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/webm", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/** Media type from a Content-Type header, falling back to the URL's extension. Null = not media. */
export function mediaTypeOf(contentType: string, url: string): string | null {
  const ct = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ct.startsWith("video/") || ct.startsWith("image/")) return ct === "image/jpg" ? "image/jpeg" : ct;
  if (ct && ct !== "application/octet-stream" && ct !== "binary/octet-stream") return null;
  const ext = /\.([a-z0-9]{2,4})$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] ?? null : null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/gi, "/");
}

/** Media links a page advertises, best first: og:video variants, twitter:player:stream, then og:image / twitter:image. */
export function extractOgMedia(html: string, base: string): string[] {
  const metas = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content && !metas.has(key)) metas.set(key, decodeEntities(content.trim()));
  }
  const order = ["og:video:secure_url", "og:video:url", "og:video", "twitter:player:stream", "og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"];
  const out: string[] = [];
  for (const k of order) {
    const v = metas.get(k);
    if (!v) continue;
    try {
      const abs = new URL(v, base).toString();
      if (/^https?:/.test(abs) && !out.includes(abs)) out.push(abs);
    } catch { /* bad url */ }
  }
  return out;
}

/** yt-dlp from YTDLP_PATH, else PATH. Null when not installed (then the direct/og fallback is used). */
export async function ytDlpPath(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const cands = [env.YTDLP_PATH?.trim(), ...(env.PATH ?? "").split(delimiter).filter(Boolean).map((d) => join(d, "yt-dlp"))].filter((c): c is string => !!c);
  for (const c of cands) {
    if (await access(c, constants.X_OK).then(() => true, () => false)) return c;
  }
  return null;
}

interface Fetched { file: string; mime: string; via: "yt-dlp" | "direct" | "page" }

async function viaYtDlp(bin: string, url: string, dir: string, signal: AbortSignal): Promise<Fetched | null> {
  const mb = Math.floor(STUDIO_INGEST_LIMITS.maxBytes / (1024 * 1024));
  const r = await run(bin, [
    "--ignore-config", "--no-playlist", "--no-progress", "--no-warnings", "--quiet", "--no-cache-dir", "--no-mtime", "--extractor-retries", "2",
    "--max-filesize", `${mb}M`, "--socket-timeout", "20", "--retries", "2",
    "-f", "b[ext=mp4][height<=1920]/bv*[ext=mp4][height<=1920]+ba[ext=m4a]/bv*[height<=1920]+ba/b",
    "--merge-output-format", "mp4",
    ...((await ffmpegPath()) ? ["--ffmpeg-location", (await ffmpegPath()) as string] : []),
    "-o", join(dir, "yt.%(ext)s"), url,
  ], { signal, timeoutMs: STUDIO_INGEST_LIMITS.timeoutMs });
  const files = (await readdir(dir)).filter((f) => f.startsWith("yt.") && !/\.(part|ytdl|temp)$/.test(f));
  const f = files[0];
  if (r.code !== 0 || !f) {
    log("warn", "studio ingest: yt-dlp failed", { code: r.code, error: (r.stderr || r.stdout).slice(-300) });
    return null;
  }
  const ext = f.split(".").pop()?.toLowerCase() ?? "mp4";
  return { file: join(dir, f), mime: MIME_BY_EXT[ext] ?? "video/mp4", via: "yt-dlp" };
}

async function directMedia(url: string, dir: string, signal: AbortSignal, depth = 0): Promise<Fetched | null> {
  const res = await safeFetch(url, { maxBytes: STUDIO_INGEST_LIMITS.maxBytes, timeoutMs: STUDIO_INGEST_LIMITS.timeoutMs, signal });
  if (res.status >= 400) return null;
  const mime = mediaTypeOf(res.contentType, res.url);
  if (mime) {
    const file = join(dir, `direct-${depth}`);
    await writeFile(file, res.body);
    return { file, mime, via: depth ? "page" : "direct" };
  }
  if (depth > 0 || !/html|xml/i.test(res.contentType)) return null;
  for (const media of extractOgMedia(res.body.toString("utf8"), res.url).slice(0, 4)) {
    const got = await directMedia(media, dir, signal, depth + 1).catch(() => null);
    if (got) return got;
  }
  return null;
}

/** Download the ad behind a link. Null when nothing usable was found. */
export async function fetchReference(url: string, dir: string, signal: AbortSignal): Promise<Fetched | null> {
  await assertPublicUrl(url);
  if (isPlatformUrl(url)) {
    const bin = await ytDlpPath();
    if (bin) {
      const got = await viaYtDlp(bin, url, dir, signal);
      if (got) return got;
    }
  }
  return directMedia(url, dir, signal);
}

/** Probe + cap a fetched file. Video longer than the cap keeps its first maxSeconds. */
async function prepare(f: Fetched, dir: string, signal: AbortSignal) {
  const bytes = (await stat(f.file)).size;
  if (bytes === 0 || bytes > STUDIO_INGEST_LIMITS.maxBytes) return null;
  if (f.mime.startsWith("image/")) {
    const m = await sharp(f.file, { animated: false }).metadata().catch(() => null);
    if (!m?.width || !m.height) return null;
    // GIF/other image types become a PNG still so every tool can read them.
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.mime)) {
      const png = join(dir, "still.png");
      await sharp(f.file, { animated: false }).png().toFile(png);
      return { file: png, mime: "image/png", ext: "png", width: m.width, height: m.height, durationSec: null, poster: png };
    }
    return { file: f.file, mime: f.mime, ext: EXT_BY_MIME[f.mime] ?? "jpg", width: m.width, height: m.height, durationSec: null, poster: f.file };
  }
  let file = f.file;
  let info = await probeMedia(file, signal);
  if (!info?.hasVideo) return null;
  let mime = f.mime;
  if ((info.durationSec ?? 0) > STUDIO_INGEST_LIMITS.maxSeconds) {
    const ff = await ffmpegPath();
    if (!ff) return null;
    const cut = join(dir, "cut.mp4");
    const r = await run(ff, ["-y", "-v", "error", "-i", file, "-t", String(STUDIO_INGEST_LIMITS.maxSeconds), "-c", "copy", "-movflags", "+faststart", cut], { signal, timeoutMs: 120_000 });
    if (r.code !== 0) return null;
    file = cut;
    mime = "video/mp4";
    info = await probeMedia(file, signal);
    if (!info?.hasVideo) return null;
  }
  const jpg = join(dir, "poster.jpg");
  const poster = (await posterFrame(file, jpg, info.durationSec, signal)) ? jpg : null;
  return { file, mime, ext: EXT_BY_MIME[mime] ?? "mp4", width: info.width, height: info.height, durationSec: info.durationSec, poster };
}

export async function studioIngestJob(ctx: JobContext): Promise<unknown> {
  const p = StudioIngestPayloadSchema.safeParse(ctx.job.payload);
  if (!p.success) throw new PermanentJobError("bad studio_ingest payload");
  const { uploadId, url, sessionId, userMessageId, assistantMessageId } = p.data;
  const { db, storage } = ctx;
  const up = await db.studioUpload.findUnique({ where: { id: uploadId } });
  const asst = await db.studioMessage.findUnique({ where: { id: assistantMessageId } });
  if (!up || !asst) throw new PermanentJobError("upload or message not found");
  if (asst.status === "cancelled") {
    await db.studioUpload.update({ where: { id: uploadId }, data: { status: "failed" } });
    return { skipped: "cancelled" };
  }
  const ws = await db.adsWorkspace.findUniqueOrThrow({ where: { id: up.workspaceId }, select: { id: true } });

  const ev = (rows: Array<{ type: string; data: object }>) => db.studioEvent.createMany({ data: rows.map((r) => ({ sessionId, messageId: assistantMessageId, type: r.type, data: r.data })) });
  if (up.status !== "ready") {
    await ev([{ type: "status", data: { phase: "looking" satisfies StudioPhase, label: "Opening the ad" } }, { type: "tool", data: { label: "Opening the ad you sent" } }]).catch(() => undefined);
    const dir = await mkdtemp(join(ctx.config.scratchDir, "studio-ingest-"));
    try {
      const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(STUDIO_INGEST_LIMITS.timeoutMs + 60_000)]);
      let prepared: Awaited<ReturnType<typeof prepare>> = null;
      let via = "";
      try {
        const got = await fetchReference(url, dir, signal);
        if (got) { via = got.via; prepared = await prepare(got, dir, signal); }
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        log("warn", "studio ingest fetch failed", { url, error: errMsg(e) });
      }
      if (!prepared) return await failIngest(ctx, p.data);
      const filename = `reference.${prepared.ext}`;
      const key = studioKeys.upload(ws.id, uploadId, filename);
      await storage.put(key, await readFile(prepared.file), prepared.mime);
      let posterKey: string | null = null;
      if (prepared.poster) {
        posterKey = posterKeyFor(key);
        const buf = prepared.mime.startsWith("image/") ? await sharp(prepared.poster).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer() : await readFile(prepared.poster);
        await storage.put(posterKey, buf, "image/jpeg");
      }
      const bytes = (await stat(prepared.file)).size;
      await db.studioUpload.update({ where: { id: uploadId }, data: { key, filename, mime: prepared.mime, bytes, durationSec: prepared.durationSec, width: prepared.width, height: prepared.height, posterKey, status: "ready" } });
      log("info", "studio ingest ok", { uploadId, via, mime: prepared.mime, bytes, durationSec: prepared.durationSec });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  // Queue the remix turn (once: the assistant message's jobId is the guard).
  const turn: StudioTurnPayload = { sessionId, userMessageId, assistantMessageId };
  const priority = (await db.adJob.findUnique({ where: { id: ctx.job.id }, select: { priority: true } }))?.priority ?? 0;
  const jobId = await db.$transaction(async (tx) => {
    const m = await tx.studioMessage.findUnique({ where: { id: assistantMessageId }, select: { jobId: true, status: true } });
    if (!m || m.status !== "queued" || (m.jobId && m.jobId !== ctx.job.id)) return null;
    const job = await tx.adJob.create({ data: { type: STUDIO_TURN_JOB_TYPE, workspaceId: ws.id, payload: { ...turn }, priority, maxAttempts: 2 } });
    await tx.studioMessage.update({ where: { id: assistantMessageId }, data: { jobId: job.id } });
    return job.id;
  });
  return { ok: true, turnJobId: jobId };
}

/** Friendly failure: the chat shows the "upload a screen recording" message and the session is free again. */
async function failIngest(ctx: JobContext, o: { uploadId: string; sessionId: string; assistantMessageId: string }) {
  const { db } = ctx;
  await db.studioUpload.update({ where: { id: o.uploadId }, data: { status: "failed" } });
  await db.studioEvent.createMany({
    data: [
      { sessionId: o.sessionId, messageId: o.assistantMessageId, type: "status", data: { phase: "error", label: "Couldn't open the link" } },
      { sessionId: o.sessionId, messageId: o.assistantMessageId, type: "error", data: { message: STUDIO_REMIX_LINK_FAILED, code: "link_failed" } },
      { sessionId: o.sessionId, messageId: o.assistantMessageId, type: "done", data: { messageId: o.assistantMessageId } },
    ],
  });
  await db.studioMessage.update({ where: { id: o.assistantMessageId }, data: { status: "error", content: STUDIO_REMIX_LINK_FAILED, error: "link_failed" } });
  await db.studioSession.update({ where: { id: o.sessionId }, data: { status: "idle", lastActivityAt: new Date() } });
  return { ok: false, reason: "link_failed" };
}
