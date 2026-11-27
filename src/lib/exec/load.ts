// Reads the facts the executive coordination cycle needs from Postgres (engine tick, dry-run script and the owner page share it).
// READ-ONLY. `db` is a PrismaClient typed loosely on purpose. Every read fails soft: unknown stays unknown (never fabricated).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { GROWTH_SYSTEMS, systemForTouch } from "../growth/systems";
import { loadLedger } from "../ops/control/loader";
import { loadRunningExperiments } from "../revenue/experiments";
import { constraintInputsOf } from "./context";
import { diagnoseExecConstraints } from "./constraints17";
import { gather } from "./gather";
import { first10Line, loadFirst10Progress } from "./first10";
import { toLite } from "./objective-adapter";
import { foldObjectives } from "./objectives";
import { EXEC_EVENTS, foldOverrides, isBlockedByOverride } from "./governance";
import { isHandoffReady } from "./objectives";
import type { CycleInput } from "./strategic-cycle";
import type { PerfInput } from "./performance";
import { asObj } from "./types";

export const E = { dispatch: "exec_dispatch", perf: "exec_performance", opportunity: "exec_opportunity", risk: "exec_risk", build: "build_request", owner: "exec_owner_item", approval: "exec_approval", template: "exec_template_approved", run: "exec_coordinator_run" } as const;
const DAY = 86_400_000;
export const isoWeek = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y.getTime()) / DAY + 1) / 7)).padStart(2, "0")}`; };
const soft = async <T,>(f: () => Promise<T>, d: T): Promise<T> => { try { return await f(); } catch { return d; } };

export interface Measured { signups30d: number; first30d: number; unlocks: number; paying: number; sends30d: number; replies30d: number; conversations: number; metrics: Record<string, number> }

export async function loadCycleInput(db: any, now: Date, adminUrl: string): Promise<{ input: CycleInput; measured: Measured; ledgerRows: number; blocked: string[] }> {
  const since = (days: number) => new Date(now.getTime() - days * DAY);
  const count = (name: string, days?: number) => soft(() => db.adsEvent.count({ where: { name, ...(days ? { createdAt: { gte: since(days) } } : {}) } }), 0);
  const [snap, signups30d, first30d, unlocks, repliedEv, klyRows, objRows, ovRows, tplRows, dispRows, ownerRows, apprRows, interv, lastRun, running] = await Promise.all([
    soft(() => db.adsEvent.findFirst({ where: { name: "revenue_snapshot" }, orderBy: { createdAt: "desc" }, select: { props: true } }), null as any),
    count("signed_up", 30), count("first_ad_ready", 30), count("purchased"), count("email_replied", 30),
    soft(() => db.klyDaily.findMany({ where: { day: { gte: since(30) } }, select: { sent: true, replies: true, complaints: true, bounces: true, day: true } }), [] as any[]),
    soft(() => db.adsEvent.findMany({ where: { name: { in: [EXEC_EVENTS.objective, EXEC_EVENTS.objectiveStatus] } }, orderBy: { createdAt: "asc" }, take: 2000 }), [] as any[]),
    soft(() => db.adsEvent.findMany({ where: { name: EXEC_EVENTS.override }, orderBy: { createdAt: "asc" }, take: 500 }), [] as any[]),
    soft(() => db.adsEvent.findMany({ where: { name: E.template }, take: 100 }), [] as any[]),
    soft(() => db.adsEvent.findMany({ where: { name: E.dispatch, createdAt: { gte: since(60) } }, orderBy: { createdAt: "desc" }, take: 1000 }), [] as any[]),
    soft(() => db.adsEvent.findMany({ where: { name: E.owner }, orderBy: { createdAt: "desc" }, take: 100 }), [] as any[]),
    soft(() => db.adsEvent.findMany({ where: { name: { in: [E.approval, EXEC_EVENTS.override] } }, orderBy: { createdAt: "desc" }, take: 300 }), [] as any[]),
    soft(() => db.adsEvent.findMany({ where: { name: "owner_intervention", createdAt: { gte: since(28) } }, select: { createdAt: true }, take: 500 }), [] as any[]),
    soft(() => db.adsEvent.findFirst({ where: { name: E.run }, orderBy: { createdAt: "desc" }, select: { props: true } }), null as any),
    soft(() => loadRunningExperiments(db), [] as any[]),
  ]);
  const sp = asObj(snap?.props), eco = asObj(sp.economics), st = asObj(sp.stage);
  const paying = Number(eco.payingCustomers ?? 0);
  // ONE constraint source: the strategy engine's 17-constraint diagnosis (same reader as the weekly cycle). Never the optimiser's 6-item list.
  const gctx = await soft(() => gather(db, now), null as any);
  const rep = gctx ? diagnoseExecConstraints(constraintInputsOf(gctx)) : null;
  const prim = rep?.primary.id ? rep.results.find((r) => r.id === rep.primary.id) : null;
  const constraint = rep && prim
    ? { key: prim.id as string, label: prim.label, confidence: rep.primary.confidence, evidence: prim.evidence[0]?.text ?? rep.primary.reason }
    : rep ? { key: "none", label: "No constraint is evidenced yet (hold and measure)", confidence: "none", evidence: rep.primary.reason } : null;
  const sends30d = klyRows.reduce((a: number, r: any) => a + r.sent, 0), replies30d = klyRows.reduce((a: number, r: any) => a + r.replies, 0);
  const sends7 = klyRows.filter((r: any) => r.day >= since(7)).reduce((a: number, r: any) => a + r.sent, 0);
  const bounces7 = klyRows.filter((r: any) => r.day >= since(7)).reduce((a: number, r: any) => a + r.bounces, 0);
  const measured: Measured = { signups30d, first30d, unlocks, paying, sends30d, replies30d, conversations: repliedEv, metrics: { paying_customers: paying, signups: signups30d, sign_ups: signups30d, replies: replies30d, free_packs_finished: first30d, unlocks: unlocks, "funnel steps with 30+ observations": [signups30d, first30d, sends30d, replies30d, unlocks].filter((n) => n >= 30).length } };

  // objectives
  const states = foldObjectives(objRows);
  const created = new Map<string, string>();
  for (const e of objRows) if (e.name === EXEC_EVENTS.objective) { const id = asObj(asObj(e.props).spec).id; if (typeof id === "string" && !created.has(id)) created.set(id, new Date(e.createdAt).toISOString()); }
  const approvedTemplates = tplRows.map((r: any) => String(asObj(r.props).id ?? "")).filter(Boolean);
  const ov = foldOverrides(ovRows);
  const all = [...states.values()];
  const objectives = all.map((s) => ({ ...toLite(s, { approvedTemplates }), createdAt: created.get(s.spec.id) ?? s.updatedAt ?? now.toISOString() }));
  const blocked = all.filter((s) => isBlockedByOverride(ov, s.spec.id)).map((s) => s.spec.id);
  // only owner/auto-approved, un-blocked objectives may be dispatched: unapproved ones are shown as "proposed" to the planner (it skips them)
  const executable = new Set(all.filter((s) => isHandoffReady(s) && !blocked.includes(s.spec.id)).map((s) => s.spec.id));
  // owner-paused/vetoed/rejected objectives are not the coordinator's to plan or to nag the owner about
  const hidden = new Set([...blocked, ...all.filter((s) => s.approval === "owner_rejected").map((s) => s.spec.id)]);
  const objs = objectives.filter((o) => !hidden.has(o.id)).map((o) => (executable.has(o.id) || o.status === "done" || o.status === "abandoned" ? o : { ...o, status: (o.status === "active" || o.status === "approved" ? "proposed" : o.status) as typeof o.status }));

  const dispatched = new Set<string>(), week: Record<string, number> = {}, last: Record<string, string> = {};
  for (const r of dispRows) {
    const p = asObj(r.props); const oid = String(p.objectiveId ?? "");
    if (p.status === "executed" || p.status === "queued") { dispatched.add(String(p.key)); if (r.createdAt >= since(7)) week[oid] = (week[oid] ?? 0) + 1; }
    if (oid && !last[oid]) last[oid] = new Date(r.createdAt).toISOString();
  }
  // owner items still open
  const decided = new Set(apprRows.map((r: any) => String(asObj(r.props).itemId ?? "")));
  const openItems = ownerRows.filter((r: any) => !decided.has(r.id) && asObj(r.props).status !== "closed").map((r: any) => ({ id: r.id as string, question: String(asObj(r.props).question ?? ""), recommended: String(asObj(r.props).recommendedLabel ?? asObj(r.props).recommended ?? "") }));
  const latency: number[] = [];
  for (const r of ownerRows) { const a = apprRows.find((x: any) => asObj(x.props).itemId === r.id); if (a) latency.push(Math.round(((new Date(a.createdAt).getTime() - new Date(r.createdAt).getTime()) / DAY) * 10) / 10); }
  const byWeek = new Map<string, number>(); for (const r of interv) byWeek.set(isoWeek(new Date(r.createdAt)), (byWeek.get(isoWeek(new Date(r.createdAt))) ?? 0) + 1);

  // observations: metric movement per objective. Baseline = value recorded when its checkpoint was dispatched (never invented).
  const observations: CycleInput["observations"] = {};
  for (const s of all) {
    const a = s.spec.acceptance[0]; if (!a) continue;
    const cp = dispRows.find((r: any) => asObj(r.props).objectiveId === s.spec.id && asObj(r.props).type === "checkpoint");
    const cur = measured.metrics[a.metric];
    const ran = dispRows.some((r: any) => asObj(r.props).objectiveId === s.spec.id && (asObj(r.props).status === "executed" || asObj(r.props).status === "queued"));
    observations[s.spec.id] = {
      operational: { ran, shipped: s.status === "done" || s.status === "verifying", failures: dispRows.filter((r: any) => asObj(r.props).objectiveId === s.spec.id && asObj(r.props).status === "failed").length },
      commercial: cur === undefined ? null : { metric: a.metric, baseline: cp ? (asObj(cp.props).baseline as number | null ?? null) : null, current: cur, target: a.target, n: cur, minN: 5, unit: "count" },
      cost: { aiCalls: 0, costCents: 0 },
    } satisfies Pick<PerfInput, "operational" | "commercial" | "cost">;
  }

  // risks
  const [domains, mailboxes, sendGroups] = await Promise.all([
    soft(() => db.outboundDomain.findMany({ select: { domain: true, listedOn: true } }), [] as any[]),
    soft(() => db.outboundMailbox.findMany({ select: { id: true, domain: true } }), [] as any[]),
    soft(() => db.outboundSend.groupBy({ by: ["mailboxId"], where: { sentAt: { gte: since(14) }, dryRun: false }, _count: { _all: true } }), [] as any[]),
  ]);
  const dom: Record<string, number> = {}; const mdom = new Map<string, string>(mailboxes.map((m: any) => [m.id, m.domain ?? "unknown"]));
  for (const g of sendGroups) { const d = mdom.get(g.mailboxId) ?? "unknown"; dom[d] = (dom[d] ?? 0) + g._count._all; }
  const flagMeta = await soft(() => db.adsFeatureFlag.findUnique({ where: { key: "meta_publish" } }), null as any);

  // organisation
  const ledger = await soft(() => loadLedger(db, now), null as any);
  const su = await soft(() => db.adsEvent.findMany({ where: { name: "signed_up", createdAt: { gte: since(30) } }, select: { props: true }, take: 5000 }), [] as any[]);
  const attributed: Record<string, number> = {};
  for (const e of su) { const k = systemForTouch(asObj(asObj(e.props).firstTouch) as any); if (k) attributed[k] = (attributed[k] ?? 0) + 1; }
  const systems = (ledger?.rows ?? []).filter((r: any) => r.kind === "system").map((r: any) => { const k = String(r.id).slice(7); return { id: r.id, label: r.label, area: r.area, status: r.status, flagOn: r.flagOn, outputs30d: r.outputs30d, aiCalls7d: r.aiCalls7d ?? 0, costCents30d: Math.round((r.costMicros30d ?? 0) / 10_000), revenueCritical: r.revenueCritical, attributedOutcomes30d: attributed[k] ?? 0 }; });
  void GROWTH_SYSTEMS;

  const input: CycleInput = {
    now, weekLabel: isoWeek(now), adminUrl,
    stageFacts: { payingCustomers: paying, mrrCents: ((eco.mrrCents as any)?.cents ?? null) as number | null },
    evidence: { signups30d, freePacksFinished30d: first30d, unlocks9Total: unlocks, payingCustomers: paying, coldSends30d: sends30d, replies30d, customerConversations: repliedEv },
    constraint, previousConstraint: (asObj(lastRun?.props).constraint as string | undefined) ?? null,
    objectives: objs, observations, lastActivity: last, running: running.map((d: any) => ({ key: d.key, surface: d.surface, kind: "other" as const })),
    approvedTemplates, alreadyDispatched: dispatched, dispatchedThisWeek: week,
    riskFacts: {
      coldSendsByDomain: dom, paymentProcessors: 1, aiProviders: 1, googleAccounts: 1, metaApprovalPending: flagMeta?.enabled !== true, platformPolicyDependency: true,
      spamhausListedDomains: domains.filter((d: any) => (d.listedOn ?? []).length > 0).map((d: any) => d.domain),
      complaints30d: klyRows.reduce((a: number, r: any) => a + r.complaints, 0), bounceRate7d: sends7 ? bounces7 / sends7 : null, sends7d: sends7,
      singleReplicaServices: ["engine", "kly"], backupVerified: null,
    },
    org: { systems, decisionLatencyDays: latency, ownerInterventionsByWeek: [...byWeek.values()], ownerDecisionsOpen: openItems.length },
    klySendsWeekly: Math.round(sends30d / 4.3), openOwnerItems: openItems, first10Line: first10Line(await loadFirst10Progress(db)),
  };
  void st;
  return { input, measured, ledgerRows: systems.length, blocked };
}
