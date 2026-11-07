// Codex image endpoints, called exactly as ezcoder's generate_image tool does
// (/Users/groot/ezcoder/packages/cli/src/tools/generate-image.ts): plain JSON POST to
// chatgpt.com/backend-api/codex/images/{generations|edits}, codex client identity headers,
// up to 4 retries on 5xx / connection errors (never on 4xx), Retry-After honoured,
// otherwise 200ms doubling with ±10% jitter.
import { randomUUID } from "node:crypto";
import os from "node:os";
import { CODEX_CLIENT_VERSION } from "@prestyj/ai";
import { sleep } from "../util/sleep";

export const CODEX_IMAGES_BASE = "https://chatgpt.com/backend-api/codex/images";
export const IMAGE_MODEL = "gpt-image-2";
const MAX_EDIT_IMAGES = 5;
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 200;

export class ImageAccessError extends Error {}
export class ImageLimitError extends Error {
  constructor(
    message: string,
    readonly resetsAt: number | undefined,
  ) {
    super(message);
  }
}

export function retryDelayMs(retry: number, retryAfter: string | null, random = Math.random, now = Date.now): number {
  const value = retryAfter?.trim();
  if (value) {
    if (/^\d+$/.test(value)) return Number(value) * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - now());
  }
  const jitter = 0.9 + random() * 0.2;
  return Math.floor(RETRY_BASE_DELAY_MS * 2 ** (retry - 1) * jitter);
}

export interface CodexImageCall {
  prompt: string;
  size: string;
  quality: "low" | "medium" | "high" | "auto";
  background: "opaque" | "transparent";
  references?: Array<{ mediaType: string; base64: string }>;
  token: string;
  accountId: string | undefined;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function codexImage(c: CodexImageCall): Promise<Buffer> {
  const request: Record<string, unknown> = {
    prompt: c.prompt,
    background: c.background,
    model: IMAGE_MODEL,
    quality: c.quality,
    size: c.size,
  };
  const refs = (c.references ?? []).slice(0, MAX_EDIT_IMAGES);
  if (refs.length > 0) request.images = refs.map((r) => ({ image_url: `data:${r.mediaType};base64,${r.base64}` }));
  const url = `${CODEX_IMAGES_BASE}/${refs.length > 0 ? "edits" : "generations"}`;
  const turnId = randomUUID();
  const body = JSON.stringify(request);
  const signal = c.signal ?? new AbortController().signal;
  const f = c.fetchImpl ?? fetch;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    let text: string;
    try {
      res = await f(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.token}`,
          ...(c.accountId ? { "chatgpt-account-id": c.accountId } : {}),
          originator: "codex_cli_rs",
          "User-Agent": `codex_cli_rs/${CODEX_CLIENT_VERSION} (${os.type()} ${os.release()}; ${os.arch()})`,
          version: CODEX_CLIENT_VERSION,
          "x-codex-image-turn-id": turnId,
        },
        body,
        signal,
      });
      text = await res.text();
    } catch (err) {
      if (signal.aborted || attempt >= MAX_RETRIES) throw err;
      await sleep(retryDelayMs(attempt + 1, null), signal);
      continue;
    }
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(attempt + 1, res.headers.get("retry-after")), signal);
      continue;
    }
    return parseImageResponse(res.status, text, attempt + 1);
  }
}

function parseImageResponse(status: number, text: string, attempts: number): Buffer {
  if (status === 403) throw new ImageAccessError("Codex image generation refused (403): account lacks image access");
  if (status < 200 || status >= 300) {
    let detail = text.slice(0, 500);
    let type: string | undefined;
    let resetsAt: number | undefined;
    try {
      const p = JSON.parse(text) as { detail?: string; error?: { message?: string; type?: string; resets_at?: number } };
      type = p.error?.type;
      resetsAt = typeof p.error?.resets_at === "number" ? p.error.resets_at : undefined;
      detail = p.detail ?? p.error?.message ?? detail;
    } catch {
      /* raw text */
    }
    if (status === 429 && type === "usage_limit_reached") throw new ImageLimitError(detail, resetsAt);
    throw new Error(`Codex Image API (${status})${attempts > 1 ? ` after ${attempts} attempts` : ""}: ${detail}`);
  }
  const p = JSON.parse(text) as { data?: Array<{ b64_json?: unknown }> };
  const b64 = p.data?.map((d) => d.b64_json).find((x): x is string => typeof x === "string" && x.length > 0);
  if (!b64) throw new Error("Image generation returned no image (possibly blocked by moderation)");
  return Buffer.from(b64, "base64");
}
