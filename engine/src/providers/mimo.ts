// Xiaomi MiMo (owner's MiMo Token Plan, decision 2026-11-13) for all TEXT and vision-judging calls; images stay on the
// Codex subscription. MimoTextProvider talks to MiMo through @prestyj/ai (provider "xiaomi"); HybridProvider routes
// text -> MiMo and image -> Codex. Harness: JSON answers are re-asked once on MiMo with a stricter instruction, and any
// MiMo failure (outage, bad JSON twice) falls back to Codex for that one call, so jobs never stall on MiMo.
import { stream } from "@prestyj/ai";
import type { AIProvider, ImageRequest, TextRequest, UsageMeter } from "./types";
import { jsonInstruction, parseModelJson } from "./json";
import { Limiter } from "./limiter";
import { ProviderUnavailableError } from "./errors";

// No import of ../log: Kly's image ships only engine/src/providers (+ a few files), so log JSON lines directly.
function warn(msg: string, fields: Record<string, unknown>): void {
  console.warn(JSON.stringify({ level: "warn", msg, ...fields, t: new Date().toISOString() }));
}

export const MIMO_TOKEN_PLAN_URL = "https://token-plan-sgp.xiaomimimo.com/v1";
export const MIMO_PRO = "mimo-v2.6-pro";
export const MIMO_FLASH = "mimo-v2.6-flash";

export interface MimoOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  limiter: Limiter;
}

/** MiMo settings from env (XIAOMI_API_KEY, XIAOMI_BASE_URL, MIMO_TEXT_MODEL); null without a key. */
export function mimoOptionsFromEnv(env: NodeJS.ProcessEnv = process.env, defaults: { maxConcurrent?: number; perMin?: number } = {}): MimoOptions | null {
  const apiKey = env.XIAOMI_API_KEY?.trim();
  if (!apiKey) return null;
  const n = (k: string, d: number) => (Number(env[k]) > 0 ? Number(env[k]) : d);
  return {
    apiKey,
    baseUrl: env.XIAOMI_BASE_URL?.trim() || MIMO_TOKEN_PLAN_URL,
    model: env.MIMO_TEXT_MODEL?.trim() || MIMO_PRO,
    limiter: new Limiter({ maxConcurrent: n("MIMO_MAX_CONCURRENT", defaults.maxConcurrent ?? 8), maxPerWindow: n("MIMO_MAX_PER_MIN", defaults.perMin ?? 120), windowMs: 60_000 }),
  };
}

/** MiMo sometimes leaks its reasoning inline; keep only the answer. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export class MimoTextProvider {
  constructor(private readonly o: MimoOptions) {}

  get model(): string {
    return this.o.model;
  }

  async text(req: TextRequest): Promise<{ text: string; json?: unknown; usage: UsageMeter }> {
    return this.o.limiter.run(async () => {
      const started = Date.now();
      const ask = async (prompt: string) => {
        const content = [{ type: "text" as const, text: prompt }, ...(req.images ?? []).map((i) => ({ type: "image" as const, mediaType: i.mediaType, data: i.base64 }))];
        let res;
        try {
          res = await stream({ provider: "xiaomi", model: this.o.model, apiKey: this.o.apiKey, baseUrl: this.o.baseUrl, messages: [{ role: "system", content: req.system }, { role: "user", content }], thinking: req.reasoning ?? "low", signal: req.signal }).response;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/rate.?limit|429|quota|insufficient/i.test(msg)) this.o.limiter.pauseUntil(Date.now() + 60_000);
          throw e;
        }
        const c = res.message.content;
        const text = stripThinking(typeof c === "string" ? c : c.map((p) => (p.type === "text" ? p.text : "")).join(""));
        return { text, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens };
      };
      const base = req.jsonSchema ? req.prompt + jsonInstruction(req.jsonSchema) : req.prompt;
      let r = await ask(base);
      let tokens = { inputTokens: r.inputTokens, outputTokens: r.outputTokens };
      let json: unknown;
      if (req.jsonSchema) {
        try {
          json = parseModelJson(r.text);
        } catch {
          // Harness: one stricter re-ask before giving up on MiMo for this call.
          r = await ask(`${base}\n\nIMPORTANT: your whole reply must be one valid JSON value and nothing else. No prose, no markdown, no comments.`);
          tokens = { inputTokens: tokens.inputTokens + r.inputTokens, outputTokens: tokens.outputTokens + r.outputTokens };
          json = parseModelJson(r.text);
        }
      }
      // Token Plan is a flat monthly fee: no per-call cash cost.
      return { text: r.text, json, usage: { latencyMs: Date.now() - started, ...tokens, costMicros: 0 } };
    }, req.signal);
  }
}

/** Text -> MiMo (Codex fallback per call), images + agent logins + health -> Codex. */
export class HybridProvider implements AIProvider {
  readonly name: AIProvider["name"];
  readonly agentCredentials: AIProvider["agentCredentials"];
  fallbacks = 0;

  constructor(
    private readonly mimo: MimoTextProvider,
    private readonly codex: AIProvider,
    private readonly by = "engine",
  ) {
    this.name = codex.name;
    this.agentCredentials = codex.agentCredentials;
  }

  async text(req: TextRequest): Promise<{ text: string; json?: unknown; usage: UsageMeter }> {
    try {
      return await this.mimo.text(req);
    } catch (e) {
      if (req.signal?.aborted) throw e;
      this.fallbacks++;
      warn("mimo text failed, using codex", { by: this.by, model: this.mimo.model, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      try {
        return await this.codex.text(req);
      } catch (c) {
        if (c instanceof ProviderUnavailableError) throw c;
        throw e;
      }
    }
  }

  /** Codex-only text: structured() uses it once when MiMo's JSON still fails the schema after its repair. */
  readonly fallbackText = (req: TextRequest): Promise<{ text: string; json?: unknown; usage: UsageMeter }> => {
    this.fallbacks++;
    return this.codex.text(req);
  };

  image(req: ImageRequest): Promise<{ png: Buffer; width: number; height: number; usage: UsageMeter }> {
    return this.codex.image(req);
  }

  health(): Promise<{ ok: boolean; message?: string }> {
    return this.codex.health();
  }
}

/** Wrap a Codex provider so text runs on MiMo when TEXT_BRAIN != "codex" and a MiMo key is set. */
export function withMimoText(codex: AIProvider, env: NodeJS.ProcessEnv = process.env, by = "engine", defaults?: { maxConcurrent?: number; perMin?: number }): AIProvider {
  if ((env.TEXT_BRAIN ?? "mimo").toLowerCase() === "codex") return codex;
  const o = mimoOptionsFromEnv(env, defaults);
  return o ? new HybridProvider(new MimoTextProvider(o), codex, by) : codex;
}
