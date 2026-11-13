// Which model runs an Ozzy Studio turn: Codex (gpt-6.1-sol, the owner's ChatGPT subscription) by default, Xiaomi MiMo
// (mimo-v2.6-pro on the owner's MiMo Token Plan) as the automatic fallback (owner decision 2026-11-13):
//  - before the turn, when the Codex weekly window is at/above STUDIO_MIMO_AT_PCT (default 90; read from Kly's
//    heartbeat, which checks it every 15 min) so customers' ad jobs keep the rest of the Codex week;
//  - mid-turn, when the Codex run fails on a usage/rate limit (the turn is retried once on MiMo).
// STUDIO_BRAIN=codex|mimo forces one. MiMo can resume a Codex-made session (verified on a real session file).
export type StudioBrain = "codex" | "mimo";

export const MIMO_DEFAULT_MODEL = "mimo-v2.6-pro";
export const MIMO_TOKEN_PLAN_URL = "https://token-plan-sgp.xiaomimimo.com/v1";
export const DEFAULT_MIMO_AT_PCT = 90;
/** Kly's heartbeat value counts only while this fresh. */
export const CODEX_PCT_MAX_AGE_MS = 60 * 60_000;

export interface MimoAuth {
  accessToken: string;
  baseUrl: string;
  expiresAt: number;
}

export function mimoAuth(env: NodeJS.ProcessEnv = process.env): MimoAuth | null {
  const key = env.XIAOMI_API_KEY?.trim();
  if (!key) return null;
  return { accessToken: key, baseUrl: env.XIAOMI_BASE_URL?.trim() || MIMO_TOKEN_PLAN_URL, expiresAt: 4_102_444_800_000 };
}

export function mimoAtPct(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.STUDIO_MIMO_AT_PCT);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MIMO_AT_PCT;
}

/** Pure: pick the brain for a turn. */
export function chooseStudioBrain(o: { forced?: string | null; codexPct: number | null; atPct: number; hasMimo: boolean; hasCodex: boolean }): StudioBrain {
  if (!o.hasMimo) return "codex";
  if (o.forced === "mimo" || !o.hasCodex) return "mimo";
  if (o.forced === "codex") return "codex";
  return o.codexPct !== null && o.codexPct >= o.atPct ? "mimo" : "codex";
}

/** A Codex run that died on the plan's usage / rate limit (worth retrying on MiMo). */
export function isCodexLimitError(msg: string | null | undefined): boolean {
  return /usage[ _-]?limit|rate[ _-]?limit|too many requests|\b429\b|quota|limit (reached|exceeded)|insufficient/i.test(msg ?? "");
}

type HeartbeatDb = { engineHeartbeat: { findUnique(a: { where: { id: string }; select: { meta: true; updatedAt: true } }): Promise<{ meta: unknown; updatedAt: Date } | null> } };

/** Codex weekly used % as last seen by Kly (null when unknown or stale). */
export async function codexWeeklyPctSeen(db: HeartbeatDb, now = Date.now()): Promise<number | null> {
  const hb = await db.engineHeartbeat.findUnique({ where: { id: "kly" }, select: { meta: true, updatedAt: true } }).catch(() => null);
  if (!hb || now - hb.updatedAt.getTime() > CODEX_PCT_MAX_AGE_MS) return null;
  const v = (hb.meta as { codexWeeklyPct?: unknown } | null)?.codexWeeklyPct;
  return typeof v === "number" ? v : null;
}
