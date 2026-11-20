import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/ads/billing-format";
import { workspaceLabels } from "@/lib/ads/growth-queries";
import { SCORE_CHANNELS, SCORE_CHANNEL_LABEL } from "@/lib/ads/scoreboard";
import { loadScoreboard } from "@/lib/ads/scoreboard-queries";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { StatCard } from "../_components/stat-card";

export const dynamic = "force-dynamic";

export default function AdminScoreboardPage() {
  return (
    <AdminAdsShell title="Scoreboard" description="Goal: 10 paying self-serve customers by 31 Jan 2027. Sign-ups and payments by channel, by week (UTC, weeks start Monday). Internal and test accounts excluded.">
      <Scoreboard />
    </AdminAdsShell>
  );
}

async function Scoreboard() {
  const s = await loadScoreboard();
  const labels = await workspaceLabels(s.recentPayments.map((p) => p.workspaceId));
  const paying = s.checkpoints.find((c) => c.key === "paying")?.live ?? "0";
  const revenue = SCORE_CHANNELS.reduce((t, c) => t + s.totals.revenueCents[c], 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Paying customers" value={`${paying} / 10`} tone={Number(paying) > 0 ? "good" : "default"} />
        <StatCard label="Sign-ups, all time" value={String(s.totalSignups)} />
        <StatCard label="New-payment revenue" value={formatCents(revenue)} hint="first checkouts and conversions; renewals excluded" />
      </div>

      <Card>
        <CardHeader><CardTitle>Checkpoints (plan section 7)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Plan (20 Nov)</TableHead><TableHead>Live</TableHead><TableHead>15 December</TableHead><TableHead>31 January</TableHead></TableRow></TableHeader>
            <TableBody>
              {s.checkpoints.map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell className="text-muted-foreground">{c.plan}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{c.live}</TableCell>
                  <TableCell className={c.met?.dec15 ? "text-primary" : undefined}>{c.dec15}{c.met?.dec15 ? " ✓" : ""}</TableCell>
                  <TableCell className={c.met?.jan31 ? "text-primary" : undefined}>{c.jan31}{c.met?.jan31 ? " ✓" : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">Verified leads available = Kly leads with a valid address not emailed yet. Emails per day = real Kly sequence sends over the last 7 full days. Ads live = paying workspaces with a published Meta ad.</p>
        </CardContent>
      </Card>

      <WeekTable title="Sign-ups by channel" weeks={s.weeks.map((w) => ({ week: w.week, counts: w.signups, total: w.signupTotal }))} totals={s.totals.signups} />
      <WeekTable title="Payments by channel" weeks={s.weeks.map((w) => ({ week: w.week, counts: w.payments, total: w.paymentTotal, extra: formatCents(w.revenueCents) }))} totals={s.totals.payments} extraLabel="Revenue" />

      <Card>
        <CardHeader><CardTitle>Latest payments</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Workspace</TableHead><TableHead>What</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {s.recentPayments.map((p) => (
                <TableRow key={`${p.workspaceId}-${p.at.toISOString()}`}>
                  <TableCell>{p.at.toISOString().slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell>{labels.get(p.workspaceId)?.email || p.workspaceId}</TableCell>
                  <TableCell>{p.what}</TableCell>
                  <TableCell>{formatCents(p.amountCents)}</TableCell>
                </TableRow>
              ))}
              {s.recentPayments.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No real payments yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

type Counts = Record<(typeof SCORE_CHANNELS)[number], number>;

function WeekTable({ title, weeks, totals, extraLabel }: { title: string; weeks: { week: string; counts: Counts; total: number; extra?: string }[]; totals: Counts; extraLabel?: string }) {
  const all = SCORE_CHANNELS.reduce((t, c) => t + totals[c], 0);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week of</TableHead>
              {SCORE_CHANNELS.map((c) => <TableHead key={c}>{SCORE_CHANNEL_LABEL[c]}</TableHead>)}
              <TableHead>Total</TableHead>
              {extraLabel && <TableHead>{extraLabel}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...weeks].reverse().map((w) => (
              <TableRow key={w.week}>
                <TableCell className="font-medium">{w.week}</TableCell>
                {SCORE_CHANNELS.map((c) => <TableCell key={c} className={w.counts[c] ? "tabular-nums" : "text-muted-foreground tabular-nums"}>{w.counts[c]}</TableCell>)}
                <TableCell className="font-semibold tabular-nums">{w.total}</TableCell>
                {extraLabel && <TableCell className="tabular-nums">{w.extra}</TableCell>}
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-medium">All time</TableCell>
              {SCORE_CHANNELS.map((c) => <TableCell key={c} className="font-semibold tabular-nums">{totals[c]}</TableCell>)}
              <TableCell className="font-semibold tabular-nums">{all}</TableCell>
              {extraLabel && <TableCell />}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
