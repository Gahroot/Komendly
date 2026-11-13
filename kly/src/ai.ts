// Kly's AI: the owner's Codex (ChatGPT) subscription through the engine's provider. No API-key path.
// CODEX_SHARED_STORE=db shares the rotating login with the engine via the CodexCredential row.
import type { z } from "zod";
import { CodexProvider } from "../../engine/src/providers/codex";
import { CodexAuth } from "../../engine/src/providers/codex-auth";
import { sharedCodexStore, type CredDb } from "../../engine/src/providers/codex-store";
import { loadPrices } from "../../engine/src/providers/cost";
import { Limiter } from "../../engine/src/providers/limiter";
import { structured } from "../../engine/src/providers/structured";
import type { AIProvider, TextRequest, UsageMeter } from "../../engine/src/providers/types";

export type { AIProvider } from "../../engine/src/providers/types";
export const DEFAULT_MODEL = "gpt-6.1-sol";

export interface KlyAI {
  provider: AIProvider;
  auth: CodexAuth;
}

export function createKlyAI(db: CredDb | undefined, env: NodeJS.ProcessEnv = process.env): KlyAI | null {
  const auth = CodexAuth.fromEnv(env, sharedCodexStore(db, env, "kly"));
  if (!auth.configured) return null;
  const provider = new CodexProvider({
    auth,
    prices: loadPrices(env),
    textModel: env.CODEX_TEXT_MODEL || DEFAULT_MODEL,
    limiter: new Limiter({ maxConcurrent: 4, maxPerWindow: 60, windowMs: 60_000 }),
    imageLimiter: new Limiter({ maxConcurrent: 1, maxPerWindow: 1, windowMs: 60_000 }),
  });
  return { provider, auth };
}

/** Structured call (medium reasoning unless told otherwise) + its cost in micros. */
export async function ask<S extends z.ZodType>(provider: AIProvider, schema: S, req: Omit<TextRequest, "jsonSchema">): Promise<{ out: z.infer<S>; costMicros: number }> {
  const usage: UsageMeter[] = [];
  const out = await structured(provider, schema, { reasoning: "medium", ...req }, usage);
  return { out, costMicros: usage.reduce((s, u) => s + u.costMicros, 0) };
}

/** Weekly (7-day) window used_percent of the ChatGPT plan; null when unknown. */
export function weeklyPctFromUsage(body: unknown): number | null {
  const rl = (body as { rate_limit?: Record<string, unknown> } | null)?.rate_limit;
  if (!rl) return null;
  const windows = [rl.primary_window, rl.secondary_window].filter((w): w is { used_percent?: unknown; limit_window_seconds?: unknown } => typeof w === "object" && w !== null);
  const weekly = windows.find((w) => w.limit_window_seconds === 604_800) ?? windows.sort((a, b) => Number(b.limit_window_seconds) - Number(a.limit_window_seconds))[0];
  return typeof weekly?.used_percent === "number" ? weekly.used_percent : null;
}

/** Same endpoint as engine/scripts/codex-usage.ts. */
export async function codexWeeklyPct(auth: CodexAuth, signal?: AbortSignal): Promise<number | null> {
  const { accessToken, accountId } = await auth.resolve();
  const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    headers: { authorization: `Bearer ${accessToken}`, ...(accountId ? { "chatgpt-account-id": accountId } : {}), "user-agent": "codex_cli_rs" },
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return weeklyPctFromUsage(await res.json());
}
