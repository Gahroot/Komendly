// Cost meter. Converts usage into estimated USD micros at API list-price equivalents.
// Assumptions (override with ENGINE_PRICES_JSON, same shape as DEFAULT_PRICES):
// - Text: per-million-token prices per model. gpt-6.1-sol $2 in / $10 out (ezcoder model
//   registry, 2026-10). Unknown models fall back to "default".
// - Images (gpt-image-2): flat per-image price by quality, roughly gpt-image-1 1024² list
//   prices scaled to ~1080px ads: low $0.011, medium $0.042, high/auto $0.167.
// - Codex subscription calls are billed by flat subscription, so these are *equivalents*
//   used to compare against the OpenAI API route and to size credit prices.
export interface PriceTable {
  text: Record<string, { inPerM: number; outPerM: number }>;
  image: Record<"low" | "medium" | "high" | "auto", number>;
}

export const DEFAULT_PRICES: PriceTable = {
  text: {
    default: { inPerM: 2, outPerM: 10 },
    "gpt-6.1-sol": { inPerM: 2, outPerM: 10 },
    "gpt-6-luna": { inPerM: 0.4, outPerM: 2 },
    "gpt-6-astra": { inPerM: 10, outPerM: 40 },
  },
  image: { low: 0.011, medium: 0.042, high: 0.167, auto: 0.167 },
};

export function loadPrices(env: NodeJS.ProcessEnv = process.env): PriceTable {
  const raw = env.ENGINE_PRICES_JSON;
  if (!raw) return DEFAULT_PRICES;
  const o = JSON.parse(raw) as Partial<PriceTable>;
  return { text: { ...DEFAULT_PRICES.text, ...o.text }, image: { ...DEFAULT_PRICES.image, ...o.image } };
}

export function textCostMicros(p: PriceTable, model: string, inputTokens: number, outputTokens: number): number {
  const price = p.text[model] ?? p.text.default ?? { inPerM: 0, outPerM: 0 };
  // $/M tokens == micros per token
  return Math.round(inputTokens * price.inPerM + outputTokens * price.outPerM);
}

export function imageCostMicros(p: PriceTable, quality: "low" | "medium" | "high" | "auto", count = 1): number {
  return Math.round(p.image[quality] * 1_000_000 * count);
}

export function sumCost(usages: ReadonlyArray<{ costMicros: number }>): number {
  return usages.reduce((a, u) => a + u.costMicros, 0);
}
