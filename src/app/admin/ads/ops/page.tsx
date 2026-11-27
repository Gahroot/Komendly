import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { needsYou, type Opportunity } from "@/lib/growth/ecosystem";
import { aiBudgetThrottle, detectContention, priorityWeights, type ConstraintKey } from "@/lib/ops/control/coordination";
import { capacityModel, firstBinding } from "@/lib/ops/control/capacity";
import { loadLedger, latestProps } from "@/lib/ops/control/loader";
import { registryDiscrepancies } from "@/lib/ops/control/ledger";
import { prisma } from "@/lib/prisma";
import registryJson from "../../../../../docs/growth-ecosystem/registry.json";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { PostActionButton } from "../_components/post-action-button";

export const dynamic = "force-dynamic";
const registry = registryJson as unknown as (Opportunity & { flag?: string | null })[];
const NA = <span className="text-muted-foreground">Not available yet (nothing has written this snapshot).</span>;
const ago = (d: Date) => { const h = Math.round((Date.now() - d.getTime()) / 3_600_000); return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
type P = Record<string, unknown>;
const scalars = (p: P, n = 6) => Object.entries(p).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)).slice(0, n).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(" · ");
const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = { operational: "default", idle_by_design: "secondary", off: "outline", failing: "destructive", silent: "destructive", unproven: "secondary" };

export default function OpsPage() {
  return (
    <AdminAdsShell title="Ops command center" description="The nine questions an owner needs answered, from existing snapshots. 'Not available yet' means that part of the machine has not written data, which is itself worth knowing.">
      <Ops />
    </AdminAdsShell>
  );
}

function Q({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle className="text-base">{n}. {title}</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{children}</CardContent></Card>;
}

async function Ops() {
  const [l, rev, fin, funnel, infra, incident, outcome, optAct, optOwner, stopEv, resumeEv, decisions] = await Promise.all([
    loadLedger(prisma), latestProps(prisma, "revenue_snapshot"), latestProps(prisma, "finance_snapshot"), latestProps(prisma, "funnel_check"),
    latestProps(prisma, "infra_check"), latestProps(prisma, "incident"), latestProps(prisma, "reliability_snapshot"),
    prisma.adsEvent.findMany({ where: { name: "optimizer_action", createdAt: { gte: daysAgo(7) } }, orderBy: { createdAt: "desc" }, take: 5, select: { props: true } }).catch(() => []),
    prisma.adsEvent.findMany({ where: { name: "optimizer_owner_decision", createdAt: { gte: daysAgo(14) } }, orderBy: { createdAt: "desc" }, take: 5, select: { props: true } }).catch(() => []),
    latestProps(prisma, "ops_emergency_stop"), latestProps(prisma, "ops_emergency_resume"),
    prisma.adsEvent.findMany({ where: { name: "ops_decision" }, orderBy: { createdAt: "desc" }, take: 5, select: { props: true, createdAt: true } }).catch(() => []),
  ]);
  const discrepancies = registryDiscrepancies(registry, l.rows, l.facts.flags);
  const rp = rev?.props as { stage?: { roadmap: string; label: string }; economics?: { payingCustomers: number; mrrCents: { cents: number | null }; cashFlow: { netCents: number }; funnel?: P }; constraints?: Array<{ label: string; evidence: string; action: string; confidence: string }> } | undefined;
  const top = rp?.constraints?.[0];
  const constraintKey = ((rp?.constraints?.[0] as { key?: ConstraintKey } | undefined)?.key ?? null);
  const weights = priorityWeights(l.rows, constraintKey);
  const ai = l.facts.aiCalls7d ?? null;
  const proposals = [...detectContention({ queueDepth: l.facts.queue.queued, runningJobs: l.facts.queue.running, avgPackSeconds: null, reelsRendering: Boolean(l.facts.flags.sys_reels), packConcurrency: 2 }), ...(ai ? aiBudgetThrottle(ai, 5000, weights) : [])];
  const cap = capacityModel(), bind = firstBinding(cap);
  const stopped = stopEv && (!resumeEv || resumeEv.at < stopEv.at);
  const needs = [...optOwner.map((o) => String(((o.props ?? {}) as P).title ?? ((o.props ?? {}) as P).claim ?? "")).filter(Boolean), ...needsYou(registry).slice(0, 5).map((o) => `${o.name}: ${o.owner_action}`)];
  const bad = l.rows.filter((r) => r.status === "failing" || r.status === "silent");
  const money = (c: number | null | undefined) => (c == null ? "n/a" : `$${(c / 100).toFixed(0)}`);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Emergency stop</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={stopped ? "destructive" : "secondary"}>{stopped ? `outbound paused ${ago(stopEv.at)}` : "outbound running"}</Badge>
          <PostActionButton url="/api/admin/ops/emergency-stop" body={{ action: "stop" }} label="Pause all outbound" variant="destructive" confirm={{ title: "Pause all outbound?", description: "Turns off cold email, lifecycle email, reels, nurture, outreach and digests. Billing, delivery, replies and monitoring keep running. Reversible with Resume." }} />
          {stopped && <PostActionButton url="/api/admin/ops/emergency-stop" body={{ action: "resume" }} label="Resume" variant="outline" />}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Q n={1} title="Is the business functioning?">
          <p>{l.counts.operational} operational · {l.counts.idle_by_design} idle by design · {l.counts.off} off · <b>{l.counts.failing} failing</b> · <b>{l.counts.silent} silent</b> · {l.counts.unproven} unproven</p>
          <p>Funnel check: {funnel ? `${(funnel.props as P).ok ? "passing" : "FAILING"} (${ago(funnel.at)})` : NA}</p>
        </Q>
        <Q n={2} title="Are customers getting outcomes?">
          <p>Paying customers: {rp?.economics ? rp.economics.payingCustomers : NA}</p>
          <p>Delivery / reliability: {outcome ? `${scalars(outcome.props as P)} (${ago(outcome.at)})` : NA}</p>
        </Q>
        <Q n={3} title="Is acquisition producing activity?">
          <p>{rp?.economics?.funnel ? scalars(rp.economics.funnel, 8) : NA}</p>
        </Q>
        <Q n={4} title="Is it profitable?">
          <p>MRR {money(rp?.economics?.mrrCents.cents)} · net cash (window) {money(rp?.economics?.cashFlow.netCents)}</p>
          <p>Finance snapshot: {fin ? `${scalars(fin.props as P)} (${ago(fin.at)})` : NA}</p>
        </Q>
        <Q n={5} title="Which systems consume resources?">
          <p>Job queue: {l.facts.queue.queued} queued, {l.facts.queue.running} running.</p>
          <p>AI calls (7d): {ai ? Object.entries(ai).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(", ") : "not tracked yet (no `ai_call` events)"}</p>
          {proposals.map((p) => <p key={p.id}><b>{p.message}</b> {p.action}</p>)}
        </Q>
        <Q n={6} title="Which problems threaten performance?">
          {l.findings.filter((f) => f.severity !== "low").slice(0, 6).map((f) => <p key={f.id + f.kind}>• {f.message}</p>)}
          {incident ? <p>Latest incident: {scalars(incident.props as P)} ({ago(incident.at)})</p> : null}
          {infra ? <p>Infra check: {scalars(infra.props as P)} ({ago(infra.at)})</p> : <p>Infra check: {NA}</p>}
          {!l.findings.length && !incident && <p>No findings.</p>}
        </Q>
        <Q n={7} title="Current #1 constraint">
          {top ? <><p><b>{top.label}</b> ({top.confidence}): {top.evidence}</p><p className="text-muted-foreground">Do: {top.action}</p></> : NA}
          <p className="text-muted-foreground">Capacity: {bind ? `${bind.constraint} binds first, at about ${bind.bindsAtCustomers} customers (assumption-based).` : "no capacity constraint binds in the model."}</p>
        </Q>
        <Q n={8} title="What was resolved autonomously?">
          {optAct.length ? optAct.map((a, i) => <p key={i}>• {String(((a.props ?? {}) as P).type ?? "action")}: {String(((a.props ?? {}) as P).reason ?? "").slice(0, 120)}</p>) : <p>Nothing logged this week.</p>}
          {decisions.map((d, i) => <p key={i} className="text-muted-foreground">Decision {d.createdAt.toISOString().slice(0, 10)}: {String(((d.props ?? {}) as P).decision)}</p>)}
        </Q>
      </div>
      <Q n={9} title="What needs the owner?">
        {needs.length ? <ul className="list-disc pl-5">{needs.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}</ul> : <p>Nothing.</p>}
        <p className="text-muted-foreground">Full list with removal plans: docs/ops/owner-dependencies.md</p>
      </Q>
      <Card>
        <CardHeader><CardTitle className="text-base">Scale model: when each constraint binds (assumptions, not measurements)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Constraint</TableHead><TableHead className="text-right">10</TableHead><TableHead className="text-right">50</TableHead><TableHead className="text-right">200</TableHead><TableHead className="text-right">Capacity</TableHead><TableHead className="text-right">Binds at</TableHead></TableRow></TableHeader>
          <TableBody>{cap.map((c) => <TableRow key={c.constraint}><TableCell>{c.constraint}<div className="text-xs text-muted-foreground">{c.assumption}</div></TableCell>{[10, 50, 200].map((n) => <TableCell key={n} className="text-right">{c.usedAt[n]} {c.unit}</TableCell>)}<TableCell className="text-right">{c.capacity}</TableCell><TableCell className="text-right">{c.bindsAtCustomers ?? "never"}</TableCell></TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
      {discrepancies.length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">Registry vs reality ({discrepancies.length} proposals; registry.json is never edited automatically)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">{discrepancies.slice(0, 12).map((d) => <p key={d.id}>• {d.message}</p>)}</CardContent></Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">System accountability ledger ({l.rows.length} capabilities; problems first)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Capability</TableHead><TableHead>Status</TableHead><TableHead>Last run</TableHead><TableHead className="text-right">7d / 30d outputs</TableHead><TableHead>Why</TableHead></TableRow></TableHeader>
          <TableBody>{[...bad, ...l.rows.filter((r) => !bad.includes(r))].map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.label}<div className="text-xs text-muted-foreground">{r.id}{r.flag ? ` · ${r.flag} ${r.flagOn ? "on" : "off"}` : ""}</div></TableCell>
              <TableCell><Badge variant={TONE[r.status]}>{r.status}</Badge></TableCell>
              <TableCell>{r.lastRunAt ? ago(new Date(r.lastRunAt)) : "never"}</TableCell>
              <TableCell className="text-right">{r.outputs7d ?? "?"} / {r.outputs30d ?? "?"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.reason}</TableCell>
            </TableRow>))}</TableBody>
        </Table></CardContent>
      </Card>
    </div>
  );
}
