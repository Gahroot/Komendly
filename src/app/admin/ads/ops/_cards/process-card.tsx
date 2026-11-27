// Process improvement card for /admin/ads/ops (standalone: the page imports and renders <ProcessCard />).
// Measures outcomes (recurrence, owner interventions, time to resolve), not the number of automations.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadProcessAnalysis } from "@/lib/ops/qa/process-load";
import { prisma } from "@/lib/prisma";

const mins = (m: number | null) => (m === null ? "n/a" : m < 120 ? `${m} min` : `${Math.round(m / 60)} h`);

export async function ProcessCard() {
  const a = await loadProcessAnalysis(prisma).catch(() => null);
  if (!a) return <Card><CardHeader><CardTitle>Process improvement</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Not available yet (could not read the events).</CardContent></Card>;
  const row = (label: string, cur: string | number, prev: string | number) => <tr key={label}><td className="py-1 pr-4 text-muted-foreground">{label}</td><td className="py-1 pr-4 font-medium">{cur}</td><td className="py-1 text-muted-foreground">{prev}</td></tr>;
  return (
    <Card>
      <CardHeader><CardTitle>Process improvement: {a.verdict.replace("_", " ")}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <table><thead><tr className="text-left text-xs text-muted-foreground"><th className="pr-4">Outcome</th><th className="pr-4">Last 28 days</th><th>Before</th></tr></thead><tbody>
          {row("Recurrence rate (repeat incident keys)", `${Math.round(a.current.recurrenceRate * 100)}%`, `${Math.round(a.previous.recurrenceRate * 100)}%`)}
          {row("Owner interventions per week", a.current.interventionsPerWeek, a.previous.interventionsPerWeek)}
          {row("Mean time to resolve", mins(a.current.meanTimeToResolveMin), mins(a.previous.meanTimeToResolveMin))}
          {row("Mean time to detect", mins(a.current.meanTimeToDetectMin), mins(a.previous.meanTimeToDetectMin))}
        </tbody></table>
        {a.findings.length === 0 ? <p className="text-muted-foreground">No repeated problems in the window.</p> : (
          <ol className="list-decimal space-y-2 pl-5">
            {a.findings.slice(0, 5).map((f) => <li key={f.key}><span className="font-medium">{f.title}</span> <span className="text-muted-foreground">({f.evidence})</span><br />Permanent fix: {f.proposedFix}</li>)}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
