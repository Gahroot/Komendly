// Scene plan: the only creative choices left to the LLM. Every on-screen word comes from the
// AdSpec (hook, headline, body, cta, claims) or the BrandKit; the plan only splits, orders and
// picks among them, and `sanitizePlan` rejects anything else.
import { balanceLines } from "./composition";
import { z } from "zod";
import type { AdSpec } from "../../../../src/lib/ads/contracts";
import type { BrandKit } from "../../render/static/types";

export const HOOK_STYLES = ["thought", "chat", "bold"] as const;
export const PRODUCT_MOVES = ["scroll", "push", "tilt"] as const;

export const ScenePlanSchema = z.object({
  hookStyle: z.enum(HOOK_STYLES),
  /** The hook split into 1-4 display lines; joined they must equal the hook's words. */
  hookLines: z.array(z.string()).min(1).max(4),
  /** Up to 2 words of the hook to color with the accent. */
  emphasis: z.array(z.string()).max(2),
  productAssetKey: z.string().nullable(),
  secondaryAssetKey: z.string().nullable(),
  productMove: z.enum(PRODUCT_MOVES),
  /** Indexes into spec.claims shown as chips (max 3). */
  claimIndexes: z.array(z.number().int()).max(3),
  showBody: z.boolean(),
  backgroundHex: z.string().nullable(),
  accentHex: z.string().nullable(),
});
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

/** JSON schema handed to the provider for structured output. */
export const SCENE_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["hookStyle", "hookLines", "emphasis", "productAssetKey", "secondaryAssetKey", "productMove", "claimIndexes", "showBody", "backgroundHex", "accentHex"],
  properties: {
    hookStyle: { type: "string", enum: [...HOOK_STYLES] },
    hookLines: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
    emphasis: { type: "array", items: { type: "string" }, maxItems: 2 },
    productAssetKey: { type: ["string", "null"] },
    secondaryAssetKey: { type: ["string", "null"] },
    productMove: { type: "string", enum: [...PRODUCT_MOVES] },
    claimIndexes: { type: "array", items: { type: "integer" }, maxItems: 3 },
    showBody: { type: "boolean" },
    backgroundHex: { type: ["string", "null"] },
    accentHex: { type: ["string", "null"] },
  },
};

const words = (s: string) => s.replace(/[\u201c\u201d"]/g, "").split(/\s+/).filter(Boolean);

/** Visual assets usable as the product shot, best first (screenshots/products, faces last). */
export function rankAssets(spec: AdSpec, brand: BrandKit): BrandKit["assets"] {
  const wanted = new Set(spec.visual.assetKeys);
  const score = (a: BrandKit["assets"][number]) =>
    (wanted.has(a.key) ? 100 : 0) +
    ({ screenshot: 40, product: 35, illustration: 20, photo: 15, other: 5, icon: 0 } as const)[a.kind] -
    (a.hasFace ? 30 : 0) +
    Math.min(10, (a.width * a.height) / 200_000);
  return [...brand.assets].filter((a) => a.kind !== "icon" && a.width >= 300 && a.height >= 200).sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key));
}

/** Split text into balanced lines of about `target` characters. */
export function splitLines(text: string, maxLines: number, target = 14): string[] {
  const n = Math.min(maxLines, Math.max(1, Math.round(text.trim().length / target)));
  return balanceLines(text, n);
}

/** Deterministic plan used when the LLM is unavailable or returns something unusable. */
export function defaultPlan(spec: AdSpec, brand: BrandKit): ScenePlan {
  const assets = rankAssets(spec, brand);
  const first = assets[0];
  const second = assets.find((a) => a.key !== first?.key && !a.hasFace);
  const hook = spec.hook.trim();
  return {
    hookStyle: /^["\u201c]/.test(hook) ? "chat" : /\?$|^i\b|\bmy\b|\bi'm\b|\bwhy\b/i.test(hook) ? "thought" : "bold",
    hookLines: splitLines(hook, 4),
    emphasis: [],
    productAssetKey: first?.key ?? null,
    secondaryAssetKey: second?.key ?? null,
    productMove: first && first.height / first.width > 1.3 ? "scroll" : "push",
    claimIndexes: spec.claims.slice(0, 3).map((_, i) => i),
    showBody: false,
    backgroundHex: null,
    accentHex: null,
  };
}

/** Keep only choices that reference the spec/brand; fall back field by field. */
export function sanitizePlan(raw: unknown, spec: AdSpec, brand: BrandKit): { plan: ScenePlan; fixes: string[] } {
  const base = defaultPlan(spec, brand);
  const parsed = ScenePlanSchema.safeParse(raw);
  if (!parsed.success) return { plan: base, fixes: ["plan:invalid"] };
  const p = parsed.data;
  const fixes: string[] = [];
  const hookWords = words(spec.hook).join(" ").toLowerCase();
  const lines = p.hookLines.map((l) => l.trim()).filter(Boolean);
  const hookLines = words(lines.join(" ")).join(" ").toLowerCase() === hookWords ? lines : (fixes.push("hookLines"), base.hookLines);
  const hookSet = new Set(words(spec.hook).map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")));
  const emphasis = p.emphasis.filter((w) => hookSet.has(w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")));
  if (emphasis.length !== p.emphasis.length) fixes.push("emphasis");
  const keys = new Set(brand.assets.map((a) => a.key));
  const assetOk = (k: string | null) => k === null || keys.has(k);
  const productAssetKey = assetOk(p.productAssetKey) && p.productAssetKey ? p.productAssetKey : (fixes.push("productAssetKey"), base.productAssetKey);
  const secondaryAssetKey = assetOk(p.secondaryAssetKey) && p.secondaryAssetKey !== productAssetKey ? p.secondaryAssetKey : null;
  const claimIndexes = [...new Set(p.claimIndexes)].filter((i) => i >= 0 && i < spec.claims.length);
  const brandHexes = new Set(brand.colors.map((c) => c.hex.toLowerCase()));
  const hexOk = (h: string | null) => (h && brandHexes.has(h.toLowerCase()) ? h : null);
  return {
    plan: {
      ...p,
      hookLines,
      emphasis,
      productAssetKey,
      secondaryAssetKey,
      claimIndexes,
      showBody: p.showBody && !!spec.body,
      backgroundHex: hexOk(p.backgroundHex),
      accentHex: hexOk(p.accentHex),
    },
    fixes,
  };
}

/** Strict, non-interactive brief for the scene-plan call. */
export function buildPlanBrief(spec: AdSpec, brand: BrandKit, maxSeconds: number): { system: string; prompt: string } {
  const assets = rankAssets(spec, brand).slice(0, 8);
  const system = [
    "You plan a short animated social ad from a fixed template. You never write new copy.",
    "Rules: every on-screen word already exists in the input. hookLines must contain exactly the hook's words, in order, only split into short display lines (max ~18 characters per line, 1-4 lines).",
    "Never invent claims, numbers, results or guarantees; claimIndexes only point at given claims.",
    "Pick hookStyle: 'thought' for a private thought or question in the buyer's voice, 'chat' if it reads like a message the buyer would send, 'bold' for a blunt statement.",
    "Pick the clearest product asset (screenshots/products first; assets with hasFace are shown as-is only and are poor product shots).",
    "productMove: 'scroll' for tall page screenshots, 'push' for wide shots, 'tilt' for product UI.",
    "backgroundHex/accentHex must be from the brand colors (or null). Choose high contrast. Reply with JSON only.",
  ].join("\n");
  const prompt = JSON.stringify(
    {
      durationSeconds: maxSeconds,
      brand: brand.brandName,
      colors: brand.colors,
      awareness: spec.awareness,
      angle: spec.angle,
      hook: spec.hook,
      headline: spec.headline,
      body: spec.body ?? null,
      cta: spec.cta ?? null,
      claims: spec.claims.map((c, i) => ({ index: i, claim: c.claim })),
      concept: spec.visual.concept,
      assets: assets.map((a) => ({ key: a.key, kind: a.kind, width: a.width, height: a.height, hasFace: a.hasFace })),
    },
    null,
    1,
  );
  return { system, prompt };
}
