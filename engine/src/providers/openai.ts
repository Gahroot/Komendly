// OpenAI API-key provider (AI_PROVIDER=openai): Responses API for text, Images API for gpt-image.
import type { AIProvider, ImageRequest, TextRequest, UsageMeter } from "./types";
import { imageCostMicros, textCostMicros, type PriceTable } from "./cost";
import { ProviderUnavailableError } from "./errors";
import { imageSize } from "./image-size";
import { parseModelJson } from "./json";
import type { Limiter } from "./limiter";

export interface OpenAIProviderOptions {
  apiKey: string | undefined;
  baseUrl?: string;
  textModel: string;
  imageModel: string;
  prices: PriceTable;
  limiter: Limiter;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  constructor(private readonly o: OpenAIProviderOptions) {}

  private key(): string {
    if (!this.o.apiKey) throw new ProviderUnavailableError("OPENAI_API_KEY not configured");
    return this.o.apiKey;
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.o.baseUrl ?? "https://api.openai.com/v1"}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const text = await res.text();
    if (res.status === 429) throw new ProviderUnavailableError(`OpenAI rate limit: ${text.slice(0, 300)}`, 60_000);
    if (!res.ok) throw new Error(`OpenAI ${path} (${res.status}): ${text.slice(0, 500)}`);
    return JSON.parse(text) as Record<string, unknown>;
  }

  async text(req: TextRequest): Promise<{ text: string; json?: unknown; usage: UsageMeter }> {
    return this.o.limiter.run(async () => {
      const started = Date.now();
      const content: unknown[] = [{ type: "input_text", text: req.prompt }];
      for (const i of req.images ?? []) content.push({ type: "input_image", image_url: `data:${i.mediaType};base64,${i.base64}` });
      const body: Record<string, unknown> = {
        model: this.o.textModel,
        instructions: req.system,
        input: [{ role: "user", content }],
        reasoning: { effort: req.reasoning ?? "low" },
        store: false,
      };
      if (req.jsonSchema) {
        body.text = { format: { type: "json_schema", name: "result", schema: req.jsonSchema, strict: false } };
      }
      const r = await this.post("/responses", body, req.signal);
      const output = (r.output ?? []) as Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
      const text = output
        .filter((o) => o.type === "message")
        .flatMap((o) => o.content ?? [])
        .map((c) => c.text ?? "")
        .join("");
      const u = (r.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
      const inTok = u.input_tokens ?? 0;
      const outTok = u.output_tokens ?? 0;
      return {
        text,
        json: req.jsonSchema ? parseModelJson(text) : undefined,
        usage: {
          latencyMs: Date.now() - started,
          inputTokens: inTok,
          outputTokens: outTok,
          costMicros: textCostMicros(this.o.prices, this.o.textModel, inTok, outTok),
        },
      };
    }, req.signal);
  }

  async image(req: ImageRequest): Promise<{ png: Buffer; width: number; height: number; usage: UsageMeter }> {
    return this.o.limiter.run(async () => {
      const started = Date.now();
      const quality = req.quality ?? "auto";
      let r: Record<string, unknown>;
      if (req.references?.length) {
        const form = new FormData();
        form.set("model", this.o.imageModel);
        form.set("prompt", req.prompt);
        form.set("size", req.size);
        form.set("quality", quality);
        for (const [i, ref] of req.references.slice(0, 5).entries()) {
          form.append("image[]", new Blob([Buffer.from(ref.base64, "base64")], { type: ref.mediaType }), `ref${i}.png`);
        }
        const res = await fetch(`${this.o.baseUrl ?? "https://api.openai.com/v1"}/images/edits`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.key()}` },
          body: form,
          signal: req.signal,
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`OpenAI images/edits (${res.status}): ${text.slice(0, 500)}`);
        r = JSON.parse(text) as Record<string, unknown>;
      } else {
        r = await this.post(
          "/images/generations",
          { model: this.o.imageModel, prompt: req.prompt, size: req.size, quality, background: req.background ?? "opaque" },
          req.signal,
        );
      }
      const b64 = (r.data as Array<{ b64_json?: string }> | undefined)?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI Images API returned no image");
      const png = Buffer.from(b64, "base64");
      const dims = imageSize(png) ?? { width: 0, height: 0 };
      return { png, ...dims, usage: { latencyMs: Date.now() - started, images: 1, costMicros: imageCostMicros(this.o.prices, quality, 1, req.references?.length ?? 0) } };
    }, req.signal);
  }

  async health(): Promise<{ ok: boolean; message?: string }> {
    return this.o.apiKey ? { ok: true } : { ok: false, message: "OPENAI_API_KEY not configured" };
  }
}
