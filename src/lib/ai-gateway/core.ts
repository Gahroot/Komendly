// AI gateway over Postgres: pure core (no Next/Prisma/Node imports; imported by web AND engine).
// The Vercel web app never calls an AI vendor. It writes an AdsEvent `ai_request`; the engine loop
// (engine/src/aigateway/loop.ts) runs it on the owner's Codex SUBSCRIPTION and writes `ai_result` with the same id.
// Policy: docs/ops/ai-policy.md.

export const REQUEST_EVENT = "ai_request";
export const CLAIM_EVENT = "ai_claim";
export const RESULT_EVENT = "ai_result";
export const GATEWAY_SYSTEM = "ai_gateway" as const;

/** The TextFn shape of src/lib/growth/review-gate.ts. */
export interface GatewayRequest { system: string; prompt: string; jsonSchema?: Record<string, unknown> }
export interface GatewayResponse { text: string; json?: unknown }
export type GatewayTextFn = (req: GatewayRequest) => Promise<GatewayResponse>;

export interface GatewayRequestProps {
  id: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown> | null;
  /** Always null: the model is chosen by the engine (Codex), never by the caller. */
  model: null;
  purpose: string;
  requester: string;
}
export interface GatewayResultProps { id: string; ok: boolean; text: string; json: unknown; error: string | null; ms: number; costMicros?: number; inputTokens?: number; outputTokens?: number }

export const DEFAULT_TIMEOUT_MS = 45_000;
export const STALE_MS = 5 * 60_000;
export const DEFAULT_MAX_PER_HOUR = 120;
export const DEFAULT_PAUSE_PCT = 97;
export const MAX_PROMPT_CHARS = 60_000;

export class GatewayError extends Error {
  constructor(readonly code: "off" | "timeout" | "failed" | "invalid", message: string) { super(message); this.name = "GatewayError"; }
}

export function newRequestId(rand: () => number = Math.random, now = Date.now()): string {
  return `ai_${now.toString(36)}_${Math.floor(rand() * 36 ** 8).toString(36).padStart(8, "0")}`;
}

export function buildRequestProps(req: GatewayRequest, o: { id: string; purpose: string; requester: string }): GatewayRequestProps {
  return { id: o.id, system: req.system, prompt: req.prompt, schema: req.jsonSchema ?? null, model: null, purpose: o.purpose.slice(0, 80), requester: o.requester.slice(0, 80) };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Validate an ai_request payload the engine read from the DB. Null = ignore it. */
export function parseRequestProps(raw: unknown): GatewayRequestProps | null {
  const p = obj(raw);
  if (typeof p.id !== "string" || !p.id || typeof p.system !== "string" || typeof p.prompt !== "string" || !p.prompt) return null;
  if (p.prompt.length > MAX_PROMPT_CHARS || p.system.length > MAX_PROMPT_CHARS) return null;
  const schema = p.schema && typeof p.schema === "object" && !Array.isArray(p.schema) ? (p.schema as Record<string, unknown>) : null;
  return { id: p.id, system: p.system, prompt: p.prompt, schema, model: null, purpose: String(p.purpose ?? "unknown").slice(0, 80), requester: String(p.requester ?? "unknown").slice(0, 80) };
}

export function parseResultProps(raw: unknown): GatewayResultProps | null {
  const p = obj(raw);
  if (typeof p.id !== "string" || typeof p.ok !== "boolean") return null;
  return { id: p.id, ok: p.ok, text: typeof p.text === "string" ? p.text : "", json: p.json ?? null, error: typeof p.error === "string" ? p.error : null, ms: typeof p.ms === "number" ? p.ms : 0 };
}

export const isStale = (createdAt: Date, now: Date, staleMs = STALE_MS) => now.getTime() - createdAt.getTime() > staleMs;

export function maxPerHour(env: Record<string, string | undefined>): number {
  const v = Number(env.AI_GATEWAY_MAX_PER_HOUR);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_MAX_PER_HOUR;
}
export function pausePct(env: Record<string, string | undefined>): number {
  const v = Number(env.AI_GATEWAY_PAUSE_PCT);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_PAUSE_PCT;
}

/** Pure admission decision for one request. */
export function admit(o: { claimedLastHour: number; maxHour: number; codexPct: number | null; pausePct: number }): { ok: true } | { ok: false; error: string } {
  if (o.claimedLastHour >= o.maxHour) return { ok: false, error: `hourly cap reached (${o.maxHour}/h)` };
  if (o.codexPct !== null && o.codexPct >= o.pausePct) return { ok: false, error: `Codex weekly limit guard: ${Math.round(o.codexPct)}% used (pauses at ${o.pausePct}%)` };
  return { ok: true };
}

/** Polling delays: 250ms growing to 500ms. */
export const pollDelay = (attempt: number) => Math.min(500, 250 + attempt * 50);
