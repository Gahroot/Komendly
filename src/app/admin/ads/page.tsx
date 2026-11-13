import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatPct, formatSeconds } from "@/lib/ads/billing-format";
import { loadAdsOverview } from "@/lib/ads/metrics-queries";
import { AdminAdsShell } from "./_components/admin-ads-shell";
import { RunsChart } from "./_components/runs-chart";
import { StatCard } from "./_components/stat-card";
import { AdminEmpty } from "../_components/admin-empty";

export const dynamic = "force-dynamic";

export default async function AdminAdsOverviewPage() {
  return (
    <AdminAdsShell title="Overview" description="Revenue, conversion, speed and quality over the last 30 days.">
      <Overview />
    </AdminAdsShell>
  );
}

async function Overview() {
  const o = await loadAdsOverview();
  const ttfaBad = o.ttfa.p50 !== null && o.ttfa.p50 > o.ttfa.targetSeconds;
  const recentCohorts = o.conversion.cohorts.slice(-8).reverse();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="MRR" value={formatCents(o.mrrCents)} hint="Placeholder list prices" />
        <StatCard label="Active subscribers" value={String(o.activeSubscribers)} hint={`ARPU ${formatCents(o.arpuCents)}`} />
        <StatCard label="Monthly churn" value={formatPct(o.churnRate30d)} hint={`${o.churned30d} churned in 30d`} tone={o.churnRate30d > 0.08 ? "bad" : "default"} />
        <StatCard label="Trial → paid (30d window)" value={formatPct(o.conversion.overall)} hint="Last 90 days of trials" />
        <StatCard
          label="Time to first ad p50 / p90"
          value={`${formatSeconds(o.ttfa.p50)} / ${formatSeconds(o.ttfa.p90)}`}
          hint={`Target ${formatSeconds(o.ttfa.targetSeconds)} · ${o.ttfa.samples} runs`}
          tone={ttfaBad ? "bad" : "good"}
        />
        <StatCard label="QC pass rate" value={formatPct(o.qcPassRate)} />
        <StatCard label="Run failure rate" value={formatPct(o.failureRate)} tone={(o.failureRate ?? 0) > 0.05 ? "bad" : "default"} />
        <StatCard
          label="Avg cost / ad · gross margin"
          value={`${o.avgCostPerAdUsd === null ? "—" : `$${o.avgCostPerAdUsd.toFixed(3)}`} · ${formatPct(o.grossMargin)}`}
          hint={`Cost $${o.cost30dUsd.toFixed(2)} vs revenue ${formatCents(o.revenue30dCents)} (target ≥ 70%)`}
          tone={o.grossMargin !== null && o.grossMargin < 0.7 ? "bad" : "default"}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Runs per day</CardTitle>
            <CardDescription>{o.runs30d} runs in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <RunsChart data={o.runsPerDay} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Trial conversion by cohort week</CardTitle>
            <CardDescription>trial_started → paid_converted within 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week of</TableHead>
                  <TableHead className="text-right">Trials</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCohorts.map((c) => (
                  <TableRow key={c.week}>
                    <TableCell>{c.week}{c.matured ? "" : " *"}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.trials}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.converted}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPct(c.rate)}</TableCell>
                  </TableRow>
                ))}
                {recentCohorts.length === 0 && (
                  <TableRow><TableCell colSpan={4}><AdminEmpty>No trials yet.</AdminEmpty></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">* window still open</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
