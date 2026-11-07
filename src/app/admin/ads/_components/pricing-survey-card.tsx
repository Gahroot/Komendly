import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pricingSurveySchema } from "@/lib/ads/pricing-survey-schema";
import { computeVanWestendorp, type VwResponse } from "@/lib/ads/van-westendorp";
import { prisma } from "@/lib/prisma";

const MIN_RESPONSES = 10;

function usd(v: number | null): string {
  return v === null ? "—" : `$${v.toFixed(2)}`;
}

export async function PricingSurveyCard() {
  const rows = await prisma.adsEvent.findMany({ where: { name: "pricing_survey" }, select: { props: true }, orderBy: { createdAt: "asc" } });
  const responses: VwResponse[] = rows.flatMap((r) => {
    const parsed = pricingSurveySchema.safeParse(r.props);
    return parsed.success ? [parsed.data] : [];
  });
  const vw = computeVanWestendorp(responses);
  const points = [
    { label: "Marginal cheapness (PMC)", value: vw.pmc },
    { label: "Optimal price (OPP)", value: vw.opp },
    { label: "Indifference price (IPP)", value: vw.ipp },
    { label: "Marginal expensiveness (PME)", value: vw.pme },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing survey (Van Westendorp)</CardTitle>
        <CardDescription>{vw.count} responses from trial users · monthly USD</CardDescription>
      </CardHeader>
      <CardContent>
        {vw.count < MIN_RESPONSES ? (
          <p className="text-sm text-muted-foreground">Not enough responses yet (need {MIN_RESPONSES}+).</p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-4">
            {points.map((p) => (
              <div key={p.label}>
                <dt className="text-xs text-muted-foreground">{p.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{usd(p.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
