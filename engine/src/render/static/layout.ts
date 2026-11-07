// Template ids, selection and per-ratio safe zones.
import type { AdSpec, Ratio } from "../../../../src/lib/ads/contracts";
import { RATIO_PIXELS } from "../../../../src/lib/ads/contracts";

export const TEMPLATE_IDS = [
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
  // image-led (real site assets)
  "photo_fullbleed",
  "photo_split",
  "product_spotlight",
  "photo_collage",
  "screenshot_device",
  "photo_caption",
  "photo_before_after",
] as const;
export const IMAGE_TEMPLATE_IDS = [
  "photo_fullbleed",
  "photo_split",
  "product_spotlight",
  "photo_collage",
  "screenshot_device",
  "photo_caption",
  "photo_before_after",
] as const satisfies ReadonlyArray<(typeof TEMPLATE_IDS)[number]>;
export type ImageTemplateId = (typeof IMAGE_TEMPLATE_IDS)[number];
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface SafeZone {
  top: number;
  bottom: number;
  x: number;
}

/** Pixel insets that key content must stay inside. 9:16 keeps top 14% / bottom 20% clear (Reels/Stories UI). */
export function safeZone(ratio: Ratio): SafeZone {
  const { height } = RATIO_PIXELS[ratio];
  if (ratio === "9:16") return { top: Math.round(height * 0.14), bottom: Math.round(height * 0.2), x: 84 };
  return { top: 80, bottom: 80, x: 80 };
}

/** Minimum headline size in px at 1080 wide (≈ 22pt on a phone). */
export const HEADLINE_MIN_PX = 60;
export const BODY_MIN_PX = 34;

const ALIASES: Array<[RegExp, TemplateId]> = [
  [/before.?after.*photo|photo.*before.?after|real.?before/, "photo_before_after"],
  [/full.?bleed|background.?(photo|image)|bg.?(photo|image)|photo.?(background|bg)|hero.?photo/, "photo_fullbleed"],
  [/photo.?split|image.?split|half.?photo/, "photo_split"],
  [/spotlight|packshot|product.?stage|product.?shot/, "product_spotlight"],
  [/collage|grid|mosaic|gallery/, "photo_collage"],
  [/device|browser|laptop|phone|mockup|screenshot/, "screenshot_device"],
  [/caption|editorial|photo.?quote/, "photo_caption"],
  [/before|after|split|versus|\bvs\b/, "before_after"],
  [/chat|message|sms|text_?moment|imessage|dm/, "chat_moment"],
  [/notif|push|lock_?screen/, "notification"],
  [/testimonial|review|proof/, "testimonial"],
  [/stat|number|metric/, "stat_card"],
  [/founder|letter|note/, "founder_note"],
  [/pain|list|checklist/, "pain_list"],
  [/offer|cta|promo|deal/, "offer_card"],
  [/scene|photo|lifestyle|imagery/, "problem_scene"],
  [/dashboard|\bui\b|ui_|app|screen|card/, "ui_card"],
  [/product|hero|shot/, "hero_product"],
  [/quote|thought|confession/, "quote_thought"],
  [/minimal|typo|type|headline/, "minimal_type"],
];

const BY_AWARENESS: Record<AdSpec["awareness"], TemplateId[]> = {
  unaware: ["quote_thought", "problem_scene", "chat_moment", "minimal_type"],
  problem_aware: ["quote_thought", "pain_list", "chat_moment", "problem_scene", "notification", "before_after", "minimal_type"],
  solution_aware: ["hero_product", "ui_card", "before_after", "founder_note", "notification"],
  product_aware: ["offer_card", "testimonial", "stat_card", "hero_product", "ui_card"],
  most_aware: ["offer_card", "testimonial", "stat_card", "minimal_type"],
};

export interface TemplateCapabilities {
  hasNumber: boolean;
  hasQuote: boolean;
  hasVisual: boolean; // real asset or generated imagery
  hasSceneVisual: boolean; // full-bleed-safe visual (no faces)
}

/** Template named (or aliased) by spec.visual.layout, or null when it names none. */
export function matchTemplate(spec: AdSpec): TemplateId | null {
  const key = spec.visual.layout.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const exact = TEMPLATE_IDS.find((t) => t === key);
  if (exact) return exact;
  for (const [re, id] of ALIASES) if (re.test(key)) return id;
  return null;
}

export function isImageTemplateId(id: string): id is ImageTemplateId {
  return (IMAGE_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function requestedTemplate(spec: AdSpec): TemplateId {
  const m = matchTemplate(spec);
  if (m) return m;
  const list = BY_AWARENESS[spec.awareness];
  return list[Math.abs(spec.index) % list.length] ?? "minimal_type";
}

/** Downgrade a template whose required material is missing (never invent numbers, quotes or images). */
export function resolveTemplate(id: TemplateId, cap: TemplateCapabilities): TemplateId {
  if (id === "stat_card" && !cap.hasNumber) return "minimal_type";
  if (id === "testimonial" && !cap.hasQuote) return "quote_thought";
  if (id === "problem_scene" && !cap.hasSceneVisual) return cap.hasVisual ? "hero_product" : "quote_thought";
  if (id === "hero_product" && !cap.hasVisual) return "ui_card";
  return id;
}

/** First number-like token in a claim ("43%", "$1.2M", "10,000+", "3x"). */
export function extractNumber(text: string): string | null {
  const m = text.match(/[$€£]?\d[\d,.]*\s?(?:%|x|×|\+|k|K|M|B)?\+?/);
  return m ? m[0].trim() : null;
}
