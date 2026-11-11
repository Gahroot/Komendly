import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatPct } from "@/lib/ads/billing-format";
import { parseFunnelQuery } from "@/lib/ads/funnel-queries";
import { loadGrowthOverview } from "@/lib/ads/growth-queries";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { StatCard } from "../_components/stat-card";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function AdminGrowthPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = parseFunnelQuery(await searchParams);
  return (
    <AdminAdsShell title="Growth loops" description="Referrals, gift packs and partners: what they bring in, and what they cost.">
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">From<input className="rounded border bg-background px-2 py-1" type="date" name="from" defaultValue={day(from)} /></label>
        <label className="grid gap-1">To<input className="rounded border bg-background px-2 py-1" type="date" name="to" defaultValue={day(new Date(to.getTime() - 1))} /></label>
        <button className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground" type="submit">Apply</button>
      </form>
      <Growth from={from} to={to} />
    </AdminAdsShell>
  );
}

async function Growth({ from, to }: { from: Date; to: Date }) {
  const g = await loadGrowthOverview(from, to);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Referral sign-ups" value={String(g.referralSignups)} hint={`${g.rejected} rejected (self/same network)`} />
        <StatCard label="Trials done (referred)" value={String(g.referralTrials)} />
        <StatCard label="Rewards granted" value={String(g.rewardsGranted)} hint={`${g.rewardCredits} credits`} />
        <StatCard label="Reward credits expired" value={String(g.creditsExpired)} />
        <StatCard label="Gift packs made" value={String(g.giftsMade)} hint={`${g.giftsViewed} viewed · ${g.giftsClaimed} claimed`} />
        <StatCard label="Gift cost" value={formatCents(Math.round(g.giftCostMicros / 1e4))} hint={g.giftsMade ? `${formatCents(Math.round(g.giftCostMicros / 1e4 / g.giftsMade))} per pack` : undefined} />
        <StatCard label="Partner sign-ups" value={String(g.partnerSignups)} hint={`${formatCents(g.partnerRevenueCents)} revenue · ${formatCents(g.partnerCommissionCents)} commission`} />
        <StatCard label="Commissions owed" value={formatCents(g.commissionsOwedCents)} hint="pending + payable, all time" tone={g.commissionsOwedCents ? "bad" : "default"} />
      </div>
      <Card>
        <CardHeader><CardTitle>By channel (sign-ups in range, first touch)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Sign-ups</TableHead><TableHead className="text-right">Trial done</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Sign-up → paid</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
            <TableBody>
              {g.channels.map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.row?.signedUp ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.row?.trialFinished ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.row?.paid ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPct(c.row?.signedUp ? c.row.paid / c.row.signedUp : null)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(c.row?.revenueCents ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">Channels come from the first-touch UTM set by /r/&lt;code&gt; (utm_source=referral, utm_medium referral | gift | partner). Full breakdown: <Link className="underline" href="/admin/ads/funnel?by=channel">Funnel</Link>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
