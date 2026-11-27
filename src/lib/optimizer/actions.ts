// Optimiser step (c)->(d): the fixed allow-list of actions, the strict JSON schema the AI must fill, and the guardrails that
// decide which model-proposed actions may run. Fail closed: anything unknown, malformed or out of bounds is rejected.
// Pure TS, no imports beyond ./diagnose and ../growth/ecosystem (engine image copies both).
import { decideChannel, type SourceStats } from "../growth/ecosystem";
import type { EvidenceLevel } from "./diagnose";

export const ACTION_TYPES = ["conclude_experiment", "start_experiment", "retire_arm", "shift_emphasis", "suspend_system", "owner_decision"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const MAX_ACTIONS = 5;
export const MAX_CONCURRENT_PER_SURFACE = 1;
export const MIN_VARIANT_N = 100;
export const MIN_CONCLUDE_EVENTS = 10;
export const MIN_ARM_SENDS = 200;
export const MIN_ACTIVE_ARMS = 2;
export const EMPHASIS_SURFACES = ["reels", "content_queue"] as const;

export interface ProposedAction {
  type: string;
  reason: string;
  evidence_level: string;
  evidence: string;
  sample_size: number;
  hypothesis: string;
  experiment_key: string;
  winner_id: string;
  arm_id: string;
  surface: string;
  prefer: string[];
  avoid: string[];
  system_key: string;
  title: string;
  detail: string;
}
export interface Decision { summary: string; actions: ProposedAction[]; learnings: Array<{ kind: "evidence" | "assumption"; title: string; note: string; source: string }>; next_week: string }

const str = (maxLength = 400) => ({ type: "string", maxLength });
/** Strict structured-output schema (every key required, no extras). Fields not used by an action type are "" / [] / 0. */
export const DECISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "actions", "learnings", "next_week"],
  properties: {
    summary: str(600),
    next_week: str(600),
    learnings: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["kind", "title", "note", "source"], properties: { kind: { type: "string", enum: ["evidence", "assumption"] }, title: str(120), note: str(500), source: str(200) } } },
    actions: {
      type: "array", maxItems: MAX_ACTIONS,
      items: {
        type: "object", additionalProperties: false,
        required: ["type", "reason", "evidence_level", "evidence", "sample_size", "hypothesis", "experiment_key", "winner_id", "arm_id", "surface", "prefer", "avoid", "system_key", "title", "detail"],
        properties: {
          type: { type: "string", enum: [...ACTION_TYPES] }, reason: str(), evidence_level: { type: "string", enum: ["measured", "inferred", "assumed"] }, evidence: str(), sample_size: { type: "integer", minimum: 0 },
          hypothesis: str(200), experiment_key: str(80), winner_id: str(80), arm_id: str(80), surface: str(40), prefer: { type: "array", maxItems: 5, items: str(40) }, avoid: { type: "array", maxItems: 5, items: str(40) },
          system_key: str(60), title: str(120), detail: str(600),
        },
      },
    },
  },
} as const;

/** Fail closed: returns null for anything that is not a well-formed decision. */
export function parseDecision(raw: unknown): Decision | null {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.actions) || typeof o.summary !== "string") return null;
  const s = (x: unknown, max = 600) => (typeof x === "string" ? x.slice(0, max) : "");
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string").map((i) => i.trim().slice(0, 40)).filter(Boolean).slice(0, 5) : []);
  const actions: ProposedAction[] = [];
  for (const a of o.actions.slice(0, MAX_ACTIONS * 2)) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    actions.push({
      type: s(r.type, 60), reason: s(r.reason), evidence_level: s(r.evidence_level, 20), evidence: s(r.evidence), sample_size: typeof r.sample_size === "number" && r.sample_size >= 0 ? Math.floor(r.sample_size) : 0, hypothesis: s(r.hypothesis, 200),
      experiment_key: s(r.experiment_key, 80), winner_id: s(r.winner_id, 80), arm_id: s(r.arm_id, 80), surface: s(r.surface, 40), prefer: arr(r.prefer), avoid: arr(r.avoid), system_key: s(r.system_key, 60), title: s(r.title, 120), detail: s(r.detail),
    });
  }
  const learnings = (Array.isArray(o.learnings) ? o.learnings : []).flatMap((l) => {
    const r = (l ?? {}) as Record<string, unknown>;
    const kind = r.kind === "evidence" ? "evidence" : r.kind === "assumption" ? "assumption" : null;
    return kind && s(r.title) && s(r.note) ? [{ kind, title: s(r.title, 120), note: s(r.note, 500), source: s(r.source, 200) } as const] : [];
  }).slice(0, 5);
  return { summary: s(o.summary), actions, learnings, next_week: s(o.next_week) };
}

// ---- context the guardrails check against (gathered by the engine, fixtures in tests) ----
export interface VariantCount { id: string; n: number; conversions: number }
export interface ExperimentView { key: string; surface: string; status: string; variants: VariantCount[] }
export interface ProposalView { key: string; surface: string; hypothesis: string; validated: boolean; status?: string }
export interface ArmView { id: string; dimension: string; key: string; status: string; sends: number; positiveReplies: number; signups: number; paid: number }
export interface GuardContext {
  experiments: ExperimentView[];
  proposals: ProposalView[];
  arms: ArmView[];
  channels: Array<SourceStats>;
  /** hypothesis hashes with a failed past run (ledger), see hypothesisBlocked. */
  ledger: LedgerEntry[];
  now: Date;
  maxConcurrentPerSurface?: number;
}

export interface LedgerEntry { hash: string; at: string; outcome: "failed" | "suspended" | "won"; conditionsKey?: string }
export const RECONSIDER_AFTER_DAYS = 60;

export function hypothesisHash(surface: string, hypothesis: string): string {
  const norm = `${surface.toLowerCase().trim()}|${hypothesis.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()}`;
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < norm.length; i++) { const c = norm.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; }
  return `h${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** Failed / suspended hypotheses are not retried, except after 60 days or when the conditions key changed. */
export function hypothesisBlocked(ledger: readonly LedgerEntry[], hash: string, now: Date, conditionsKey?: string): string | null {
  const hit = ledger.filter((l) => l.hash === hash && l.outcome !== "won").sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!hit) return null;
  const ageDays = (now.getTime() - new Date(hit.at).getTime()) / 86_400_000;
  if (ageDays >= RECONSIDER_AFTER_DAYS) return null;
  if (conditionsKey && hit.conditionsKey && conditionsKey !== hit.conditionsKey) return null;
  return `same hypothesis ${hit.outcome} ${Math.floor(ageDays)}d ago; reconsider after ${RECONSIDER_AFTER_DAYS}d or when conditions change`;
}

export interface ValidAction { action: ProposedAction; type: ActionType; reversible: string; params: Record<string, unknown> }
export interface Rejected { action: ProposedAction; reason: string }

const rate = (a: VariantCount) => (a.n > 0 ? a.conversions / a.n : 0);

export function validateActions(d: Decision, ctx: GuardContext): { valid: ValidAction[]; rejected: Rejected[] } {
  const valid: ValidAction[] = [], rejected: Rejected[] = [];
  const cap = ctx.maxConcurrentPerSurface ?? MAX_CONCURRENT_PER_SURFACE;
  const running = new Map<string, number>();
  for (const e of ctx.experiments) if (e.status === "running") running.set(e.surface, (running.get(e.surface) ?? 0) + 1);
  const retiring = new Map<string, number>();
  const seen = new Set<string>();
  for (const a of d.actions) {
    const no = (reason: string) => { rejected.push({ action: a, reason }); };
    if (valid.length >= MAX_ACTIONS) { no(`more than ${MAX_ACTIONS} actions`); continue; }
    if (!(ACTION_TYPES as readonly string[]).includes(a.type)) { no(`action type "${a.type}" is not on the allow-list`); continue; }
    if (!a.reason.trim()) { no("no reason given"); continue; }
    const type = a.type as ActionType;
    const dedupe = `${type}:${a.experiment_key || a.arm_id || a.system_key || a.surface || a.title}`;
    if (seen.has(dedupe)) { no("duplicate action"); continue; }
    switch (type) {
      case "conclude_experiment": {
        const e = ctx.experiments.find((x) => x.key === a.experiment_key);
        if (!e) { no("unknown experiment"); break; }
        if (e.status !== "running") { no(`experiment is ${e.status}, not running`); break; }
        if (e.variants.length < 2) { no("needs at least 2 variants"); break; }
        const small = e.variants.find((v) => v.n < MIN_VARIANT_N);
        if (small) { no(`variant ${small.id} has only ${small.n} observations (< ${MIN_VARIANT_N}); sample too small to conclude`); break; }
        const events = e.variants.reduce((s, v) => s + v.conversions, 0);
        if (events < MIN_CONCLUDE_EVENTS) { no(`only ${events} conversions in total (< ${MIN_CONCLUDE_EVENTS})`); break; }
        const lead = [...e.variants].sort((x, y) => rate(y) - rate(x))[0]!;
        if (a.winner_id !== lead.id) { no(`winner ${a.winner_id || "(none)"} is not the leading variant (${lead.id})`); break; }
        const second = [...e.variants].sort((x, y) => rate(y) - rate(x))[1]!;
        if (!(rate(lead) > rate(second))) { no("no difference between top variants"); break; }
        valid.push({ action: a, type, params: { key: e.key, winnerId: lead.id, counts: e.variants }, reversible: "Concluding is recorded; re-open by defining a new experiment with the same variants." });
        break;
      }
      case "start_experiment": {
        const p = ctx.proposals.find((x) => x.key === a.experiment_key);
        if (!p) { no("no such offer proposal"); break; }
        if (!p.validated) { no("proposal is not validated yet"); break; }
        if (ctx.experiments.some((x) => x.key === p.key)) { no("experiment already exists"); break; }
        if ((running.get(p.surface) ?? 0) >= cap) { no(`surface "${p.surface}" already has ${cap} running experiment(s)`); break; }
        const blocked = hypothesisBlocked(ctx.ledger, hypothesisHash(p.surface, p.hypothesis || a.hypothesis), ctx.now);
        if (blocked) { no(blocked); break; }
        running.set(p.surface, (running.get(p.surface) ?? 0) + 1);
        valid.push({ action: a, type, params: { key: p.key, surface: p.surface }, reversible: "Conclude or pause the experiment from /admin/ads/revenue; traffic returns to the control." });
        break;
      }
      case "retire_arm": {
        const arm = ctx.arms.find((x) => x.id === a.arm_id);
        if (!arm) { no("unknown arm"); break; }
        if (arm.status !== "active") { no(`arm is ${arm.status}; only active arms can be retired`); break; }
        const peers = ctx.arms.filter((x) => x.dimension === arm.dimension && x.status !== "retired");
        const gone = retiring.get(arm.dimension) ?? 0;
        if (peers.length - gone <= MIN_ACTIVE_ARMS) { no(`would leave fewer than ${MIN_ACTIVE_ARMS} active ${arm.dimension} arms`); break; }
        const score = (x: ArmView) => (x.positiveReplies + x.signups + x.paid) / Math.max(1, x.sends);
        const champ = peers.filter((x) => x.id !== arm.id && x.sends >= MIN_ARM_SENDS).sort((x, y) => score(y) - score(x))[0];
        if (arm.sends < MIN_ARM_SENDS || !champ) { no(`needs >= ${MIN_ARM_SENDS} sends on the arm and a leader with the same`); break; }
        const m = score(arm), sd = Math.sqrt((m * (1 - m)) / (arm.sends + 1));
        if (!(m + 2 * sd < score(champ))) { no("arm is not clearly worse than the leader"); break; }
        retiring.set(arm.dimension, gone + 1);
        valid.push({ action: a, type, params: { armId: arm.id, dimension: arm.dimension, key: arm.key }, reversible: `Set KlyArm ${arm.id} status back to "active" (retiredAt null).` });
        break;
      }
      case "shift_emphasis": {
        if (!(EMPHASIS_SURFACES as readonly string[]).includes(a.surface)) { no(`surface "${a.surface}" not allowed`); break; }
        if (!a.prefer.length && !a.avoid.length) { no("nothing to prefer or avoid"); break; }
        valid.push({ action: a, type, params: { surface: a.surface, prefer: a.prefer, avoid: a.avoid }, reversible: "Write an optimizer_emphasis event with empty prefer/avoid for the same surface (latest event wins)." });
        break;
      }
      case "suspend_system": {
        const ch = ctx.channels.find((c) => c.flag === `sys_${a.system_key}`);
        if (!ch) { no("system not found among tracked channels"); break; }
        const dec = decideChannel(ch);
        if (dec.action !== "suspend" || !dec.switchOff) { no(`registry rule does not say suspend (${dec.action})`); break; }
        valid.push({ action: a, type, params: { flag: dec.switchOff, source: ch.source }, reversible: `Switch ${dec.switchOff} back ON in /admin/ads/flags.` });
        break;
      }
      case "owner_decision": {
        if (!a.title.trim() || !a.detail.trim()) { no("owner decision needs a title and detail"); break; }
        valid.push({ action: a, type, params: { title: a.title, detail: a.detail }, reversible: "Nothing changes until the owner decides." });
        break;
      }
    }
    if (valid.at(-1)?.action === a) seen.add(dedupe);
  }
  return { valid, rejected };
}

export const levelOf = (s: string): EvidenceLevel => (s === "measured" || s === "inferred" ? s : "assumed");

/** Idempotency: one cycle per ISO week unless forced. */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
export function shouldRunCycle(lastWeek: string | null, now: Date, forced: boolean): boolean {
  return forced || lastWeek !== isoWeekKey(now);
}
export const MAX_FAILED_CYCLES = 3;
export const failureStreak = (outcomes: ReadonlyArray<"ok" | "failed">): number => { let n = 0; for (const o of [...outcomes].reverse()) { if (o === "failed") n++; else break; } return n; };
