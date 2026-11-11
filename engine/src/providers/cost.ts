// Cost meter. Converts usage into estimated USD micros at OpenAI API list prices.
// Sources (checked 2026-11-07; override with ENGINE_PRICES_JSON, same shape as DEFAULT_PRICES):
// - Text, https://developers.openai.com/api/docs/pricing : gpt-6.1-sol $2 in / $10 out per 1M,
//   gpt-6-luna $0.10 / $0.50, gpt-6-astra $10 / $50. Unknown models fall back to "default".
// - gpt-image-2, same page + https://developers.openai.com/api/docs/guides/image-generation :
//   image out $30/1M tokens, image in $8/1M, text in $5/1M. Output per 1024x1024 image ~= $0.006 low,
//   $0.053 medium (1,756 tokens), $0.211 high; portrait sizes are a bit cheaper, so the square
//   price is used for every size (conservative). Reference images are always high fidelity:
//   ~2,000 input tokens each (estimate). Prompt ~1,500 text tokens per image call.
// - Codex subscription calls are billed by flat subscription, so these are *equivalents*
//   used to compare against the OpenAI API route and to size credit prices.
export interface PriceTable {
  text: Record<string, { inPerM: number; outPerM: number }>;
  image: Record<"low" | "medium" | "high" | "auto", number>;
  /** USD per reference image (input image tokens) and per image prompt (input text tokens). */
  imageRef: number;
  imagePrompt: number;
}

export const DEFAULT_PRICES: PriceTable = {
  text: {
    default: { inPerM: 2, outPerM: 10 },
    "gpt-6.1-sol": { inPerM: 2, outPerM: 10 },
    "gpt-6-luna": { inPerM: 0.1, outPerM: 0.5 },
    "gpt-6-astra": { inPerM: 10, outPerM: 50 },
  },
  image: { low: 0.006, medium: 0.053, high: 0.211, auto: 0.211 },
  imageRef: 0.016,
  imagePrompt: 0.0075,
};

export function loadPrices(env: NodeJS.ProcessEnv = process.env): PriceTable {
  const raw = env.ENGINE_PRICES_JSON;
  if (!raw) return DEFAULT_PRICES;
  const o = JSON.parse(raw) as Partial<PriceTable>;
  return {
    text: { ...DEFAULT_PRICES.text, ...o.text },
    image: { ...DEFAULT_PRICES.image, ...o.image },
    imageRef: o.imageRef ?? DEFAULT_PRICES.imageRef,
    imagePrompt: o.imagePrompt ?? DEFAULT_PRICES.imagePrompt,
  };
}

export function textCostMicros(p: PriceTable, model: string, inputTokens: number, outputTokens: number): number {
  const price = p.text[model] ?? p.text.default ?? { inPerM: 0, outPerM: 0 };
  // $/M tokens == micros per token
  return Math.round(inputTokens * price.inPerM + outputTokens * price.outPerM);
}

/** One image call = output image + prompt text + its reference images (input tokens). */
export function imageCostMicros(p: PriceTable, quality: "low" | "medium" | "high" | "auto", count = 1, references = 0): number {
  return Math.round((p.image[quality] * count + p.imagePrompt + p.imageRef * references) * 1_000_000);
}

export function sumCost(usages: ReadonlyArray<{ costMicros: number }>): number {
  return usages.reduce((a, u) => a + u.costMicros, 0);
}
