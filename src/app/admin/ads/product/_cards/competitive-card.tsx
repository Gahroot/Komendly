import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCompetitiveData } from "@/lib/product-intel/competitive";

export async function CompetitiveCard() {
  const d = buildCompetitiveData(new Date().toISOString().slice(0, 10));
  return (
    <Card>
      <CardHeader><CardTitle>Competitive scorecard (public facts only; n/v = not verified)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="grid gap-1 md:grid-cols-2">{d.entrants.map((e) => <li key={e.slug}>{e.name}: {e.card.total === null ? "not verified" : `${e.card.total}/100`} <span className="text-muted-foreground">(coverage {e.card.coverage}%)</span></li>)}</ul>
        <div><p className="font-medium">Where alternatives win</p><ul className="list-disc pl-5 text-muted-foreground">{(d.positioning.theyWin.length ? d.positioning.theyWin : ["None found on verified facts."]).map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><p className="font-medium">Underserved</p><ul className="list-disc pl-5 text-muted-foreground">{(d.positioning.underserved.length ? d.positioning.underserved : ["None identified."]).map((x) => <li key={x}>{x}</li>)}</ul></div>
        <p className="text-xs text-muted-foreground">Full table + evidence: docs/product/competitive.md (regenerate with <code>npx tsx scripts/competitive-scan.ts</code>).</p>
      </CardContent>
    </Card>
  );
}
