// Shared reader: assembles the ContextInput for the strategy engine from AdsEvent/Postgres. READ-ONLY. Used by the engine's weekly strategy cycle,
// the coordinator's load (so both name the SAME primary constraint), the owner page and scripts/exec-dry-run.ts.
// Event names here are the ones the producers actually write (verified by __tests__/event-names.test.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { GROWTH_SYSTEMS, parseBeat, systemFlagKey, systemHeartbeatId } from "../growth/systems";
import { countBySource } from "../growth/ecosystem";
import { SPEND_AUTHORITY } from "../ops/finance/authority";
import type { RevenueSnapshot } from "../revenue/snapshot";
import type { ContextInput } from "./context";
import { asObj, type ExecDb } from "./types";

const since = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

export async function gather(db: ExecDb, now: Date): Promise<ContextInput> {
  const ev = (name: string, take: number, days = 120) => db.adsEvent.findMany({ where: { name, createdAt: { gte: since(now, days) } }, orderBy: { createdAt: "desc" }, take });
  const [snaps, signupEv, payEv, fin, inc, infra, status, opt, opsDec, expEv, ownerEv, proposals, learn] = await Promise.all([
    ev("revenue_snapshot", 1, 30), ev("signed_up", 3000, 90), ev("ads_payment_alerted", 500, 365), ev("finance_snapshot", 1, 30), ev("incident", 50, 30), ev("infra_check", 30, 3),
    ev("system_status", 60, 3), ev("optimizer_action", 20, 120), ev("ops_decision", 20, 120), ev("experiment_defined", 50), ev("optimizer_owner_decision", 10, 30), ev("offer_proposal", 40), ev("optimizer_learning", 20, 120),
  ]);
  const snapshot = (snaps[0]?.props ?? null) as RevenueSnapshot | null;
  const flagRows = await db.adsFeatureFlag.findMany({ take: 500 });
  const flags: Record<string, boolean> = Object.fromEntries(flagRows.map((f: any) => [f.key, f.enabled]));
  const payers = new Set<string>(payEv.flatMap((e: any) => (e.workspaceId ? [e.workspaceId as string] : [])));
  const by = countBySource(signupEv.flatMap((e: any) => { const p = asObj(e.props), ft = asObj(p.firstTouch); return e.workspaceId ? [{ workspaceId: e.workspaceId, utmSource: (ft.utm_source as string) ?? null, referrerHost: (ft.referrer_host as string) ?? null, klyLead: Boolean(p.klyLead) }] : []; }), payers);
  const channels: ContextInput["channels"] = [];
  for (const s of GROWTH_SYSTEMS) {
    const c = by.get(s.utmSource);
    const beat = parseBeat((await db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(s.key) } }).catch(() => null))?.meta);
    if (c || beat.outputs) channels.push({ source: s.utmSource, label: s.label, actions: beat.outputs, signups: c?.signups ?? 0, payments: c?.payments ?? 0, flagOn: flags[systemFlagKey(s.key)] === true });
  }
  // latest infra_check per row; latest system_status per capability id
  const statuses = new Map<string, string>();
  for (const e of status) { const p = asObj(e.props); const id = String(p.id ?? p.key ?? ""); if (id && !statuses.has(id)) statuses.set(id, String(p.status ?? "")); }
  const openInc = inc.filter((e: any) => { const p = asObj(e.props); return p.status !== "resolved" && p.status !== "closed"; });
  // No producer classifies replies into AdsEvents yet (kly stores replies on OutboundLead/KlyDaily): customer voice stays UNKNOWN rather than fabricated.
  return {
    now, snapshot, channels, flags,
    finance: fin[0] ? { props: asObj(fin[0].props) } : null,
    incidents: inc.length ? { open: openInc.length, recent: openInc.slice(0, 5).map((e: any) => asObj(e.props)) } : null,
    infra: infra.length ? { failures: infra.filter((e: any) => asObj(e.props).ok === false).length, total: infra.length } : null,
    systemStatus: statuses.size ? [...statuses].map(([id, st]: [string, string]) => ({ id, status: st })) : null,
    competitive: null, // docs/product/competitive.json is not shipped in the engine image; wire an AdsEvent when the product worker emits one
    spendAuthority: { ...SPEND_AUTHORITY },
    ownerDecisions: ownerEv.map((e: any) => ({ text: String(asObj(e.props).title ?? ""), at: e.createdAt.toISOString() })),
    optimizerActions: opt.map((e: any) => asObj(e.props)), opsDecisions: opsDec.map((e: any) => asObj(e.props)), learnings: learn.map((e: any) => asObj(e.props)),
    experiments: expEv.map((e: any) => ({ key: String(asObj(e.props).key ?? ""), status: "defined", hypothesis: typeof asObj(e.props).hypothesis === "string" ? String(asObj(e.props).hypothesis) : undefined })).filter((x: { key: string }) => x.key),
    hypotheses: proposals.flatMap((e: any) => (typeof asObj(e.props).hypothesis === "string" ? [{ text: String(asObj(e.props).hypothesis) }] : [])),
    customerVoice: null, outcomes: null,
  };
}

