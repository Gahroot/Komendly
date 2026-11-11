// Brand memory across runs: what this workspace already got for the same website, so month 2 is not
// month 1 again (new angles and headlines, least-used photos first, rotated scenes and hook formats,
// and the image-diversity check also compares against earlier runs).
import type { JobContext } from "./context";

export interface BrandHistory {
  /** Earlier finished runs for this website in this workspace (0 = first run). */
  priorRuns: number;
  headlines: string[];
  angles: string[];
  /** Photo use so far, by file name (asset keys differ per run; the content-hash file name does not). */
  photoUse: Map<string, number>;
  /** Perceptual hashes of earlier composed statics (newest first). */
  hashes: string[];
}

export const EMPTY_HISTORY: BrandHistory = { priorRuns: 0, headlines: [], angles: [], photoUse: new Map(), hashes: [] };

/** "https://www.shop.Example.com/x" -> "shop.example.com" (www stripped). Null when unparseable. */
export function siteKey(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function photoName(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

type HistoryAd = { headline: string | null; angle: string | null; visualBrief: unknown; createdAt?: Date };

/** Pure: fold earlier runs' ready ads into a history (exported for tests). */
export function foldHistory(runs: Array<{ ads: HistoryAd[] }>): BrandHistory {
  const h: BrandHistory = { priorRuns: runs.length, headlines: [], angles: [], photoUse: new Map(), hashes: [] };
  for (const r of runs) {
    for (const a of r.ads) {
      if (a.headline) h.headlines.push(a.headline);
      if (a.angle) h.angles.push(a.angle);
      const vb = (a.visualBrief ?? {}) as { assetKeys?: unknown; render?: { hash?: unknown } };
      for (const k of Array.isArray(vb.assetKeys) ? vb.assetKeys : []) {
        if (typeof k === "string") h.photoUse.set(photoName(k), (h.photoUse.get(photoName(k)) ?? 0) + 1);
      }
      if (typeof vb.render?.hash === "string" && vb.render.hash) h.hashes.push(vb.render.hash);
    }
  }
  return h;
}

/** Earlier runs (newest first, max 6) for the same website in the same workspace. */
export async function loadBrandHistory(db: JobContext["db"], run: { id: string; workspaceId: string; url: string; createdAt: Date }): Promise<BrandHistory> {
  const site = siteKey(run.url);
  if (!site) return EMPTY_HISTORY;
  const candidates = await db.adRun.findMany({
    // Gift runs (ads made for someone else's site) never count as the sender's own brand history.
    where: { workspaceId: run.workspaceId, id: { not: run.id }, kind: { not: "gift" }, createdAt: { lt: run.createdAt }, status: { in: ["completed", "partial", "generating"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, url: true },
  });
  const same = candidates.filter((c) => siteKey(c.url) === site).slice(0, 6);
  if (!same.length) return EMPTY_HISTORY;
  const ads = await db.ad.findMany({
    where: { runId: { in: same.map((r) => r.id) }, status: "ready" },
    orderBy: { createdAt: "desc" },
    select: { runId: true, headline: true, angle: true, visualBrief: true },
  });
  return foldHistory(same.map((r) => ({ ads: ads.filter((a) => a.runId === r.id) })));
}

/**
 * Planner block: what already ran. Freshness must never cost quality (tested: forcing least-used photos and
 * brand-new angles swapped signature products for plain ones and produced weak hooks), so: keep the brand's
 * strongest selling points and best photos, vary the buyer moment, headline and scene; photo history only
 * breaks ties. Empty for a first run.
 */
export function historyPrompt(h: BrandHistory, assets: Array<{ key: string }>): string {
  if (!h.priorRuns) return "";
  const uses = assets.map((a) => ({ key: a.key, n: h.photoUse.get(photoName(a.key)) ?? 0 }));
  return [
    `THIS BRAND ALREADY RAN ${h.priorRuns} EARLIER SET(S). Make this set feel fresh WITHOUT getting weaker:`,
    `- Quality first: still lead with the brand's signature product/service and its strongest selling points, even if earlier ads did too.`,
    `- What must change: the buyer moment, the hook and the headline wording. Never reuse or lightly reword these earlier headlines:`,
    ...h.headlines.slice(0, 40).map((x) => `  • ${x}`),
    `- Photos: always pick the photo that best shows the real offering for each ad. Only when two photos fit equally well, prefer the one used less before:`,
    ...uses.map((u) => `  key=${u.key} used ${u.n}x before`),
  ].join("\n");
}

/** Hook-format offset for this run, so slot N doesn't get the same hook format every month. */
export function hookOffset(h: BrandHistory): number {
  return (h.priorRuns * 3) % 10;
}

/** Scene offset for composed statics, so slot N gets a different scene every month. */
export function sceneOffset(h: BrandHistory): number {
  return h.priorRuns;
}
