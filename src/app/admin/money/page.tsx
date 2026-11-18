import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminUser } from "@/lib/ads/billing-auth";
import { loadMoneyDashboard } from "@/lib/growth/money-queries";
import type { ChannelRow, Period } from "@/lib/growth/money";
import { PostActionButton } from "../ads/_components/post-action-button";
import { AdminEmpty } from "../_components/admin-empty";

export const dynamic = "force-dynamic";

const usd = (c: number | null) => (c === null ? "—" : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: c % 100 ? 2 : 0 })}`);
const when = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 16).replace("T", " ") : "—");
const PERIOD_LABEL: Record<Period, string> = { today: "Today", week: "This week", all: "All time" };
const HEALTH_VARIANT = { healthy: "default", off: "secondary", never_ran: "outline", failing: "destructive", stalled: "destructive", silent: "destructive" } as const;

export default async function AdminMoneyPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  if (!(await getAdminUser())) return <AdminEmpty>Admins only.</AdminEmpty>;
  const { range } = await searchParams;
  const period: Period = range === "today" || range === "week" ? range : "all";
  const d = await loadMoneyDashboard(period);
  const [today] = d.periods;
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Money</h1>
        <p className="text-sm text-muted-foreground">Paying customers across both billing systems (Website2ads + Testimonials), where they came from, and whether every growth system is running. UTC.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s paying customers: {today.payingCustomers} ({today.newPayingCustomers} new)</CardTitle>
          <CardDescription>{usd(today.revenueCents)} today</CardDescription>
        </CardHeader>
        <CardContent>
          {d.today.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet today.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>What</TableHead><TableHead>Amount</TableHead><TableHead>Billing</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.today.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.at.toISOString().slice(11, 16)}</TableCell>
                    <TableCell>{p.who} {p.firstPayment && <Badge>new</Badge>}</TableCell>
                    <TableCell>{p.what}</TableCell>
                    <TableCell>{usd(p.amountCents)}</TableCell>
                    <TableCell>{p.billing === "ads" ? "Website2ads" : "Testimonials"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.channel}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        {d.periods.map((p) => (
          <Card key={p.period}>
            <CardHeader><CardDescription>{PERIOD_LABEL[p.period]}</CardDescription><CardTitle>{p.payingCustomers} paying · {p.newPayingCustomers} new</CardTitle></CardHeader>
            <CardContent className="text-sm">Revenue {usd(p.revenueCents)} <span className="text-muted-foreground">(ads {usd(p.byBilling.ads)} · testimonials {usd(p.byBilling.testimonials)})</span></CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardDescription>Recurring (MRR)</CardDescription><CardTitle>{usd(d.mrr.totalCents)}</CardTitle></CardHeader>
          <CardContent className="text-sm">{d.mrr.subscribers} subscribers <span className="text-muted-foreground">(ads {usd(d.mrr.byBilling.ads)} · testimonials {usd(d.mrr.byBilling.testimonials)})</span></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recovered, lost, won back</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Checkouts recovered</TableHead><TableHead>Customers lost</TableHead><TableHead>Won back</TableHead><TableHead>Failed payments now</TableHead></TableRow></TableHeader>
            <TableBody>{d.recovery.map((r) => <TableRow key={r.period}><TableCell>{PERIOD_LABEL[r.period]}</TableCell><TableCell>{r.recovered}</TableCell><TableCell>{r.lost}</TableCell><TableCell>{r.wonBack}</TableCell><TableCell>{r.failedPayments}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funnel by source ({PERIOD_LABEL[period]})</CardTitle>
          <CardDescription>
            {(["today", "week", "all"] as const).map((r) => <Link key={r} href={`/admin/money?range=${r}`} className={`mr-3 underline ${r === period ? "font-semibold" : ""}`}>{PERIOD_LABEL[r]}</Link>)}
            Meta spend: {d.spendStatus === "ok" ? "live" : d.spendStatus}. Other channels cost $0. Testimonial-only buyers have no sign-up event, so they show in totals, not here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FunnelTable title="By channel" rows={d.byChannel} />
          <FunnelTable title="By growth system" rows={d.bySystem} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System health</CardTitle>
          <CardDescription>
            Monitor: <Badge variant={d.monitor.health === "healthy" ? "default" : "destructive"}>{d.monitor.health}</Badge> last run {when(d.monitor.beat?.lastRunAt ?? null)}, {d.monitor.beat?.alertsSent ?? 0} alerts sent{d.monitor.beat?.lastError ? `, error: ${d.monitor.beat.lastError}` : ""}.
            {" "}Codex: <Badge variant={d.codex.problem ? "destructive" : "default"}>{d.codex.problem ?? "ok"}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>System</TableHead><TableHead>Health</TableHead><TableHead>Last run</TableHead><TableHead>Last output</TableHead><TableHead>Outputs</TableHead><TableHead>Last error</TableHead><TableHead>Switch</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.health.map((h) => (
                <TableRow key={h.key}>
                  <TableCell>{h.label}<div className="font-mono text-xs text-muted-foreground">sys_{h.key}</div></TableCell>
                  <TableCell><Badge variant={HEALTH_VARIANT[h.health]}>{h.health}</Badge>{h.alertedAt && <div className="text-xs text-destructive">alerted {when(h.alertedAt)}</div>}</TableCell>
                  <TableCell>{when(h.lastRunAt)}</TableCell>
                  <TableCell>{when(h.lastOutputAt)}</TableCell>
                  <TableCell>{h.outputs}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">{h.lastError ?? "—"}</TableCell>
                  <TableCell>
                    <PostActionButton url="/api/admin/growth/systems" body={{ key: h.key, enabled: !h.enabled }} label={h.enabled ? "Turn off" : "Turn on"} variant={h.enabled ? "outline" : "default"}
                      confirm={{ title: `${h.enabled ? "Disable" : "Enable"} ${h.label}?`, description: "Takes effect on the system's next cycle." }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelTable({ title, rows }: { title: string; rows: ChannelRow[] }) {
  return (
    <div>
      <h3 className="mb-2 font-medium">{title}</h3>
      <Table>
        <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Visitors</TableHead><TableHead>Sign-ups</TableHead><TableHead>Free ads</TableHead><TableHead>Checkouts</TableHead><TableHead>Paying</TableHead><TableHead>Spend</TableHead><TableHead>Cost / paying</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-mono text-xs">{r.key}</TableCell><TableCell>{r.visitors}</TableCell><TableCell>{r.signups}</TableCell><TableCell>{r.freeAds}</TableCell>
              <TableCell>{r.checkouts}</TableCell><TableCell>{r.paying}</TableCell><TableCell>{usd(r.spendCents)}</TableCell><TableCell>{usd(r.costPerPayingCents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
