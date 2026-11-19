// Read-only loader for /reports/facebook-ad-statistics (cached 1 day; the page also uses ISR).
import { unstable_cache } from "next/cache";
import { loadInternalIds } from "@/lib/internal-accounts";
import { prisma } from "@/lib/prisma";
import { buildAdReport, type AdReport, type ReportRunInput } from "./ad-report";

async function load(): Promise<AdReport> {
  const [internal, runs] = await Promise.all([
    loadInternalIds(),
    prisma.adRun.findMany({
      where: { status: "completed", completedAt: { not: null } },
      select: {
        id: true, kind: true, userId: true, completedAt: true, resolvedGoal: true, goal: true, extraction: true,
        ads: { where: { status: "ready", kind: "static" }, select: { headline: true, hook: true, cta: true, awareness: true, assets: { select: { ratio: true } } } },
      },
    }),
  ]);
  const internalUsers = new Set(internal.userIds);
  const input: ReportRunInput[] = runs.map((r) => {
    const ex = (r.extraction ?? {}) as { domain?: unknown; url?: unknown; colors?: unknown };
    return {
      id: r.id, kind: r.kind, ownerInternal: internalUsers.has(r.userId), completedAt: r.completedAt!,
      domain: typeof ex.domain === "string" ? ex.domain : typeof ex.url === "string" ? ex.url : null,
      goal: r.resolvedGoal ?? (r.goal === "auto" ? null : r.goal),
      colors: Array.isArray(ex.colors) ? (ex.colors as ReportRunInput["colors"]) : [],
      ads: r.ads.map((a) => ({ headline: a.headline, hook: a.hook, cta: a.cta, awareness: a.awareness, ratios: a.assets.map((x) => x.ratio) })),
    };
  });
  return buildAdReport(input);
}

const cached = unstable_cache(load, ["ad-report-v1"], { revalidate: 86400, tags: ["ad-report"] });

/** Never throws: a DB hiccup yields an empty (noindex) report instead of a broken page. */
export async function loadAdReport(): Promise<AdReport> {
  try {
    return await cached();
  } catch (e) {
    console.error("[ad-report] load failed", e);
    return buildAdReport([]);
  }
}
