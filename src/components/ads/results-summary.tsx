// "Are my ads working?" on the weekly drop card: the latest Meta results report (growth system meta_results).
// Numbers only from the Marketing API (stored by engine/src/growth/meta-results.ts); no report = renders nothing.
import { prisma } from "@/lib/prisma";
import { systemEnabled } from "@/lib/growth/systems";
import { parseStoredReport, latestReportSince, resultsText, RESULTS_EVENT } from "@/lib/ads/results/insights";

export async function ResultsSummary({ workspaceId }: { workspaceId: string }) {
  if (!(await systemEnabled(prisma, "meta_results"))) return null;
  const ev = await prisma.adsEvent.findFirst({ where: { name: RESULTS_EVENT, workspaceId, createdAt: { gte: latestReportSince() } }, orderBy: { createdAt: "desc" }, select: { props: true } });
  const report = parseStoredReport((ev?.props as { report?: unknown } | null)?.report);
  if (!report) return null;
  const t = resultsText(report);
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Are my ads working?</p>
      <p className="text-sm">{t.headline}</p>
      {t.ads.length > 1 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{t.ads.slice(0, 5).map((a) => <li key={a}>{a}</li>)}</ul>
      ) : null}
      {t.changes.map((c) => <p key={c} className="text-sm">{c}</p>)}
      <p className="text-xs text-muted-foreground">{t.note}</p>
    </div>
  );
}
