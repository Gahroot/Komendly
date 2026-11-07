// Provider factory: AI_PROVIDER=codex (default) | openai.
import type { AIProvider } from "./types";
import { CodexAuth } from "./codex-auth";
import { CodexProvider } from "./codex";
import { loadPrices } from "./cost";
import { Limiter } from "./limiter";
import { OpenAIProvider } from "./openai";

function num(env: NodeJS.ProcessEnv, k: string, d: number): number {
  const v = Number(env[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
}

export function createProvider(kind: "codex" | "openai", env: NodeJS.ProcessEnv = process.env): AIProvider {
  const prices = loadPrices(env);
  if (kind === "openai") {
    return new OpenAIProvider({
      apiKey: env.OPENAI_API_KEY,
      textModel: env.OPENAI_TEXT_MODEL ?? "gpt-6.1-sol",
      imageModel: env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      prices,
      limiter: new Limiter({ maxConcurrent: num(env, "AI_MAX_CONCURRENT", 8), maxPerWindow: num(env, "AI_MAX_PER_MIN", 120), windowMs: 60_000 }),
    });
  }
  return new CodexProvider({
    auth: CodexAuth.fromEnv(env),
    prices,
    textModel: env.CODEX_TEXT_MODEL ?? "gpt-6.1-sol",
    // Subscription caps. Images: 6 parallel probed OK (scripts/image-concurrency-probe.ts, ~9s each).
    limiter: new Limiter({ maxConcurrent: num(env, "CODEX_MAX_CONCURRENT", 16), maxPerWindow: num(env, "CODEX_MAX_PER_MIN", 200), windowMs: 60_000 }),
    imageLimiter: new Limiter({ maxConcurrent: num(env, "CODEX_IMAGE_MAX_CONCURRENT", 12), maxPerWindow: num(env, "CODEX_IMAGE_MAX_PER_MIN", 80), windowMs: 60_000 }),
  });
}
