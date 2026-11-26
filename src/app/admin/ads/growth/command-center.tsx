import { readFile } from "node:fs/promises";
import path from "node:path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  decideCourse, needsYou, OPPORTUNITY_STATUSES, parseLearnings, STATUS_LABEL, summarizeRegistry, type Opportunity,
} from "@/lib/growth/ecosystem";
import { loadEcosystemLive } from "@/lib/growth/ecosystem-queries";
import { StatCard } from "../_components/stat-card";
import registryJson from "../../../../../docs/growth-ecosystem/registry.json";

const registry = registryJson as unknown as Opportunity[];
const trivialCost = /^(none|free|negligible)/i;

/** Owner command center: registry status + live data. Source of truth for the list is docs/growth-ecosystem/registry.json. */
export async function CommandCenter() {
  const [live, learningsMd] = await Promise.all([
    loadEcosystemLive().catch(() => null),
    readFile(path.join(process.cwd(), "docs", "growth-ecosystem", "learnings.md"), "utf8").catch(() => ""),
  ]);
  const { overall, byCategory } = summarizeRegistry(registry);
  const needs = needsYou(registry);
  const decisions = live ? decideCourse(live.sources) : [];
  const learnings = parseLearnings(learningsMd).reverse().slice(0, 8);
  const experiments = registry.filter((o) => o.status === "experimenting");
  const costed = registry.filter((o) => (o.status === "operational" || o.status === "experimenting") && o.costs && !trivialCost.test(o.costs));
  const issues = [
    ...(live?.systems.filter((s) => s.enabled && s.health !== "healthy").map((s) => `${s.label}: ${s.health}${s.lastError ? ` (${s.lastError.slice(0, 120)})` : ""}`) ?? []),
    ...decisions.filter((d) => d.action === "suspend" || d.action === "fix_offer").map((d) => `${d.label}: ${d.reason}`),
    ...registry.filter((o) => o.status === "suspended").map((o) => `#${o.id} ${o.name}: suspended`),
    ...(live ? [] : ["Live data failed to load (database query error)."]),
  ];
  const withTraffic = live?.sources.filter((s) => s.signups || s.payments || (s.actions ?? 0) > 0).sort((a, b) => b.payments - a.payments || b.signups - a.signups) ?? [];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Opportunities" value={String(overall.total)} hint="100 + discovered" />
        <StatCard label="Operational" value={String(overall.operational)} tone={overall.operational ? "good" : "default"} />
        <StatCard label="Experimenting" value={String(overall.experimenting)} />
        <StatCard label="Waiting on something" value={String(overall.awaiting_prerequisite)} />
        <StatCard label="Needs you" value={String(needs.length)} tone={needs.length ? "bad" : "default"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Needs you</CardTitle></CardHeader>
        <CardContent>
          {needs.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is waiting on you.</p> : (
            <ul className="space-y-1.5 text-sm">{needs.map((o) => <li key={o.id}><span className="font-medium">#{o.id} {o.name}:</span> {o.owner_action}</li>)}</ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Status by category</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Category</TableHead>{OPPORTUNITY_STATUSES.map((s) => <TableHead key={s}>{STATUS_LABEL[s]}</TableHead>)}<TableHead>Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {byCategory.map((c) => (
                <TableRow key={c.category}>
                  <TableCell className="font-medium">{c.category}</TableCell>
                  {OPPORTUNITY_STATUSES.map((s) => <TableCell key={s} className="tabular-nums">{c.counts[s]}</TableCell>)}
                  <TableCell className="font-semibold tabular-nums">{c.counts.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {live && (
        <Card>
          <CardHeader><CardTitle>Sign-ups and payments by first-touch source</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">{live.signups7d} sign-ups in the last 7 days; {live.payingCustomers} paying. Course-change rule: 500+ actions and no sign-ups = suspend; any payment = turn up. Internal accounts excluded.</p>
            <Table>
              <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Actions</TableHead><TableHead>Sign-ups</TableHead><TableHead>Payments</TableHead><TableHead>Rule says</TableHead></TableRow></TableHeader>
              <TableBody>
                {withTraffic.map((s) => {
                  const d = decisions.find((x) => x.source === s.source);
                  return (
                    <TableRow key={s.source}>
                      <TableCell className="font-medium">{s.label}<span className="ml-1 font-mono text-xs text-muted-foreground">{s.source}</span></TableCell>
                      <TableCell className="tabular-nums">{s.actions ?? "n/a"}</TableCell>
                      <TableCell className="tabular-nums">{s.signups}</TableCell>
                      <TableCell className="tabular-nums">{s.payments}</TableCell>
                      <TableCell className="text-xs">{d?.action ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
                {withTraffic.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No source has recorded anything yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Operational issues</CardTitle></CardHeader>
        <CardContent>
          {issues.length === 0 ? <p className="text-sm text-muted-foreground">No enabled system is stalled, failing or silent.</p> : <ul className="list-disc space-y-1 pl-5 text-sm">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Experiments running ({experiments.length})</CardTitle></CardHeader>
        <CardContent><p className="text-sm">{experiments.map((o) => `#${o.id} ${o.name}`).join(" · ") || "None."}</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Costs known</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">{costed.map((o) => <li key={o.id}><span className="font-medium">#{o.id} {o.name}:</span> {o.costs}</li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">Gift costs per pack are in the Growth loops section below.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Learnings log</CardTitle></CardHeader>
        <CardContent>
          {learnings.length === 0 ? <p className="text-sm text-muted-foreground">No entries yet (docs/growth-ecosystem/learnings.md).</p> : (
            <ul className="space-y-3 text-sm">{learnings.map((l) => <li key={l.date + l.title}><span className="font-medium">{l.date} [{l.kind.toLowerCase()}] {l.title}</span><p className="whitespace-pre-line text-muted-foreground">{l.body}</p></li>)}</ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All opportunities</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Readiness</TableHead><TableHead>Flag</TableHead></TableRow></TableHeader>
            <TableBody>
              {registry.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="tabular-nums">{o.id}</TableCell>
                  <TableCell className="font-medium" title={o.evidence}>{o.name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.category}</TableCell>
                  <TableCell>{STATUS_LABEL[o.status]}</TableCell>
                  <TableCell className="text-muted-foreground">{o.readiness}</TableCell>
                  <TableCell className="font-mono text-xs">{o.flag ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">Hover a name for the evidence. Full detail (prerequisites, costs, code refs): docs/growth-ecosystem/registry.json.</p>
        </CardContent>
      </Card>
    </div>
  );
}
