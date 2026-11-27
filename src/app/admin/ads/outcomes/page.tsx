import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadOutcomesDashboard } from "@/lib/product-intel/queries";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { StatCard } from "../_components/stat-card";

export const dynamic = "force-dynamic";

export default function OutcomesPage() {
  return (
    <AdminAdsShell title="Customer outcomes" description="Measured tiers per customer, preventable failures, creative QA findings and the effectiveness ledger. Facts only: nothing is estimated, thin data reads 'too early to tell'. Test accounts excluded.">
      <Outcomes />
    </AdminAdsShell>
  );
}

async function Outcomes() {
  const d = await loadOutcomesDashboard();
  const on = (k: string) => (d.flags.find((f) => f.key === k)?.enabled ? "ON" : "OFF");
  const count = (h: string) => d.customers.filter((c) => c.outcome.health === h).length;
  const failing = d.customers.filter((c) => c.outcome.failures.length);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Customers (60d)" value={String(d.customers.length)} hint="with a pack" />
        <StatCard label="On track" value={String(count("on_track"))} tone={count("on_track") ? "good" : "default"} />
        <StatCard label="At risk / failed" value={`${count("at_risk")} / ${count("failed")}`} tone={count("at_risk") + count("failed") ? "bad" : "default"} />
        <StatCard label="Too early / unknown" value={String(count("unknown"))} />
        <StatCard label="Flags" value={`QA ${on("sys_creative_qa")}`} hint={`Verify ${on("sys_outcome_verify")} · ${d.scored} packs scored (30d)`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Preventable failures ({failing.length} customers now)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {failing.length === 0 ? <p className="text-muted-foreground">None detected.</p> : failing.map((c) => (
            <p key={c.workspaceId}><b>{c.workspaceName}</b> ({c.email}): {c.outcome.failures.map((f) => `[${f.code}] ${f.reason}`).join(" · ")}</p>
          ))}
          <p className="text-xs text-muted-foreground">New failures are emailed once to nolan@prestyj.com while sys_outcome_verify is ON. {d.failures.length} alerts recorded recently.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Per-customer timeline</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Health</TableHead><TableHead>Tiers</TableHead><TableHead>Why</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.customers.slice(0, 100).map((c) => (
                <TableRow key={c.workspaceId}>
                  <TableCell>{c.workspaceName}<div className="text-xs text-muted-foreground">{c.email} · {c.plan}</div></TableCell>
                  <TableCell className={c.outcome.health === "failed" || c.outcome.health === "at_risk" ? "text-red-600" : ""}>{c.outcome.health.replace("_", " ")}{c.outcome.tooEarly ? " (too early)" : ""}</TableCell>
                  <TableCell className="text-xs">{c.outcome.tiers.map((t) => `${t.state === "reached" ? "✓" : t.state === "not_tracked" ? "?" : "·"} ${t.label}${t.at ? ` ${t.at.slice(0, 10)}` : ""}`).join(" | ")}</TableCell>
                  <TableCell className="text-xs">{c.outcome.reasons.join(" ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">✓ recorded, · not yet, ? not tracked (no event exists, e.g. lead contacted).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Creative findings (latest weekly batch)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {d.findings.length === 0 ? <p className="text-muted-foreground">No findings yet: needs sys_creative_qa ON and enough scored ads (8+ per group, 3+ hits).</p> : d.findings.map((f, i) => (
            <div key={i}>
              <b>{f.cause}</b> in {f.dimension}={f.key}: {f.count}/{f.n} ads ({Math.round(f.rate * 100)}%, overall {Math.round(f.baselineRate * 100)}%) · {f.severity}
              <div className="text-xs text-muted-foreground">Proposal (needs your OK, never auto-applied): {f.suggestedFix} · examples: {f.exampleRunIds.join(", ")}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Advertising effectiveness ledger</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{d.ledger.statement}</p>
          {d.ledger.entries.length > 0 && (
            <Table>
              <TableHeader><TableRow><TableHead>Attribute</TableHead><TableHead>Value</TableHead><TableHead>Ads</TableHead><TableHead>Impr.</TableHead><TableHead>CTR (shrunk)</TableHead><TableHead>Leads</TableHead><TableHead>Confidence</TableHead></TableRow></TableHeader>
              <TableBody>{d.ledger.entries.slice(0, 40).map((e, i) => (
                <TableRow key={i}><TableCell>{e.attribute}</TableCell><TableCell>{e.value}</TableCell><TableCell>{e.ads}</TableCell><TableCell>{e.impressions}</TableCell><TableCell>{((e.ctr ?? 0) * 100).toFixed(2)}% ({((e.shrunkCtr ?? 0) * 100).toFixed(2)}%)</TableCell><TableCell>{e.leads}</TableCell><TableCell>{e.confidence}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          )}
          {d.hooks.length > 0 && <p>Hook/angle library (measured, above average): {d.hooks.map((h) => `${h.attribute}: ${h.value}`).join("; ")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
