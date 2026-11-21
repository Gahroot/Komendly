// Loader for /reports/local-service-meta-ads and /ad-examples/longest-running/*. Source of truth = the committed
// snapshot (adlib-report-data.json, from scripts/build-adlib-report.ts). If the engine's monthly data_report cycle
// stored a newer, indexable recompute (EngineHeartbeat `report:adlib`), that wins; its empty leaderboards fall back
// to the snapshot's. Cached 1 day. Never throws.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { MIN_INDEXABLE_ADVERTISERS, type AdlibReport } from "./adlib-report";
import snapshot from "./adlib-report-data.json";

export const ADLIB_SNAPSHOT = snapshot as unknown as AdlibReport;

export function pickAdlibReport(snap: AdlibReport, fresh: unknown): AdlibReport {
  const f = fresh as Partial<AdlibReport> | null | undefined;
  if (!f || f.version !== 1 || typeof f.collectedOn !== "string" || !Array.isArray(f.leaderboards) || (f.advertisers ?? 0) < MIN_INDEXABLE_ADVERTISERS || f.collectedOn <= snap.collectedOn) return snap;
  const r = f as AdlibReport;
  return { ...r, leaderboards: r.leaderboards.map((l) => (l.entries.length ? l : (snap.leaderboards.find((s) => s.slug === l.slug) ?? l))) };
}

const loadFresh = unstable_cache(
  async () => (await prisma.engineHeartbeat.findUnique({ where: { id: "report:adlib" }, select: { meta: true } }))?.meta ?? null,
  ["adlib-report-v1"],
  { revalidate: 86400, tags: ["adlib-report"] },
);

export async function loadAdlibReport(): Promise<AdlibReport> {
  try {
    return pickAdlibReport(ADLIB_SNAPSHOT, await loadFresh());
  } catch {
    return ADLIB_SNAPSHOT;
  }
}
