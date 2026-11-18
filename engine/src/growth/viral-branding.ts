// System #4 viral_branding (engine side): per-render mark decision + hourly health/attribution loop.
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import { markCode, shouldBrand, VIRAL_KEY } from "../../../src/lib/growth/viral-branding";
import type { Db } from "../db";
import type { Prisma } from "@prisma/client";
import { errMsg, log } from "../log";
import { applyMadeWithMark, markable } from "../render/made-with";

type MarkDb = {
  ad: { findUnique(a: { where: { id: string }; select: { visualBrief: true; assets: true } }): Promise<{ visualBrief: unknown; assets: Array<{ id: string; storageKey: string; mime: string; ratio: string }> } | null>; update(a: { where: { id: string }; data: { visualBrief: Prisma.InputJsonValue } }): Promise<unknown> };
  adAsset: { update(a: { where: { id: string }; data: { bytes: number } }): Promise<unknown> };
};
type MarkStorage = { get(key: string): Promise<Buffer>; put(key: string, body: Buffer, contentType: string): Promise<void> };

/**
 * After QC passed: stamp the mark onto the ad's delivered image files (in place) when the render recorded
 * branding.required. Idempotent: branding.applied = true means already marked (never double-mark). Each render
 * uploads fresh unmarked files with applied = false, so replace/revise re-renders are QC'd unmarked and marked once.
 * Never throws (a failure leaves applied = false, which the hourly health check reports).
 */
export async function markDeliveredAssets(db: MarkDb, storage: MarkStorage, adId: string): Promise<number> {
  try {
    const ad = await db.ad.findUnique({ where: { id: adId }, select: { visualBrief: true, assets: true } });
    const brief = (ad?.visualBrief ?? {}) as Record<string, unknown> & { branding?: { required?: boolean; applied?: boolean; code?: string | null } };
    const b = brief.branding;
    if (!ad || !b?.required || b.applied || !b.code) return 0;
    const files = ad.assets.filter(markable);
    for (const a of files) {
      const out = await applyMadeWithMark(await storage.get(a.storageKey), b.code);
      await storage.put(a.storageKey, out, a.mime);
      await db.adAsset.update({ where: { id: a.id }, data: { bytes: out.length } });
    }
    await db.ad.update({ where: { id: adId }, data: { visualBrief: { ...brief, branding: { ...b, applied: files.length > 0 } } as Prisma.InputJsonValue } });
    return files.length;
  } catch (e) {
    log("warn", "made-with mark failed", { adId, error: errMsg(e) });
    return 0;
  }
}

export interface BrandingPlan { required: boolean; code: string }

/** Decide whether a new static render of this run gets the "Made with Komendly" mark. Fails safe to "mark" for free workspaces. */
export async function brandingFor(db: Db, run: { id: string; workspaceId: string }, now: Date = new Date()): Promise<BrandingPlan> {
  const code = markCode(run.id);
  const systemOn = await systemEnabled(db, VIRAL_KEY);
  if (!systemOn) return { required: false, code };
  const [ws, setting] = await Promise.all([
    db.adsWorkspace.findUnique({ where: { id: run.workspaceId }, select: { adsPlan: true, subscriptionStatus: true, suspendedAt: true, unlimitedUntil: true } }),
    db.adsBrandingSetting.findUnique({ where: { workspaceId: run.workspaceId }, select: { removeBranding: true } }).catch(() => null),
  ]);
  if (!ws) return { required: false, code };
  return { required: shouldBrand({ systemOn, workspace: ws, removeBranding: setting?.removeBranding ?? null }, now), code };
}

type BriefBranding = { required?: boolean; applied?: boolean } | undefined;

/** Pure: static ads rendered in the window that should carry the mark but don't. */
export function unbrandedFree(ads: Array<{ kind: string; status?: string; visualBrief: unknown }>): number {
  return ads.filter((a) => {
    // Only delivered ads: renders waiting for QC are unmarked on purpose.
    if (a.kind !== "static" || a.status !== "ready") return false;
    const b = (a.visualBrief as { branding?: BriefBranding } | null)?.branding;
    return b?.required === true && b.applied !== true;
  }).length;
}

/** One hourly cycle: outputs = made_with visits + sign-ups in the last hour; fails when recent free renders lack the mark. */
export async function viralBrandingTick(db: Db, now: Date = new Date()): Promise<{ ok: boolean; outputs: number } | null> {
  if (!(await systemEnabled(db, VIRAL_KEY))) return null;
  try {
    const since = new Date(now.getTime() - 3_600_000);
    const [visits, signups, recent] = await Promise.all([
      db.adsEvent.count({ where: { name: "branded_share_visit", createdAt: { gte: since } } }),
      db.adsEvent.count({ where: { name: "signed_up", createdAt: { gte: since }, props: { path: ["firstTouch", "utm_source"], equals: "made_with" } } }),
      db.ad.findMany({ where: { kind: "static", assets: { some: { createdAt: { gte: since } } } }, select: { kind: true, status: true, visualBrief: true }, take: 500 }),
    ]);
    const missing = unbrandedFree(recent);
    const outputs = visits + signups;
    const ok = missing === 0;
    await recordSystemRun(db, VIRAL_KEY, { ok, outputs, error: ok ? null : `${missing} free render(s) in the last hour lack the Made with Komendly mark` }, now);
    log(ok ? "info" : "warn", "viral branding tick", { visits, signups, checked: recent.length, missing });
    return { ok, outputs };
  } catch (e) {
    await recordSystemRun(db, VIRAL_KEY, { ok: false, error: errMsg(e) }, now);
    return { ok: false, outputs: 0 };
  }
}

export function startViralBrandingLoop(db: Db, everyMs = 60 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    viralBrandingTick(db).catch((e: unknown) => log("warn", "viral branding tick failed", { error: errMsg(e) })).finally(() => (running = false));
  };
  const first = setTimeout(tick, 90_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
