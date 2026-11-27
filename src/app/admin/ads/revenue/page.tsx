import { readFile } from "node:fs/promises";
import path from "node:path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/ads/billing-format";
import { needsYou, parseLearnings, type Opportunity } from "@/lib/growth/ecosystem";
import { nextActions } from "@/lib/revenue/digest";
import type { Rate } from "@/lib/revenue/economics";
import { loadRevenueDashboard } from "@/lib/revenue/queries";
import registryJson from "../../../../../docs/revenue/registry.json";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { StatCard } from "../_components/stat-card";

export const dynamic = "force-dynamic";
type Cap = { id: string; area: number; name: string; status: string; evidence: string; owner_action: string };
const registry = registryJson as unknown as (Cap & Opportunity)[];

const pct = (r: Rate) => (r.value === null ? "n/a" : `${(r.value * 100).toFixed(1)}% (${r.successes}/${r.n}${r.lo !== null ? `, 95%: ${(r.lo * 100).toFixed(0)}-${((r.hi ?? 0) * 100).toFixed(0)}%` : ""}) · ${r.confidence}`);
const money = (m: { cents: number | null; confidence: string }) => `${m.cents === null ? "n/a" : formatCents(m.cents)} · ${m.confidence}`;

export default function RevenuePage() {
  return (
    <AdminAdsShell title="Revenue command center" description="Where the business is, the one thing to fix, the unit economics (with how sure we are), experiments, and what the system does next. Internal/test accounts excluded. Small samples: read rates as rough.">
      <Revenue />
    </AdminAdsShell>
  );
}

async function Revenue() {
  const d = await loadRevenueDashboard();
  const s = d.live, e = s.economics, top = s.constraints[0];
  const learnings = parseLearnings(await readFile(path.join(process.cwd(), "docs", "revenue", "learnings.md"), "utf8").catch(() => "")).reverse().slice(0, 8);
  const needs = needsYou(registry);
  const running = d.experiments.filter((x) => !x.concluded).length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Stage" value={s.stage.roadmap} hint={s.stage.label} />
        <StatCard label="Paying customers" value={String(e.payingCustomers)} hint={`${formatCents(e.revenue.allTimeCents)} lifetime`} tone={e.payingCustomers ? "good" : "default"} />
        <StatCard label="MRR" value={formatCents(e.mrrCents.cents ?? 0)} hint={e.mrrCents.confidence} />
        <StatCard label="Net cash (window)" value={formatCents(e.cashFlow.netCents)} hint={`${e.windowDays} days · ${e.cashFlow.confidence}`} tone={e.cashFlow.netCents < 0 ? "bad" : "default"} />
      </div>
      <Card>
        <CardHeader><CardTitle>#1 constraint: {top?.label ?? "none"}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{top?.evidence}</p><p className="text-muted-foreground">Confidence: {top?.confidence}. Do: {top?.action}</p>
          <ol className="list-decimal pl-5 text-muted-foreground">{s.constraints.slice(1).map((c) => <li key={c.key}>{c.label}: severity {c.severity}x, {c.confidence} (n={c.n})</li>)}</ol>
          <p className="text-xs text-muted-foreground">Benchmarks are generic assumptions; small samples are shrunk toward them. Severity = how many times better the funnel would be if only this step hit its benchmark.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Not yet ({s.stage.roadmap})</CardTitle></CardHeader>
        <CardContent className="text-sm"><ul className="list-disc pl-5">{s.stage.notYet.map((n) => <li key={n}>{n}</li>)}</ul><p className="mt-2 text-muted-foreground">Next milestone: {s.stage.nextMilestone}</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Funnel by channel (last {e.windowDays} days, first touch)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Sign-ups</TableHead><TableHead className="text-right">Visit→sign-up</TableHead><TableHead className="text-right">Activated</TableHead><TableHead className="text-right">Bought</TableHead><TableHead className="text-right">Upsell shown / bought</TableHead><TableHead className="text-right">Subscribers</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">CAC</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow className="font-medium"><TableCell>All channels</TableCell><TableCell className="text-right">{e.funnel.visitors}</TableCell><TableCell className="text-right">{e.funnel.signups}</TableCell><TableCell className="text-right">{pct(e.rates.visitToSignup)}</TableCell><TableCell className="text-right">{e.funnel.activated}</TableCell><TableCell className="text-right">{e.funnel.firstPurchases}</TableCell><TableCell className="text-right">{e.funnel.upsellShown} / {e.funnel.upsellBought}</TableCell><TableCell className="text-right">{e.funnel.subscribers}</TableCell><TableCell className="text-right">{formatCents(e.costs.acquisitionCents)}</TableCell><TableCell className="text-right">{money(e.cacCents)}</TableCell></TableRow>
              {e.byChannel.map((c) => (
                <TableRow key={c.channel}><TableCell>{c.channel}</TableCell><TableCell className="text-right">{c.visitors}</TableCell><TableCell className="text-right">{c.signups}</TableCell><TableCell className="text-right">{c.signupRate.value === null ? "n/a" : `${(c.signupRate.value * 100).toFixed(1)}%`}</TableCell><TableCell className="text-right">{c.activated}</TableCell><TableCell className="text-right">{c.firstPurchases}</TableCell><TableCell className="text-right">{c.upsellShown} / {c.upsellBought}</TableCell><TableCell className="text-right">{c.subscribers}</TableCell><TableCell className="text-right">{formatCents(c.spendCents)}</TableCell><TableCell className="text-right">{money(c.cacCents)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground"><li>Sign-up→finished pack: {pct(e.rates.signupToActivated)}</li><li>Finished pack→bought: {pct(e.rates.activatedToPurchase)}</li><li>Upsell shown→bought: {pct(e.rates.upsellShownToBought)}</li><li>Day-30 retention: {pct(e.rates.day30Retention)}</li></ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Unit economics</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm md:grid-cols-2">
          <p>CAC: {money(e.cacCents)}</p><p>First-sale margin (after CAC): {money(e.firstPurchaseMarginCents)}</p>
          <p>30-day payback: {e.payback30.ratio ?? "n/a"}x · {e.payback30.confidence}</p><p>LTV: {money(e.ltvCents)} ({e.ltvCents.basis})</p>
          <p>LTGP:CAC: {e.ltgpToCac.ratio ?? "n/a"} · {e.ltgpToCac.confidence}</p><p>Monthly churn: {pct(e.monthlyChurn)}</p>
          <p>Refunds: {e.refunds.count} ({formatCents(e.refunds.cents)})</p><p>Costs: generation {formatCents(e.costs.generationCents)}, Kly {formatCents(e.costs.klyCents)}, Meta {formatCents(e.costs.metaCents)}, infra {formatCents(e.costs.infraCents)}</p>
          <p className="text-xs text-muted-foreground md:col-span-2">{e.ltvCents.note} {e.cashFlow.note}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Experiments ({running} running)</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {d.experiments.length === 0 ? <p className="text-muted-foreground">None defined yet.</p> : d.experiments.map((x) => (
            <div key={x.key} className="mb-3"><p className="font-medium">{x.key} · {x.concluded ? `concluded (winner ${x.concluded.winner ?? "none"})` : "running"} · {x.evaluation.verdict}</p>
              <p className="text-muted-foreground">{x.counts.map((c) => `${c.variantId}: ${c.conversions}/${c.exposures} (prob. best ${((x.evaluation.probBest[c.variantId] ?? 0) * 100).toFixed(0)}%)`).join(" · ")}</p>
              <p className="text-xs text-muted-foreground">{x.evaluation.notes.join(" ")}</p></div>
          ))}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Needs you</CardTitle></CardHeader><CardContent className="text-sm"><ul className="list-disc pl-5">{needs.length ? needs.map((n) => <li key={n.id}>{n.name}: {n.owner_action}</li>) : <li>Nothing.</li>}</ul></CardContent></Card>
      <Card><CardHeader><CardTitle>What the system will do next</CardTitle></CardHeader><CardContent className="text-sm"><ul className="list-disc pl-5">{nextActions(s, d.flags, running).map((n) => <li key={n}>{n}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">Snapshots stored: {d.history.length}{d.history[0] ? ` (latest ${d.history[0].at.toISOString().slice(0, 10)})` : ""}. Weekly digest: {d.flags.digest ? "on" : "off"}.</p></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Learnings log</CardTitle></CardHeader>
        <CardContent><ul className="space-y-3 text-sm">{learnings.map((l) => <li key={l.date + l.title}><span className="font-medium">{l.date} [{l.kind.toLowerCase()}] {l.title}</span><p className="text-muted-foreground">{l.body}</p></li>)}</ul></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Revenue ecosystem registry</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Area</TableHead><TableHead>Capability</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{registry.map((o) => <TableRow key={o.id} title={o.evidence}><TableCell>{o.area}</TableCell><TableCell>{o.name}</TableCell><TableCell>{o.status}</TableCell></TableRow>)}</TableBody></Table></CardContent>
      </Card>
    </div>
  );
}
