import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/ads/billing-format";
import { systemEnabled } from "@/lib/growth/systems";
import { evaluateAll, needsInputCount, whoLabel } from "@/lib/ops/admin/obligations";
import { OBLIGATIONS } from "@/lib/ops/admin/data";
import { SPEND_AUTHORITY } from "@/lib/ops/finance/authority";
import { FIXED_ITEMS } from "@/lib/ops/finance/data";
import { loadFinance } from "@/lib/ops/finance/load";
import type { Pnl } from "@/lib/ops/finance/pnl";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { StatCard } from "../_components/stat-card";

export const dynamic = "force-dynamic";

const money = (c: number | null) => (c === null ? "unknown, needs your input" : formatCents(c));
const pct = (x: number | null) => (x === null ? "n/a" : `${x}%`);

export default function FinancePage() {
  return (
    <AdminAdsShell title="Finance & admin" description="P&L from the same ledgers as the revenue page (internal/test accounts excluded). Unknown costs are never guessed: they are listed as needing your input, so cost totals are a lower bound. Read-only: nothing here moves money.">
      <Finance />
    </AdminAdsShell>
  );
}

function PnlCard({ p }: { p: Pnl }) {
  return (
    <Card>
      <CardHeader><CardTitle>{p.label} <Badge variant="outline">{p.confidence}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Net revenue" value={formatCents(p.revenue.netCents)} hint={`gross ${formatCents(p.revenue.grossCents)}, refunds ${formatCents(p.revenue.refundsCents)}`} />
          <StatCard label="Gross margin" value={pct(p.grossMarginPct)} hint={`cost of revenue ${formatCents(p.costOfRevenue.totalCents)}`} />
          <StatCard label="Operating profit" value={formatCents(p.operatingProfitCents)} tone={p.operatingProfitCents < 0 ? "bad" : "good"} hint={`acquisition ${formatCents(p.acquisition.totalCents)}, fixed ${formatCents(p.fixedCents)}`} />
          <StatCard label="Burn / runway" value={`${formatCents(p.burnCents)} · ${p.runwayMonths === null ? "n/a" : `${p.runwayMonths} mo`}`} hint="runway needs FIN_CASH_CENTS" />
          <StatCard label="CAC" value={p.cacCents === null ? "n/a" : formatCents(p.cacCents)} hint="meta + kly spend / new customers" />
          <StatCard label="30-day payback" value={p.paybackRatio30 === null ? "n/a" : `${p.paybackRatio30}x`} hint="gross profit per new customer / CAC (>= 1 = paid back)" />
          <StatCard label="Refund rate" value={pct(p.refundRatePct)} />
          <StatCard label="Chargeback rate" value={pct(p.chargebackRatePct)} hint={p.revenue.chargebacksCents === null ? "not tracked" : undefined} />
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Cost of revenue</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow><TableCell>AI inference (AdRun cost)</TableCell><TableCell className="text-right">{money(p.costOfRevenue.aiCents)}</TableCell></TableRow>
            <TableRow><TableCell>FAL / media</TableCell><TableCell className="text-right">{money(p.costOfRevenue.mediaCents)}</TableCell></TableRow>
            <TableRow><TableCell>Email sending</TableCell><TableCell className="text-right">{money(p.costOfRevenue.emailCents)}</TableCell></TableRow>
            <TableRow><TableCell>Meta ad spend</TableCell><TableCell className="text-right">{money(p.acquisition.metaCents)}</TableCell></TableRow>
            <TableRow><TableCell>Kly cost</TableCell><TableCell className="text-right">{formatCents(p.acquisition.klyCents)}</TableCell></TableRow>
          </TableBody>
        </Table>
        {p.channels.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Sign-ups</TableHead><TableHead className="text-right">Payments</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Acquisition</TableHead><TableHead className="text-right">Contribution</TableHead></TableRow></TableHeader>
            <TableBody>{p.channels.map((c) => (
              <TableRow key={c.channel}><TableCell>{c.channel}</TableCell><TableCell className="text-right">{c.signups}</TableCell><TableCell className="text-right">{c.payments}</TableCell><TableCell className="text-right">{formatCents(c.revenueCents)}</TableCell><TableCell className="text-right">{c.acquisitionCents === null ? "unknown" : formatCents(c.acquisitionCents)}</TableCell><TableCell className="text-right">{formatCents(c.contributionCents)}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        )}
        {p.anomaly?.spike && <p className="text-sm text-destructive">Cost anomaly: {p.anomaly.reason} (z {p.anomaly.z}).</p>}
      </CardContent>
    </Card>
  );
}

async function Finance() {
  const now = new Date();
  const [f, finOn, adminOn] = await Promise.all([loadFinance(prisma, FIXED_ITEMS, now), systemEnabled(prisma, "finance_intel"), systemEnabled(prisma, "biz_admin")]);
  const hasRevenue = f.month.revenue.grossCents > 0 || f.week.revenue.grossCents > 0 || (await prisma.adsEvent.count({ where: { name: { in: ["purchased", "renewed", "paid_converted"] } } })) > 0;
  const obs = evaluateAll(OBLIGATIONS, now, { hasRevenue });
  const actionable = obs.filter((o) => o.state === "overdue" || o.state === "due_soon" || o.state === "unscheduled");
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Daily snapshots + Meta spend capture: <b>{finOn ? "ON" : "OFF"}</b> (flag sys_finance_intel). Weekly obligations digest: <b>{adminOn ? "ON" : "OFF"}</b> (sys_biz_admin). This page is computed live either way.</p>
      <PnlCard p={f.week} />
      <PnlCard p={f.month} />
      <Card>
        <CardHeader><CardTitle>Unknown, needs your input ({f.needsInput.length})</CardTitle></CardHeader>
        <CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{f.needsInput.map((n) => <li key={n}>{n}</li>)}{!f.needsInput.length && <li>Nothing missing.</li>}</ul>
          <p className="mt-2 text-xs text-muted-foreground">Fill docs/ops/fixed-costs.json (cents per month), or set INFRA_MONTHLY_CENTS, FIN_CASH_CENTS, FIN_EMAIL_CENTS_PER_SEND, FIN_MEDIA_MONTHLY_CENTS, META_ADS_TOKEN.</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Cancel / review candidates ({f.candidates.length})</CardTitle></CardHeader>
        <CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{f.candidates.map((c) => <li key={c.id}>{c.name}: {money(c.monthlyCents)} per month, {c.why}</li>)}{!f.candidates.length && <li>None.</li>}</ul></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Spending authority (owner-approved, change in code)</CardTitle></CardHeader>
        <CardContent className="text-sm">AI inference auto-allowed up to {formatCents(SPEND_AUTHORITY.aiInferenceDailyCapCents)}/day. New paid services: {formatCents(SPEND_AUTHORITY.newPaidServiceCents)} (always ask). Meta spend increases: {formatCents(SPEND_AUTHORITY.metaSpendIncreaseCents)} (always ask). Systems call checkSpend() first; it never moves money.</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Business administration ({actionable.length} need attention, {needsInputCount(obs)} without a date)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Obligation</TableHead><TableHead>Due</TableHead><TableHead>State</TableHead><TableHead>Who</TableHead></TableRow></TableHeader>
            <TableBody>{obs.filter((o) => o.state !== "done").map((o) => (
              <TableRow key={o.id}><TableCell>{o.title}{o.note && <span className="block text-xs text-muted-foreground">{o.note}</span>}</TableCell><TableCell>{o.due ?? "unknown, needs your input"}{o.dateApproximate ? " (approx.)" : ""}</TableCell><TableCell><Badge variant={o.state === "overdue" ? "destructive" : "outline"}>{o.state.replace("_", " ")}</Badge></TableCell><TableCell>{whoLabel(o)}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">Edit docs/ops/obligations.json. No legal or tax advice is given: "needs a professional" items go to your accountant/lawyer.</p>
        </CardContent>
      </Card>
    </div>
  );
}
