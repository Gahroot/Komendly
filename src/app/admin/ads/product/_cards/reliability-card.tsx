import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RELIABILITY_EVENT, type ReliabilitySnapshot } from "@/lib/product-intel/reliability";
import { prisma } from "@/lib/prisma";

const sec = (ms: number | null) => (ms === null ? "n/a" : `${Math.round(ms / 1000)}s`);

export async function ReliabilityCard() {
  const row = await prisma.adsEvent.findFirst({ where: { name: RELIABILITY_EVENT }, orderBy: { createdAt: "desc" }, select: { props: true } });
  const s = row?.props as unknown as ReliabilitySnapshot | undefined;
  return (
    <Card>
      <CardHeader><CardTitle>Reliability (sys_reliability)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!s ? <p>No snapshot yet: flag off or not run.</p> : (
          <>
            <p>
              SLO (&gt;= {Math.round(s.slo.target * 100)}% of packs with &gt;= 8 ads in 10 min): {s.slo.insufficient ? `not enough packs (${s.slo.sample})` : `${((s.slo.rate ?? 0) * 100).toFixed(1)}% of ${s.slo.sample}`}
              {s.slo.breached ? " · BREACHED" : ""}. First ad p50 {sec(s.timeToFirstAdMs.p50)} / p90 {sec(s.timeToFirstAdMs.p90)}; full pack p50 {sec(s.timeToPackMs.p50)} / p90 {sec(s.timeToPackMs.p90)}.
            </p>
            <p>Retried jobs {s.retries.retriedJobs}/{s.retries.jobs} · zombies {s.zombies} · stuck queued {s.stuckQueued} · partial packs {s.partialPacks.n}/{s.partialPacks.of}. Busiest workspace holds {Math.round(s.blast.topShare * 100)}% of {s.blast.activeJobs} active jobs{s.blast.flagged ? " (flagged)" : ""}.</p>
            <p className="font-medium">Findings</p>
            <ul className="list-disc pl-5">{(s.findings.length ? s.findings : []).map((f) => <li key={f.key}>{f.title}. <span className="text-muted-foreground">{f.detail}</span></li>)}{s.findings.length ? null : <li>None.</li>}</ul>
            <p className="font-medium">Worst stages</p>
            <ul className="list-disc pl-5 text-muted-foreground">{s.failureByStage.slice(0, 4).map((r) => <li key={r.key}>{r.key}: {(r.rate * 100).toFixed(0)}% failed ({r.failed}/{r.n})</li>)}</ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
