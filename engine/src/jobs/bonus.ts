// Locked bonus ads (trial upsell). After a trial's free pack is final, the "bonus" job adds:
// - story: 9:16 Stories/Reels versions of the best ready statics (template re-render, or a cheap re-frame
//   of the same composed image: no new image generation);
// - motion: extra animated ads on new angles.
// Contract with the web app: normal Ad rows in the same run with visualBrief.locked = true and
// visualBrief.bonusKind = "story" | "motion"; full assets as usual AdAsset rows plus one AdAsset with
// ratio "preview" (JPEG ~540px wide, lower 60% heavily blurred; motion: from the poster frame).
// Bonus ads hold no credits, never count toward the pack, never get replaced, and when all are
// terminal an AdsEvent "bonus_ready" {runId, count} is emitted once.
import type { Prisma } from "@prisma/client";
import sharp from "sharp";
import type { Db } from "../db";
import { log } from "../log";
import { enqueue } from "../queue/queue";
import type { Storage } from "../storage/s3";
import { runKey } from "../storage/keys";
import { PermanentJobError, type JobContext } from "./context";
import { loadMotionModule } from "./modules";
import { planBonusMotion } from "./plan";
import { qcObj } from "./replace";
import { BONUS_PRIORITY, bonusCounts, bonusEnabled, bonusKindOf, isLocked } from "./trial-fill";

const TERMINAL = new Set(["ready", "failed_qc", "failed"]);
export const PREVIEW_WIDTH = 540;

/** Ready statics ranked best first: passed QC on the first try, then earliest in the run. */
export function rankForStories<T extends { id: string; kind: string; status: string; qcAttempts: number; index: number; qcReport: unknown; visualBrief: unknown }>(ads: T[]): T[] {
  return ads
    .filter((a) => a.kind === "static" && a.status === "ready" && !isLocked(a.visualBrief) && !qcObj(a.qcReport).replacedBy)
    .sort((a, b) => a.qcAttempts - b.qcAttempts || a.index - b.index || a.id.localeCompare(b.id));
}

/** bonus job: plan the locked ads (idempotent: no-op when the run already has bonus ads). */
export async function bonusJob(ctx: JobContext): Promise<unknown> {
  const { db, job } = ctx;
  if (!job.runId) throw new PermanentJobError("bonus job without runId");
  const run = await db.adRun.findUnique({ where: { id: job.runId }, include: { brandProfile: true, ads: true } });
  if (!run) throw new PermanentJobError("run not found");
  if (!run.isTrial || !bonusEnabled()) return { skipped: "bonus disabled" };
  if (!["completed", "partial"].includes(run.status)) return { skipped: `run status ${run.status}` };
  if (run.ads.some((a) => isLocked(a.visualBrief))) return { skipped: "bonus already planned" };
  const counts = bonusCounts();
  let next = Math.max(0, ...run.ads.map((a) => a.index)) + 1;
  const rows: Array<Prisma.AdUncheckedCreateInput & { jobType: "render_static" | "render_motion" }> = [];

  for (const src of rankForStories(run.ads).slice(0, counts.stories)) {
    const vb = (src.visualBrief as Record<string, unknown> | null) ?? {};
    rows.push({
      jobType: "render_static",
      runId: run.id, workspaceId: run.workspaceId, kind: "static", index: next++, awareness: src.awareness, angle: src.angle, hook: src.hook,
      headline: src.headline, body: src.body, cta: src.cta, claims: src.claims as Prisma.InputJsonValue,
      visualBrief: { ...vb, locked: true, bonusKind: "story", bonusOf: src.id } as Prisma.InputJsonValue,
      status: "planned",
    });
  }
  if (counts.motion > 0) {
    const mod = await loadMotionModule();
    const av = mod.ok ? await mod.mod.availability().catch(() => ({ ok: false })) : { ok: false };
    if (av.ok) {
      const specs = await planBonusMotion(ctx, run, counts.motion, next).catch((e: unknown) => {
        log("warn", "bonus motion plan failed", { runId: run.id, error: e instanceof Error ? e.message : String(e) });
        return [];
      });
      for (const spec of specs) {
        rows.push({
          jobType: "render_motion",
          runId: run.id, workspaceId: run.workspaceId, kind: "motion", index: spec.index, awareness: spec.awareness, angle: spec.angle, hook: spec.hook,
          headline: spec.headline, body: spec.body ?? null, cta: spec.cta ?? null, claims: spec.claims as unknown as Prisma.InputJsonValue,
          visualBrief: { ...spec.visual, spec, locked: true, bonusKind: "motion" } as unknown as Prisma.InputJsonValue,
          status: "planned",
        });
      }
    }
  }
  if (rows.length === 0) {
    await emitBonusReady(db, run.id);
    return { bonus: 0 };
  }
  await db.$transaction(async (tx) => {
    for (const { jobType, ...data } of rows) {
      const ad = await tx.ad.create({ data, select: { id: true } });
      await enqueue(tx, { type: jobType, runId: run.id, adId: ad.id, workspaceId: run.workspaceId, priority: BONUS_PRIORITY });
    }
  });
  return { bonus: rows.length, stories: rows.filter((r) => r.jobType === "render_static").length, motion: rows.filter((r) => r.jobType === "render_motion").length };
}

/** Stories frame for a 4:5/1:1 ad: the ad scaled inside the 9:16 safe zone over a blurred, dimmed copy of itself. */
export async function storyFrame(src: Buffer, width = 1080, height = 1920): Promise<Buffer> {
  const fgW = Math.round(width * 0.85);
  const fg = await sharp(src).resize({ width: fgW }).png().toBuffer();
  const fgH = (await sharp(fg).metadata()).height ?? fgW;
  const bg = await sharp(src).resize(width, height, { fit: "cover" }).blur(40).modulate({ brightness: 0.55 }).png().toBuffer();
  // Reels/Stories UI covers the top 14% and bottom 20%: keep the ad between them.
  const top = Math.max(Math.round(height * 0.14), Math.round((height * 0.94 - fgH) / 2));
  return sharp(bg).composite([{ input: fg, left: Math.round((width - fgW) / 2), top }]).png().toBuffer();
}

/** Locked preview: ~540px wide JPEG, top 40% sharp, lower 60% heavily blurred. */
export async function lockedPreview(src: Buffer, width = PREVIEW_WIDTH): Promise<{ jpg: Buffer; width: number; height: number }> {
  const small = await sharp(src).resize({ width }).png().toBuffer();
  const h = (await sharp(small).metadata()).height ?? width;
  const keep = Math.round(h * 0.4);
  const top = await sharp(small).extract({ left: 0, top: 0, width, height: Math.max(1, keep) }).png().toBuffer();
  const blurred = await sharp(small).blur(24).png().toBuffer();
  const jpg = await sharp(blurred).composite([{ input: top, left: 0, top: 0 }]).jpeg({ quality: 80 }).toBuffer();
  return { jpg, width, height: h };
}

/** Writes the "preview" AdAsset of a ready locked ad from its 9:16 image (story) or poster frame (motion). */
export async function addPreview(db: Db, storage: Storage, adId: string, now: Date, ttlDays: number): Promise<boolean> {
  const ad = await db.ad.findUnique({ where: { id: adId }, include: { assets: true } });
  if (!ad || !isLocked(ad.visualBrief) || ad.status !== "ready") return false;
  const src = ad.kind === "motion"
    ? ad.assets.find((a) => a.ratio === "poster")
    : (ad.assets.find((a) => a.ratio === "9:16" && a.mime === "image/png") ?? ad.assets.find((a) => a.mime.startsWith("image/") && a.ratio !== "preview"));
  if (!src) return false;
  const { jpg, width, height } = await lockedPreview(await storage.get(src.storageKey));
  const key = runKey(ad.workspaceId, ad.runId, "ads", ad.id, `preview-${Date.now()}.jpg`);
  await storage.put(key, jpg, "image/jpeg");
  const old = ad.assets.filter((a) => a.ratio === "preview");
  await db.$transaction([
    db.adAsset.deleteMany({ where: { adId: ad.id, ratio: "preview" } }),
    db.adAsset.create({ data: { adId: ad.id, ratio: "preview", storageKey: key, mime: "image/jpeg", width, height, bytes: jpg.length, expiresAt: new Date(now.getTime() + ttlDays * 86_400_000) } }),
  ]);
  if (old.length) await storage.deleteRunObjects(old.map((o) => o.storageKey));
  return true;
}

/** Locked ad reached a terminal state: write its preview (when ready), then emit bonus_ready once all are terminal. */
export async function onBonusTerminal(db: Db, storage: Storage, adId: string, now: Date, ttlDays: number): Promise<void> {
  const ad = await db.ad.findUnique({ where: { id: adId }, select: { runId: true, status: true, visualBrief: true } });
  if (!ad || !bonusKindOf(ad.visualBrief)) return;
  if (ad.status === "ready") await addPreview(db, storage, adId, now, ttlDays);
  await emitBonusReady(db, ad.runId);
}

/** Emits AdsEvent bonus_ready {runId, count} once, when every locked ad of the run is terminal. */
export async function emitBonusReady(db: Db, runId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"bonus:" + runId}))`;
    const ads = (await tx.ad.findMany({ where: { runId }, select: { status: true, visualBrief: true } })).filter((a) => isLocked(a.visualBrief));
    if (ads.some((a) => !TERMINAL.has(a.status))) return false;
    if (await tx.adsEvent.findFirst({ where: { runId, name: "bonus_ready" }, select: { id: true } })) return false;
    const run = await tx.adRun.findUnique({ where: { id: runId }, select: { workspaceId: true, userId: true } });
    if (!run) return false;
    const count = ads.filter((a) => a.status === "ready").length;
    await tx.adsEvent.create({ data: { name: "bonus_ready", workspaceId: run.workspaceId, userId: run.userId, runId, props: { runId, count } } });
    return true;
  });
}
