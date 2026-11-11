// Default provider: ChatGPT (Codex) subscription. Text via @prestyj/ai's Codex transport,
// images via the Codex images endpoint. All calls go through one shared Limiter.
import { stream } from "@prestyj/ai";
import type { AIProvider, ImageRequest, TextRequest, UsageMeter } from "./types";
import { CodexAuth } from "./codex-auth";
import { codexImage, ImageAccessError, ImageLimitError } from "./codex-images";
import { imageCostMicros, textCostMicros, type PriceTable } from "./cost";
import { ProviderUnavailableError } from "./errors";
import { imageSize } from "./image-size";
import { jsonInstruction, parseModelJson } from "./json";
import { Limiter } from "./limiter";

export interface CodexProviderOptions {
  auth: CodexAuth;
  prices: PriceTable;
  textModel: string;
  limiter: Limiter;
  imageLimiter: Limiter;
}

export class CodexProvider implements AIProvider {
  readonly name = "codex" as const;
  constructor(private readonly o: CodexProviderOptions) {}

  get agentCredentials(): NonNullable<AIProvider["agentCredentials"]> {
    return { lease: (minMs) => this.o.auth.lease(minMs), adopt: (next) => this.o.auth.adopt(next) };
  }

  private async creds(): Promise<{ accessToken: string; accountId: string | undefined }> {
    try {
      return await this.o.auth.resolve();
    } catch (e) {
      throw new ProviderUnavailableError(e instanceof Error ? e.message : String(e));
    }
  }

  async text(req: TextRequest): Promise<{ text: string; json?: unknown; usage: UsageMeter }> {
    return this.o.limiter.run(async () => {
      const { accessToken, accountId } = await this.creds();
      const started = Date.now();
      const prompt = req.jsonSchema ? req.prompt + jsonInstruction(req.jsonSchema) : req.prompt;
      const content = [
        { type: "text" as const, text: prompt },
        ...(req.images ?? []).map((i) => ({ type: "image" as const, mediaType: i.mediaType, data: i.base64 })),
      ];
      let res;
      try {
        res = await stream({
          provider: "openai",
          model: this.o.textModel,
          apiKey: accessToken,
          accountId,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content },
          ],
          thinking: req.reasoning ?? "low",
          promptCacheKey: "komendly-ads-engine",
          signal: req.signal,
        }).response;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/usage.?limit|rate.?limit|429/i.test(msg)) {
          this.o.limiter.pauseUntil(Date.now() + 5 * 60_000);
          throw new ProviderUnavailableError(`Codex usage limit: ${msg}`);
        }
        if (/401|unauthori[sz]ed/i.test(msg)) {
          await this.o.auth.refresh().catch(() => undefined);
        }
        throw e;
      }
      const c = res.message.content;
      const text = typeof c === "string" ? c : c.map((p) => (p.type === "text" ? p.text : "")).join("");
      const usage: UsageMeter = {
        latencyMs: Date.now() - started,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
        costMicros: textCostMicros(this.o.prices, this.o.textModel, res.usage.inputTokens, res.usage.outputTokens),
      };
      return { text, json: req.jsonSchema ? parseModelJson(text) : undefined, usage };
    }, req.signal);
  }

  async image(req: ImageRequest): Promise<{ png: Buffer; width: number; height: number; usage: UsageMeter }> {
    return this.o.imageLimiter.run(async () => {
      const { accessToken, accountId } = await this.creds();
      const started = Date.now();
      const quality = req.quality ?? "auto";
      let png: Buffer;
      try {
        png = await codexImage({
          prompt: req.prompt,
          size: req.size,
          quality,
          background: req.background ?? "opaque",
          references: req.references,
          token: accessToken,
          accountId,
          signal: req.signal,
        });
      } catch (e) {
        if (e instanceof ImageLimitError) {
          const until = e.resetsAt ? e.resetsAt * 1000 : Date.now() + 15 * 60_000;
          this.o.imageLimiter.pauseUntil(until);
          throw new ProviderUnavailableError(`Codex image limit reached: ${e.message}`, Math.max(60_000, until - Date.now()));
        }
        if (e instanceof ImageAccessError) throw new ProviderUnavailableError(e.message, 60 * 60_000);
        throw e;
      }
      const dims = imageSize(png) ?? { width: 0, height: 0 };
      return {
        png,
        ...dims,
        usage: { latencyMs: Date.now() - started, images: 1, costMicros: imageCostMicros(this.o.prices, quality, 1, req.references?.length ?? 0) },
      };
    }, req.signal);
  }

  health(): Promise<{ ok: boolean; message?: string }> {
    return this.o.auth.health();
  }
}
