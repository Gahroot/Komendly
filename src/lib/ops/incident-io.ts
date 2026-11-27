// Incident I/O shared by the engine job and the web watchdog cron. Structural Db (any Prisma client satisfies it).
// No Next/Prisma imports: the engine Dockerfile copies src/lib/ops/. Never changes billing or infrastructure; the only
// writes are AdsEvent rows, AdsFeatureFlag rows (allow-listed) and OutboundDomain.paused (the governor's own pause path).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { GROWTH_SYSTEMS, parseBeat, systemHealth, systemHeartbeatId, type SystemDb } from "../growth/systems";
import { escalationEmail, fromDomains, fromFunnelCheck, fromHeartbeats, fromPayments, fromReliabilityFindings, fromSupport, fromSystems, INCIDENT_EVENT, incidentProps, MAINTENANCE_FLAG, OWNER_EMAIL, parseIncident, reconcile, reviewIncidents, type Containment, type IncidentRec, type Signal, type SignalType } from "./incidents";
import { buildTickets, supportHealth } from "./support";

export interface OpsDb extends SystemDb {
  adsEvent: { findMany(a: any): Promise<any[]>; findFirst(a: any): Promise<any | null>; create(a: any): Promise<any>; update(a: any): Promise<any>; count(a: any): Promise<number> };
  adsFeatureFlag: { findUnique(a: any): Promise<any | null>; upsert(a: any): Promise<any> };
  engineHeartbeat: SystemDb["engineHeartbeat"] & { findMany(a: any): Promise<any[]> };
  outboundDomain: { findMany(a: any): Promise<any[]>; updateMany(a: any): Promise<any> };
}
export type SendOwner = (m: { to: string; subject: string; text: string }) => Promise<void>;

const H = 3_600_000;
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" ? (v as Record<string, any>) : {});
const since = (now: Date, ms: number) => new Date(now.getTime() - ms);

export async function gatherSignals(db: OpsDb, now: Date, mode: "full" | "watchdog"): Promise<{ signals: Signal[]; evaluated: Set<SignalType> }> {
  const signals: Signal[] = [];
  const evaluated = new Set<SignalType>(["heartbeat", "provider"]);
  const [worker] = await db.engineHeartbeat.findMany({ where: { kind: "worker", id: { not: "kly" } }, orderBy: { updatedAt: "desc" }, take: 1 });
  const kly = await db.engineHeartbeat.findUnique({ where: { id: "kly" } });
  const codex = (await db.engineHeartbeat.findUnique({ where: { id: "provider:codex" } })) as { ok: boolean; message: string | null; updatedAt: Date } | null;
  signals.push(...fromHeartbeats({ engineWorkerAt: worker?.updatedAt ?? null, klyAt: (kly as any)?.updatedAt ?? null, codex: codex ? { ok: codex.ok, message: codex.message, updatedAt: codex.updatedAt } : null }, now));
  if (mode === "watchdog") return { signals, evaluated };

  const ev = (name: string, ms: number, take = 200) => db.adsEvent.findMany({ where: { name, createdAt: { gte: since(now, ms) } }, orderBy: { createdAt: "desc" }, take });
  const [funnel, rel, relSnap, pay, hooks, infraFast, infraSlow, replies, needs, autos, handled] = await Promise.all([
    ev("funnel_check", 26 * H, 1), ev("reliability_finding", 25 * H, 50), ev("reliability_snapshot", 26 * H, 1), ev("ads_payment_alerted", 24 * H, 100), ev("webhook_failed", H, 100),
    ev("infra_check", 2 * H, 20), ev("infra_check", 26 * H, 40), ev("email_replied", 24 * H, 100), ev("email_needs_human", 24 * H, 100), ev("email_auto_replied", 24 * H, 100), ev("email_reply_handled", 48 * H, 200),
  ]);
  if (funnel[0]) { evaluated.add("funnel"); signals.push(...fromFunnelCheck({ ok: obj(funnel[0].props).ok !== false, failures: (obj(funnel[0].props).failures ?? []) as any })); }
  if (relSnap[0]) { evaluated.add("reliability"); signals.push(...fromReliabilityFindings(rel.map((e) => { const p = obj(e.props); return { key: String(p.key ?? e.id), severity: Number(p.severity ?? 2), title: String(p.title ?? "Reliability finding"), detail: String(p.detail ?? "") }; }))); }
  evaluated.add("payment"); evaluated.add("webhook");
  const byProvider = new Map<string, number>();
  for (const e of hooks) { const k = String(obj(e.props).provider ?? "unknown"); byProvider.set(k, (byProvider.get(k) ?? 0) + 1); }
  signals.push(...fromPayments(pay.length, [...byProvider].map(([provider, n]) => ({ provider, n }))));

  const domains = await db.outboundDomain.findMany({});
  evaluated.add("deliverability"); evaluated.add("kly");
  signals.push(...fromDomains(domains.map((d: any) => ({ domain: d.domain, paused: d.paused, pausedReason: d.pausedReason ?? null, listedOn: d.listedOn ?? [], failStreak: d.failStreak ?? 0 }))));

  const rows = await Promise.all(GROWTH_SYSTEMS.map(async (s) => {
    const enabled = Boolean((await db.adsFeatureFlag.findUnique({ where: { key: `sys_${s.key}` } }))?.enabled);
    const hb = await db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(s.key) } });
    const beat = hb ? parseBeat(hb.meta) : null;
    return { key: s.key, enabled, beat, health: systemHealth(s, enabled, beat, now) };
  }));
  evaluated.add("system");
  signals.push(...fromSystems(rows, now));

  evaluated.add("support");
  const tickets = buildTickets({
    replies: replies.map((e) => { const p = obj(e.props); return { emailId: String(p.emailId ?? e.id), at: e.createdAt, from: String(p.from ?? ""), subject: String(p.subject ?? ""), text: String(p.text ?? ""), userId: e.userId ?? null, workspaceId: e.workspaceId ?? null }; }),
    needsHuman: needs.map((e) => { const p = obj(e.props); return { emailId: String(p.emailId), at: e.createdAt, category: String(p.category ?? ""), paying: p.paying === true, refundEligible: typeof p.refundEligible === "boolean" ? p.refundEligible : null }; }),
    autoReplied: autos.map((e) => { const p = obj(e.props); return { emailId: String(p.emailId), at: e.createdAt, category: String(p.category ?? "") }; }),
    handled: handled.map((e) => ({ emailId: String(obj(e.props).emailId), at: e.createdAt })), failedJobs: [],
  }, now);
  signals.push(...fromSupport(supportHealth(tickets, now)));

  if (infraFast[0]) {
    evaluated.add("infra");
    const slow = infraSlow.find((e) => obj(e.props).kind === "slow");
    for (const e of [infraFast.find((x) => obj(x.props).kind === "fast"), slow]) if (e) signals.push(...((obj(e.props).signals ?? []) as Signal[]));
  }
  return { signals, evaluated };
}

async function setFlag(db: OpsDb, key: string, enabled: boolean) { await db.adsFeatureFlag.upsert({ where: { key }, create: { key, enabled }, update: { enabled } }); }

async function execute(db: OpsDb, id: string, c: Containment): Promise<void> {
  if (c.kind === "flag_off") return setFlag(db, c.key, false);
  if (c.kind === "maintenance_on") return setFlag(db, MAINTENANCE_FLAG, true);
  await db.outboundDomain.updateMany({ where: { domain: c.domain, paused: false }, data: { paused: true, pausedReason: `auto: incident ${id}` } });
}

export interface TickResult { created: number; updated: number; contained: number; escalated: number }

export async function incidentTick(db: OpsDb, send: SendOwner, opts: { now?: Date; mode?: "full" | "watchdog"; adminUrl?: string } = {}): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const mode = opts.mode ?? "full";
  if (mode === "watchdog") { // only act when the engine is gone: otherwise the engine job owns incidents (no races)
    const [w] = await db.engineHeartbeat.findMany({ where: { kind: "worker", id: { not: "kly" } }, orderBy: { updatedAt: "desc" }, take: 1 });
    if (w && now.getTime() - w.updatedAt.getTime() <= 5 * 60_000) return { created: 0, updated: 0, contained: 0, escalated: 0 };
  }
  const { signals, evaluated } = await gatherSignals(db, now, mode);
  const events = await db.adsEvent.findMany({ where: { name: INCIDENT_EVENT, createdAt: { gte: since(now, 40 * 24 * H) } }, orderBy: { createdAt: "desc" }, take: 500 });
  const all = events.map((e) => parseIncident(e.id, e.props)).filter((r): r is IncidentRec => r !== null);
  const open = all.filter((r) => r.status !== "resolved");
  const plan = reconcile({ now, open, resolvedRecent: all.filter((r) => r.status === "resolved"), signals, evaluated });

  for (const c of plan.contain) {
    try { await execute(db, c.incidentId, c.action); } catch {
      const rec = [...plan.create, ...plan.update.map((u) => u.rec)].find((r) => r.incidentId === c.incidentId);
      const hit = rec?.containment.find((x) => x.action.startsWith(c.action.kind));
      if (hit) hit.ok = false;
    }
  }
  for (const rec of plan.create) rec.eventId = (await db.adsEvent.create({ data: { name: INCIDENT_EVENT, props: incidentProps(rec) } })).id;
  for (const { rec } of plan.update) if (rec.eventId) await db.adsEvent.update({ where: { id: rec.eventId }, data: { props: incidentProps(rec) } });

  if (plan.undo.length) {
    const stillNeeded = [...plan.create, ...plan.update.map((u) => u.rec)].some((r) => r.status !== "resolved" && r.containment.some((c) => c.action === "maintenance_on"));
    const otherOpen = open.some((r) => !plan.update.some((u) => u.rec.incidentId === r.incidentId && u.rec.status === "resolved") && r.containment.some((c) => c.action === "maintenance_on"));
    if (!stillNeeded && !otherOpen) await setFlag(db, MAINTENANCE_FLAG, false).catch(() => undefined);
  }
  for (const e of plan.escalate) {
    const m = escalationEmail(e.rec, e.reason, opts.adminUrl ?? "https://www.komendly.com");
    await send({ to: OWNER_EMAIL, ...m }).catch(() => undefined);
  }
  return { created: plan.create.length, updated: plan.update.length, contained: plan.contain.length, escalated: plan.escalate.length };
}

/** Once a day: summarise the last 30 days and file a product_proposal for every recurring signal (once per key per 30 days). */
export async function dailyIncidentReview(db: OpsDb, now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  if (await db.adsEvent.findFirst({ where: { name: "incident_review", props: { path: ["day"], equals: day } }, select: { id: true } })) return 0;
  const events = await db.adsEvent.findMany({ where: { name: INCIDENT_EVENT, createdAt: { gte: since(now, 40 * 24 * H) } }, take: 500 });
  const r = reviewIncidents(events.map((e) => parseIncident(e.id, e.props)).filter((x): x is IncidentRec => x !== null), now);
  let filed = 0;
  for (const p of r.proposals) {
    if (await db.adsEvent.findFirst({ where: { name: "product_proposal", createdAt: { gte: since(now, 30 * 24 * H) }, props: { path: ["incidentKey"], equals: p.key } }, select: { id: true } })) continue;
    await db.adsEvent.create({ data: { name: "product_proposal", props: { incidentKey: p.key, title: p.title, why: p.why, severity: p.severity, commercial: p.commercial, effort: p.effort, customers: p.customers, area: p.area, source: "incident_review" } } });
    filed++;
  }
  await db.adsEvent.create({ data: { name: "incident_review", props: { day, opened: r.opened, resolved: r.resolved, byType: r.byType, proposals: filed } } });
  return filed;
}
