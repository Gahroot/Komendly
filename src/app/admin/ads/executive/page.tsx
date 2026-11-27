// THE top-level owner page. Other admin pages (growth, revenue, ops, finance...) are drill-downs from here.
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCycleInput, E } from "@/lib/exec/load";
import { FIRST10_TARGET, loadFirst10Progress } from "@/lib/exec/first10";
import { strategicCycle } from "@/lib/exec/strategic-cycle";
import { scoreboardSentence } from "@/lib/exec/validation-mode";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { InputActionForm } from "../_components/input-action-form";
import { PostActionButton } from "../_components/post-action-button";

export const dynamic = "force-dynamic";
const API = "/api/admin/ads/executive";

export default function ExecutivePage() {
  return (
    <AdminAdsShell title="Executive" description="Where the business is, what it is waiting on, what the machine is doing about it, and what needs you. Every other admin page is a drill-down from here.">
      <Executive />
    </AdminAdsShell>
  );
}

async function Executive() {
  const now = new Date();
  const { input, measured, blocked } = await loadCycleInput(prisma, now, "/admin/ads/executive");
  const out = strategicCycle(input);
  const f10 = await loadFirst10Progress(prisma);
  const [builds, opps, learned] = await Promise.all([
    prisma.adsEvent.count({ where: { name: E.build, props: { path: ["status"], equals: "pending" } } }).catch(() => 0),
    prisma.adsEvent.findMany({ where: { name: E.opportunity }, orderBy: { createdAt: "desc" }, take: 3 }).catch(() => []),
    prisma.adsEvent.findMany({ where: { name: "optimizer_learning" }, orderBy: { createdAt: "desc" }, take: 4 }).catch(() => []),
  ]);
  const items = (await prisma.adsEvent.findMany({ where: { name: E.owner }, orderBy: { createdAt: "desc" }, take: 30 }).catch(() => []))
    .filter((r) => input.openOwnerItems.some((o) => (o as { id?: string }).id === r.id)).map((r) => ({ id: r.id, ...(r.props as Record<string, unknown>) })) as Array<{ id: string; question?: string; recommendedLabel?: string; why?: string }>;
  const proposed = input.objectives.filter((o) => o.status === "proposed" && o.approvedBy === "needs_owner");
  const live = out.tracked.filter((t) => t.status !== "done" && t.status !== "abandoned");
  const gap = out.scoreboard.filter((l) => !l.met);
  const top = input.constraint;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-400/40 bg-amber-50/60 p-4 text-sm dark:bg-amber-950/20">
        <p className="font-semibold">{out.banner}</p>
        <p className="mt-1 text-muted-foreground">Stage: {out.stage.replace("_", " ")} · {measured.paying} paying customer{measured.paying === 1 ? "" : "s"}. Default strategy: {out.strategy.replace(/_/g, " ")}. &quot;Keep operating and accumulate evidence&quot; is a valid plan, not a failure.</p>
        {out.mode === "commercial_validation" && (
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{(gap.length ? gap : out.scoreboard).slice(0, 4).map((l) => <li key={l.key}>{scoreboardSentence(l)}</li>)}</ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Evidence thresholds are rules of thumb for reading a trend, not statistical proof.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>First {FIRST10_TARGET} independent paying customers: {f10.verified}/{FIRST10_TARGET}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{f10.note} Counted only with a live Stripe reference; internal, test, refunded, duplicate and incentivised payers are excluded.</p>
          {f10.customers.map((c) => <p key={c.eventId}>{c.firstPaidAt.slice(0, 10)} · ${(c.amountCents / 100).toFixed(2)} · {c.what} · {c.emailDomain ?? "?"} · <span className="font-mono text-xs">{c.stripeRef.slice(0, 12)}…</span></p>)}
          {f10.excluded.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">{f10.excluded.length} excluded</summary>{f10.excluded.map((x) => <p key={x.workspaceId} className="text-xs">{x.reason}: {x.detail}</p>)}</details>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Needs you ({items.length + proposed.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!items.length && !proposed.length && <p className="text-muted-foreground">Nothing needs a decision.</p>}
          {proposed.map((o) => (
            <div key={o.id} className="rounded-lg border p-3"><p className="font-medium">Approve objective: {o.title}</p>
              <div className="mt-2 flex flex-wrap gap-2"><PostActionButton url={API} body={{ decision: "approve", objectiveId: o.id }} label="Approve" variant="default" /><PostActionButton url={API} body={{ decision: "reject", objectiveId: o.id }} label="Reject" variant="outline" confirm={{ title: "Reject objective?", description: "It is abandoned and vetoed." }} /></div></div>
          ))}
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border p-3"><p className="font-medium">{it.question}</p>
              <p className="text-muted-foreground">Recommended: {it.recommendedLabel ?? "(none)"}{it.why ? `. ${it.why}` : ""}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2"><PostActionButton url={API} body={{ decision: "approve", itemId: it.id }} label="Approve" variant="default" /><PostActionButton url={API} body={{ decision: "reject", itemId: it.id }} label="Reject" variant="outline" />
                <InputActionForm url={API} body={{ decision: "redirect", itemId: it.id }} field="note" placeholder="Focus on this instead…" label="Redirect" required variant="outline" /></div></div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Primary constraint: {top?.label ?? "not enough data"}</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{top?.evidence}</p>
          <p className="text-muted-foreground">Confidence: {top?.confidence ?? "n/a"}. What would change it: a different funnel step falling further below its benchmark once its sample reaches 30, or the first paying customers appearing (stage change). Drill-down: <Link className="underline" href="/admin/ads/revenue">Revenue</Link>.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Objectives ({live.length}){blocked.length ? ` · ${blocked.length} paused/vetoed by you` : ""}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!live.length && <p className="text-muted-foreground">No live objective. The weekly strategy cycle proposes the next one; until then operations keep running and evidence keeps accumulating.</p>}
          {live.map((t) => {
            const perf = out.performance.find((p) => p.id === t.id);
            return (<div key={t.id} className="rounded-lg border p-3"><p className="font-medium">{t.title} <span className="text-xs text-muted-foreground">({t.status}, phase: {t.phase}, accountable: {t.owner})</span></p>
              <p className="text-muted-foreground">Waiting on: {t.waitingOn}. {t.stalled ? "STALLED. " : ""}{t.duplicateOf ? `Duplicate of ${t.duplicateOf}. ` : ""}{t.abandoned ? "Proposed and undecided for weeks. " : ""}</p>
              {perf && <p>Result so far: {perf.evidence} <span className="text-xs text-muted-foreground">({perf.verdict.replace(/_/g, " ")}, {perf.confidence} confidence; suggest: {perf.recommendation})</span></p>}</div>);
          })}
          {out.conflicts.map((c) => <p key={c.a + c.b} className="text-red-600">Conflict: {c.why} ({c.a} vs {c.b})</p>)}
          <p className="text-xs text-muted-foreground">{builds} build request{builds === 1 ? "" : "s"} waiting for the human/coordinator (npx tsx scripts/exec-build-queue.ts). Code is never changed autonomously.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>What was learned</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {[...out.learned, ...learned.map((l) => String((l.props as { claim?: string })?.claim ?? ""))].filter(Boolean).slice(0, 6).map((l, i) => <p key={i}>• {l}</p>)}
            {!out.learned.length && !learned.length && <p className="text-muted-foreground">Nothing readable yet: samples are below the minimum. That is the honest answer.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Resource allocation (spend ${(out.allocation.spendCents / 100).toFixed(0)})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {out.allocation.lines.map((l) => <p key={l.id}>• {l.label}: <b>{l.status.replace("_", " ")}</b>{l.allotted ? ` (${l.allotted} ${l.resource.replace(/_/g, " ")})` : ""} <span className="text-xs text-muted-foreground">score {l.score.lo}–{l.score.hi}</span></p>)}
            <p className="text-xs text-muted-foreground">{out.allocation.notes.join(" ")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top risks</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">{out.risks.map((r) => <p key={r.id}>• <b>{r.score}</b> {r.title} <span className="text-xs text-muted-foreground">({r.category}; {r.mitigation} Owner: {r.owner})</span></p>)}{!out.risks.length && <p className="text-muted-foreground">None identified from available facts.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Opportunities (max 3)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {opps.map((o) => { const p = o.props as { title?: string; status?: string; label?: string; first_step?: string }; return <p key={o.id}>• {p.title} <span className="text-xs text-muted-foreground">[{p.label ?? p.status}] first step: {p.first_step}</span></p>; })}
            {!opps.length && <p className="text-muted-foreground">None proposed. The weekly pass only runs when there is evidence to reason from.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>The organisation itself</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-muted-foreground">Owner interventions/week: {out.org.ownerInterventionsPerWeek ?? "no data"} · median decision latency: {out.org.medianDecisionLatencyDays ?? "no data"} days. Proposals only; nothing is removed automatically.</p>
          {out.org.findings.slice(0, 6).map((f, i) => <p key={i}>• {f.message} {f.proposal}</p>)}
          <p className="text-xs text-muted-foreground">Drill-downs: <Link className="underline" href="/admin/ads/growth">Growth</Link> · <Link className="underline" href="/admin/ads/ops">Ops</Link> · <Link className="underline" href="/admin/ads/finance">Finance</Link> · <Link className="underline" href="/admin/ads/outcomes">Outcomes</Link> · <Link className="underline" href="/admin/ads/flags">Flags</Link></p>
        </CardContent>
      </Card>
    </div>
  );
}
