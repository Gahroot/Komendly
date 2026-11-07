// Deterministic post-LLM layout/asset assignment: template variety, real assets, limited imagery.
import type { AdSpec, Extraction } from "../../../src/lib/ads/contracts";
import { isCompleteSentence, jaccard, numbersIn } from "./grounding";

export const TEMPLATES = [
  "quote_thought",
  "hero_product",
  "before_after",
  "ui_card",
  "chat_moment",
  "notification",
  "pain_list",
  "testimonial",
  "offer_card",
  "problem_scene",
  "stat_card",
  "founder_note",
  "minimal_type",
] as const;
export type Template = string;

/** Image-led template ids (used when present in the renderer's TEMPLATE_IDS). */
export const IMAGE_LED = ["photo_fullbleed", "photo_split", "product_spotlight", "photo_collage", "screenshot_device", "photo_caption", "hero_product", "ui_card"];

export const TEMPLATE_GUIDE = `Layouts (set visual.layout to exactly one id; use many different ones):
- quote_thought: the buyer's private thought as a big quote
- chat_moment: the moment as a short chat/DM exchange
- notification: the moment as a phone notification
- before_after: life before vs after (two sides)
- pain_list: 2-4 short pains the buyer recognises
- ui_card: a clean rebuild/screenshot of the product UI (needs a screenshot asset)
- hero_product: big real product image/screenshot (needs an asset)
- testimonial: ONLY with a real customer quote from PROOF
- stat_card: ONLY with a real number from FACTS
- offer_card: the offer/CTA plainly (most_aware)
- problem_scene: generated scene of the problem, no people's faces (max 1-2 per run)
- founder_note: a short plain note in the brand's voice
- minimal_type: big headline only
- photo_fullbleed / photo_split / photo_caption: a real site photo carries the ad, short headline (needs an asset)
- product_spotlight: a real product image centre stage (needs a product asset)
- photo_collage: 3+ real site images
- screenshot_device: a real screenshot in a device frame (needs a screenshot)
Prefer image-led layouts: at least half of the ads should be built on the site's real images when assets exist.`;

const ALIASES: Array<[RegExp, Template]> = [
  [/quote|thought/, "quote_thought"],
  [/chat|dm|message|text/, "chat_moment"],
  [/notif|push|alert/, "notification"],
  [/before|after|split|vs/, "before_after"],
  [/list|pains|bullet/, "pain_list"],
  [/ui|dashboard|screen|app/, "ui_card"],
  [/hero|product|shot/, "hero_product"],
  [/testimonial|review/, "testimonial"],
  [/stat|number|metric/, "stat_card"],
  [/offer|cta|price/, "offer_card"],
  [/scene|photo|illustr/, "problem_scene"],
  [/founder|note|letter/, "founder_note"],
];

export function normalizeTemplate(layout: string, known: readonly string[] = TEMPLATES): Template | null {
  const k = layout.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const exact = known.find((t) => t === k);
  if (exact) return exact;
  for (const [re, t] of ALIASES) if (re.test(k)) return t;
  return null;
}

type Asset = Extraction["assets"][number];
type Proof = Extraction["proof"][number];

export interface LayoutContext {
  assets: Asset[];
  proof: Proof[];
  /** Renderer's TEMPLATE_IDS at runtime (defaults to the built-in list). */
  templates?: readonly string[];
  /** Image-led ids the renderer offers for this brand (imageLayoutsFor), else IMAGE_LED ∩ templates. */
  imageTemplates?: readonly string[];
  minDistinct?: number;
  minImageAds?: number;
  maxImagery?: number;
}

function usable(a: Asset): boolean {
  return a.kind !== "icon" && a.width >= 300 && a.height >= 200;
}

const BY_AWARENESS: Record<AdSpec["awareness"], Template[]> = {
  unaware: ["quote_thought", "photo_caption", "notification", "chat_moment", "photo_fullbleed", "problem_scene", "minimal_type", "before_after"],
  problem_aware: ["quote_thought", "photo_fullbleed", "chat_moment", "notification", "photo_split", "pain_list", "before_after", "photo_caption", "problem_scene", "minimal_type", "founder_note"],
  solution_aware: ["photo_split", "before_after", "screenshot_device", "ui_card", "product_spotlight", "hero_product", "photo_collage", "founder_note", "stat_card", "pain_list", "minimal_type"],
  product_aware: ["testimonial", "product_spotlight", "screenshot_device", "ui_card", "photo_collage", "hero_product", "stat_card", "before_after", "offer_card"],
  most_aware: ["offer_card", "product_spotlight", "hero_product", "photo_fullbleed", "testimonial", "minimal_type"],
};

/** A complete, verbatim testimonial quote for this ad (prefers one its claims reference). */
export function testimonialFor(s: AdSpec, proof: Proof[]): Proof | null {
  const full = proof.filter((p) => p.kind === "testimonial" && p.quote && isCompleteSentence(p.quote));
  if (!full.length) return null;
  const claimText = s.claims.map((c) => c.claim).join(" ");
  return [...full].sort((a, b) => jaccard(claimText, b.quote ?? "") - jaccard(claimText, a.quote ?? ""))[0] ?? null;
}

export function assignLayouts(specs: AdSpec[], ctx: LayoutContext): AdSpec[] {
  const known = ctx.templates?.length ? [...ctx.templates] : [...TEMPLATES];
  const assets = ctx.assets.filter(usable);
  const noFace = assets.filter((a) => !a.hasFace);
  const screenshots = noFace.filter((a) => a.kind === "screenshot");
  const products = assets.filter((a) => a.kind === "product");
  const photos = assets.filter((a) => a.kind === "photo" || a.kind === "product" || a.kind === "illustration" || a.kind === "other");
  const imageSet = new Set(
    (ctx.imageTemplates?.length ? ctx.imageTemplates : IMAGE_LED).filter((t) => known.includes(t)),
  );
  const statics = specs.filter((s) => s.kind === "static");
  const maxImagery = ctx.maxImagery ?? 2;

  const needs = (t: Template): Asset[] | null => {
    if (t === "ui_card" || t === "screenshot_device") return screenshots.length ? screenshots : null;
    if (t === "product_spotlight") return products.length ? products : null;
    if (t === "hero_product") return products.length || screenshots.length ? [...products, ...screenshots] : noFace.length ? noFace : null;
    if (t === "photo_collage") return assets.length >= 3 ? assets : null;
    if (imageSet.has(t)) return (photos.length ? photos : assets).length ? (photos.length ? photos : assets) : null;
    return [];
  };
  const counts = new Map<Template, number>();
  const okFor = (s: AdSpec, t: Template) => {
    if (!known.includes(t)) return false;
    const claimText = s.claims.map((c) => c.claim).join(" ");
    if (t === "stat_card" && numbersIn(claimText).length === 0) return false;
    if (t === "testimonial" && !testimonialFor(s, ctx.proof)) return false;
    if (t === "offer_card" && (s.awareness === "unaware" || s.awareness === "problem_aware")) return false;
    if (t === "problem_scene" && (counts.get(t) ?? 0) >= maxImagery) return false;
    return needs(t) !== null;
  };
  const imageCapable = [...imageSet].filter((t) => needs(t) !== null);
  const target = Math.min(ctx.minDistinct ?? 6, statics.length);
  const cap = Math.max(1, Math.ceil(statics.length / Math.max(1, target)));
  const chosen = new Map<number, Template>();
  const bump = (t: Template, d: number) => counts.set(t, (counts.get(t) ?? 0) + d);

  for (const s of statics) {
    const want = normalizeTemplate(s.visual.layout, known);
    const order = [...(want ? [want] : []), ...BY_AWARENESS[s.awareness], ...known];
    const pick = order.find((t) => okFor(s, t) && (counts.get(t) ?? 0) < cap) ?? order.find((t) => okFor(s, t)) ?? "minimal_type";
    chosen.set(s.index, pick);
    bump(pick, 1);
  }

  // Image-led quota: when the site has usable images, >= minImageAds ads are built on them.
  const imgCount = () => statics.filter((s) => imageSet.has(chosen.get(s.index) ?? "")).length;
  const wantImg = imageCapable.length ? Math.min(ctx.minImageAds ?? 5, statics.length) : 0;
  // Convert solution/product/most-aware first, then from the back, never the last of a template.
  const convertOrder = [...statics].sort((a, b) => {
    const rank = (x: AdSpec) => (x.awareness === "problem_aware" || x.awareness === "unaware" ? 1 : 0);
    return rank(a) - rank(b) || b.index - a.index;
  });
  for (const s of convertOrder) {
    if (imgCount() >= wantImg) break;
    const cur = chosen.get(s.index) ?? "minimal_type";
    if (imageSet.has(cur)) continue;
    const alt = [...BY_AWARENESS[s.awareness], ...imageCapable]
      .filter((t) => imageSet.has(t) && okFor(s, t))
      .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
    if (!alt) continue;
    bump(cur, -1);
    bump(alt, 1);
    chosen.set(s.index, alt);
  }

  // Variety: move ads off over-used templates into unused eligible ones (keeping the image quota).
  const distinct = () => new Set(chosen.values()).size;
  for (const s of [...statics].reverse()) {
    if (distinct() >= target) break;
    const cur = chosen.get(s.index);
    if (!cur || (counts.get(cur) ?? 0) < 2) continue;
    const curImg = imageSet.has(cur);
    const alt = [...BY_AWARENESS[s.awareness], ...known].find(
      (t) => !counts.get(t) && okFor(s, t) && (!curImg || imageSet.has(t) || imgCount() > wantImg),
    );
    if (!alt) continue;
    bump(cur, -1);
    bump(alt, 1);
    chosen.set(s.index, alt);
  }

  // Assets: spread different real images across image-led ads.
  const used = new Map<string, number>();
  const pickAsset = (pool: Asset[], n: number): string[] => {
    const sorted = [...pool].sort((a, b) => (used.get(a.key) ?? 0) - (used.get(b.key) ?? 0) || b.width * b.height - a.width * a.height || a.key.localeCompare(b.key));
    const keys = sorted.slice(0, n).map((a) => a.key);
    for (const k of keys) used.set(k, (used.get(k) ?? 0) + 1);
    return keys;
  };
  const knownKeys = new Set(assets.map((a) => a.key));
  return specs.map((s) => {
    const t = s.kind === "static" ? (chosen.get(s.index) ?? "minimal_type") : (normalizeTemplate(s.visual.layout, known) ?? s.visual.layout);
    let keys = s.visual.assetKeys.filter((k) => knownKeys.has(k));
    const pool = s.kind === "static" ? needs(t) : null;
    if (pool && pool.length) {
      const fit = keys.filter((k) => pool.some((a) => a.key === k));
      keys = fit.length ? fit : pickAsset(pool, t === "photo_collage" ? 3 : 1);
    } else if (s.kind === "static" && !imageSet.has(t) && t !== "before_after") {
      keys = [];
    }
    if (s.kind === "motion" && keys.length === 0 && assets.length) keys = pickAsset(noFace.length ? noFace : assets, 3);
    const imagery = t === "problem_scene";
    // Testimonial renders claims[0] as the quote: make it the complete verbatim sentence.
    const quote = t === "testimonial" ? testimonialFor(s, ctx.proof) : null;
    const claims = quote?.quote ? [{ claim: quote.quote, sourceUrl: quote.sourceUrl }, ...s.claims.filter((c) => c.claim !== quote.quote)] : s.claims;
    return {
      ...s,
      claims,
      visual: { ...s.visual, layout: t, assetKeys: keys, generateImagery: imagery, imageryPrompt: imagery ? (s.visual.imageryPrompt ?? s.visual.concept) : undefined },
    };
  });
}
