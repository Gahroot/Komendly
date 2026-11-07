// Provider contract. Codex subscription is the default implementation; an
// OpenAI API-key implementation must be swappable via AI_PROVIDER=codex|openai.

export interface UsageMeter {
  /** Estimated USD micros for this call (subscription: amortised estimate; API: list price). */
  costMicros: number;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  latencyMs: number;
}

export interface TextRequest {
  system: string;
  prompt: string;
  /** zod-derived JSON schema for structured output; result is parsed JSON when set. */
  jsonSchema?: Record<string, unknown>;
  images?: Array<{ mediaType: string; base64: string }>; // vision input (e.g. QC on rendered ad)
  reasoning?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

export interface ImageRequest {
  prompt: string;
  size: string; // WIDTHxHEIGHT, multiples of 16
  quality?: "low" | "medium" | "high" | "auto";
  background?: "opaque" | "transparent";
  references?: Array<{ mediaType: string; base64: string }>; // up to 5 (edit mode)
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly name: "codex" | "openai";
  text(req: TextRequest): Promise<{ text: string; json?: unknown; usage: UsageMeter }>;
  image(req: ImageRequest): Promise<{ png: Buffer; width: number; height: number; usage: UsageMeter }>;
  /** Cheap check used by the heartbeat (e.g. Codex login expired -> ok:false). */
  health(): Promise<{ ok: boolean; message?: string }>;
}
