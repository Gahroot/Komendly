// Autonomous product improvement loop (growth system `product_loop`, flag sys_product_loop, default OFF): pure logic.
// Signals from AdsEvent -> deterministic ranking (customers x severity x commercial impact / effort, with a Hormozi
// constraint boost for the current #1 business constraint) -> backlog rows (AdsEvent `product_backlog`; there is no schema change,
// the latest event per id is the row) -> weekly plain-English digest. The model (Codex, strict JSON) may only reword and
// estimate effort; the SCORE is computed here. Auto-apply is limited to the allow-list below (config-level, reversible);
// code changes stay proposals. Pure TS (engine-shared).
import { SLO_BOUNDS } from "./reliability";

export const BACKLOG_EVENT = "product_backlog";
export const AUTO_APPLIED_EVENT = "product_auto_applied";
export const THRESHOLD_EVENT = "product_threshold";
export const BACKLOG_STATUSES = ["proposed", "approved", "in_progress", "done", "rejected"] as const;
export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];

/** AdsEvent names the loop reads. Absent ones (e.g. prod-creative's) simply yield no signals. */
export const SIGNAL_EVENTS = ["customer_success_finding", "creative_finding", "outcome_failure", "reliability_finding", "delivery_econ", "product_proposal", "email_reply_handled", "support_request", "funnel_abandoned_step"] as const;

export interface Signal {
  id: string; source: string; title: string; detail: string;
  customersAffected: number; severity: 1 | 2 | 3 | 4 | 5; commercial: 1 | 2 | 3 | 4 | 5; effort: 1 | 2 | 3 | 4 | 5;
  /** Which revenue-constraint area it touches (e.g. "activation", "reliability"), matched to the #1 constraint for the boost. */
  area?: string; at: string;
}
export interface RankedItem extends Signal { score: number; boosted: boolean }

const clip5 = (n: number): 1 | 2 | 3 | 4 | 5 => Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
export const CONSTRAINT_BOOST = 1.5;

/** (customers x severity x commercial) / effort; x1.5 when the item is on the business's #1 constraint (fix the biggest constraint first). */
export function scoreSignal(s: Signal, topConstraintArea?: string | null): RankedItem {
  const boosted = Boolean(topConstraintArea && s.area && s.area === topConstraintArea);
  return { ...s, score: Math.round((Math.max(1, s.customersAffected) * s.severity * s.commercial * (boosted ? CONSTRAINT_BOOST : 1)) / s.effort * 100) / 100, boosted };
}
export function rankSignals(signals: Signal[], topConstraintArea?: string | null): RankedItem[] {
  return signals.map((s) => scoreSignal(s, topConstraintArea)).sort((a, b) => b.score - a.score || b.customersAffected - a.customersAffected || a.id.localeCompare(b.id));
}

type EventRow = { id?: string; name: string; props: unknown; createdAt: Date; workspaceId?: string | null };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const sevMap: Record<string, 1 | 2 | 3 | 4 | 5> = { high: 4, medium: 3, low: 2 };

/** Tolerant mapping of each source event into a Signal. Unknown shapes still map (title from the event name) rather than being dropped. */
export function toSignal(e: EventRow): Signal | null {
  const p = obj(e.props), at = e.createdAt.toISOString();
  const text = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const num = (k: string) => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : null);
  const base = { at, id: `${e.name}:${text("key") || text("cause") || text("id") || e.id || at}` };
  switch (e.name) {
    case "customer_success_finding": return { ...base, source: e.name, title: text("label") || text("cause") || "Customer-success cluster", detail: text("suggestedFix") || text("example"), customersAffected: num("count") ?? 1, severity: sevMap[text("severity")] ?? 3, commercial: 4, effort: p.ourBug === true ? 2 : 3, area: p.ourBug === true ? "reliability" : "activation" };
    case "creative_finding": case "outcome_failure": return { ...base, source: e.name, title: text("title") || text("label") || e.name, detail: text("detail") || text("summary"), customersAffected: num("count") ?? num("customers") ?? 1, severity: clip5(num("severity") ?? 3), commercial: 4, effort: 3, area: "creative" };
    case "reliability_finding": return { ...base, source: e.name, title: text("title") || "Reliability finding", detail: text("detail"), customersAffected: num("customers") ?? 3, severity: clip5((num("severity") ?? 2) + 1), commercial: 4, effort: 3, area: "reliability" };
    case "delivery_econ": { const props = Array.isArray(p.proposals) ? p.proposals : []; const top = obj(props[0]); if (!props.length) return null; return { ...base, id: `delivery_econ:${text("day")}`, source: e.name, title: String(top.title ?? "Delivery cost proposal"), detail: String(top.assumption ?? ""), customersAffected: 1, severity: 2, commercial: 3, effort: 3, area: "economics" }; }
    case "product_proposal": return { ...base, source: e.name, title: text("title") || "Product proposal", detail: text("why") || text("detail"), customersAffected: num("customers") ?? 1, severity: clip5(num("severity") ?? 2), commercial: clip5(num("commercial") ?? 3), effort: p.effort === "S" ? 1 : p.effort === "L" ? 4 : 3, area: text("dimension") || text("area") || undefined };
    case "email_reply_handled": case "support_request": return { ...base, source: e.name, title: text("category") || text("subject") || "Customer reply", detail: text("summary") || text("text"), customersAffected: 1, severity: 2, commercial: 3, effort: 3, area: "activation" };
    case "funnel_abandoned_step": return { ...base, source: e.name, title: `Abandoned at ${text("step") || "a funnel step"}`, detail: text("detail"), customersAffected: num("count") ?? 1, severity: 3, commercial: 5, effort: 3, area: text("step") || "activation" };
    default: return null;
  }
}

/** Merge signals with the same id (keep the newest, sum nothing: counts are per event). */
export function dedupeSignals(sigs: Signal[]): Signal[] {
  const m = new Map<string, Signal>();
  for (const s of sigs) { const o = m.get(s.id); if (!o || s.at > o.at) m.set(s.id, s); }
  return [...m.values()];
}

// ---- Auto-apply allow-list ----------------------------------------------------------------------------------
/** Flags the loop may turn ON by itself: read-only intelligence systems only. Never money, send, publish or customer-facing flags. */
export const AUTO_FLAG_ALLOW = ["sys_reliability", "sys_delivery_econ", "sys_competitive"] as const;
export const AUTO_THRESHOLDS = {
  "slo.target": { min: SLO_BOUNDS.target[0], max: SLO_BOUNDS.target[1] },
  "slo.packWithinMs": { min: SLO_BOUNDS.packWithinMs[0], max: SLO_BOUNDS.packWithinMs[1] },
} as const;

export type AutoAction = { kind: "set_flag"; key: string; enabled: boolean } | { kind: "set_threshold"; key: string; value: number } | { kind: "activate_copy_variant"; variantId: string };
export type ActionVerdict = { ok: true; action: AutoAction } | { ok: false; reason: string };

function parseAction(raw: unknown): AutoAction | null {
  const o = obj(raw);
  if (o.kind === "set_flag" && typeof o.key === "string" && typeof o.enabled === "boolean") return { kind: "set_flag", key: o.key, enabled: o.enabled };
  if (o.kind === "set_threshold" && typeof o.key === "string" && typeof o.value === "number") return { kind: "set_threshold", key: o.key, value: o.value };
  if (o.kind === "activate_copy_variant" && typeof o.variantId === "string") return { kind: "activate_copy_variant", variantId: o.variantId };
  return null;
}

/** Strict allow-list check. `validatedVariantIds` = copy variants that already passed offer-intel validation (injected, never guessed). */
export function validateAutoAction(raw: unknown, ctx: { validatedVariantIds?: readonly string[] } = {}): ActionVerdict {
  const a = parseAction(raw);
  if (!a) return { ok: false, reason: "not an allow-listed action shape" };
  if (a.kind === "set_flag") {
    if (!(AUTO_FLAG_ALLOW as readonly string[]).includes(a.key)) return { ok: false, reason: `flag ${a.key} is not auto-settable` };
    if (!a.enabled) return { ok: false, reason: "auto-apply may only turn read-only systems ON; turning off is an owner call" };
  } else if (a.kind === "set_threshold") {
    const b = (AUTO_THRESHOLDS as Record<string, { min: number; max: number }>)[a.key];
    if (!b) return { ok: false, reason: `threshold ${a.key} is not auto-settable` };
    if (!Number.isFinite(a.value) || a.value < b.min || a.value > b.max) return { ok: false, reason: `${a.key} must be within ${b.min}..${b.max}` };
  } else if (!ctx.validatedVariantIds?.includes(a.variantId)) return { ok: false, reason: "copy variant has not passed validation" };
  return { ok: true, action: a };
}

// ---- Model contract (strict JSON). The model never sets the score or the status. -------------------------------
/** Shape the engine's strict-JSON schema (engine/src/productintel/run.ts) enforces; `action` is untrusted until validateAutoAction. */
export interface LoopOutput { items: Array<{ signalIds: string[]; title: string; why: string; effort: number; action?: unknown }>; whatToBuildNext: string }

export interface BacklogRow {
  id: string; title: string; why: string; status: BacklogStatus; score: number; effort: number;
  customersAffected: number; severity: number; commercial: number; evidence: string[]; sources: string[]; proposedAt: string;
  autoAction?: AutoAction | null; autoActionRejected?: string | null;
}

/** Merge model output with the deterministic ranking: unknown signal ids are dropped; score is recomputed here; auto actions are validated. */
export function buildBacklog(ranked: RankedItem[], out: LoopOutput | null, now: Date, ctx: { validatedVariantIds?: readonly string[]; topConstraintArea?: string | null } = {}): BacklogRow[] {
  const byId = new Map(ranked.map((r) => [r.id, r]));
  const rows: BacklogRow[] = [];
  const used = new Set<string>();
  for (const it of out?.items ?? []) {
    const sigs = it.signalIds.flatMap((id) => { const r = byId.get(id); return r ? [r] : []; });
    if (!sigs.length) continue;
    sigs.forEach((s) => used.add(s.id));
    const customers = Math.max(...sigs.map((s) => s.customersAffected)), severity = Math.max(...sigs.map((s) => s.severity)), commercial = Math.max(...sigs.map((s) => s.commercial));
    const merged = scoreSignal({ ...(sigs[0] as RankedItem), customersAffected: customers, severity: clip5(severity), commercial: clip5(commercial), effort: clip5(it.effort), area: sigs.find((s) => s.area === ctx.topConstraintArea)?.area ?? sigs[0]?.area }, ctx.topConstraintArea);
    const verdict = it.action === undefined || it.action === null ? null : validateAutoAction(it.action, ctx);
    rows.push({ id: `pb:${sigs.map((s) => s.id).sort()[0]}`, title: it.title, why: it.why, status: "proposed", score: merged.score, effort: merged.effort, customersAffected: customers, severity, commercial, evidence: sigs.map((s) => `${s.source}: ${s.title}${s.detail ? ` (${s.detail.slice(0, 140)})` : ""}`), sources: [...new Set(sigs.map((s) => s.source))], proposedAt: now.toISOString(), autoAction: verdict?.ok ? verdict.action : null, autoActionRejected: verdict && !verdict.ok ? verdict.reason : null });
  }
  for (const r of ranked.slice(0, 10)) if (!used.has(r.id)) rows.push({ id: `pb:${r.id}`, title: r.title, why: r.detail || "Signal from customer/system data.", status: "proposed", score: r.score, effort: r.effort, customersAffected: r.customersAffected, severity: r.severity, commercial: r.commercial, evidence: [`${r.source}: ${r.title}`], sources: [r.source], proposedAt: now.toISOString(), autoAction: null, autoActionRejected: null });
  return rows.sort((a, b) => b.score - a.score);
}

/** Latest event per id wins (status changes are new events). Admin/owner status updates keep the original evidence. */
export function currentBacklog(events: EventRow[]): BacklogRow[] {
  const latest = new Map<string, BacklogRow>();
  for (const e of [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (e.name !== BACKLOG_EVENT) continue;
    const p = obj(e.props) as Partial<BacklogRow>;
    if (!p.id || !p.title) continue;
    const prev = latest.get(p.id);
    latest.set(p.id, { ...(prev ?? ({} as BacklogRow)), ...(p as BacklogRow), status: BACKLOG_STATUSES.includes(p.status as BacklogStatus) ? (p.status as BacklogStatus) : prev?.status ?? "proposed" });
  }
  return [...latest.values()].sort((a, b) => b.score - a.score);
}

export function loopPrompt(ranked: RankedItem[], constraint: string | null): { system: string; prompt: string } {
  return {
    system: "You are the product analyst for Komendly (AI ad packs for local businesses). Hormozi constraint thinking: the biggest constraint first; value = dream outcome x likelihood / (time delay x effort). Use ONLY the signals given. Never invent numbers or customers. Never promise results. Suggest an `action` ONLY when it is a flag enable for sys_reliability|sys_delivery_econ|sys_competitive or a threshold slo.target (0.9-0.995) / slo.packWithinMs (300000-1200000); otherwise omit it. Plain English, no jargon, no hype.",
    prompt: `Current #1 business constraint: ${constraint ?? "unknown"}.\nSignals (id | source | customers | severity | title | detail):\n${ranked.slice(0, 25).map((r) => `${r.id} | ${r.source} | ${r.customersAffected} | ${r.severity} | ${r.title} | ${r.detail.slice(0, 200)}`).join("\n")}\n\nReturn JSON: items (group related signals; signalIds must come from the list; effort 1=hours .. 5=weeks) and whatToBuildNext (3-6 plain sentences: what to build next and why, naming the evidence).`,
  };
}

/** Fallback and email body when the model is unavailable: deterministic, still plain English. */
export function digestText(rows: BacklogRow[], model: string | null): { subject: string; text: string } {
  const top = rows.filter((r) => r.status === "proposed" || r.status === "approved" || r.status === "in_progress").slice(0, 5);
  const lines = top.map((r, i) => `${i + 1}. ${r.title}\n   Why: ${r.why}\n   Evidence: ${r.evidence.slice(0, 2).join("; ")}\n   Score ${r.score} (customers ${r.customersAffected}, severity ${r.severity}/5, commercial ${r.commercial}/5, effort ${r.effort}/5)${r.autoAction ? `\n   Auto-applied candidate: ${JSON.stringify(r.autoAction)}` : ""}`);
  return { subject: `What to build next: ${top[0]?.title ?? "nothing urgent"}`, text: `${model ? `${model}\n\n` : ""}Top of the product backlog this week:\n\n${lines.join("\n\n") || "No signals yet: nothing to rank. That is a data gap, not good news."}\n\nCode changes are proposals; only allow-listed config changes (read-only system flags, SLO thresholds within bounds) are ever applied automatically. Review at /admin/ads/product.` };
}
