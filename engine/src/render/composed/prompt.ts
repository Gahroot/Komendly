// Builds the gpt-image-2 prompt for a fully composed ad. Lean is the production style; detailed kept for A/B.
import type { AdSpec, Ratio } from "../../../../src/lib/ads/contracts";
import type { BrandKit } from "../static/types";
import { sceneFor } from "./scene";

export type PromptStyle = "lean" | "detailed";
export const BODY_MAX = 90;

export interface ComposedPromptInput {
  spec: AdSpec;
  brand: Pick<BrandKit, "brandName" | "colors" | "fonts">;
  /** Short labels of the reference images in order, e.g. "product photo". */
  refLabels: string[];
  style: PromptStyle;
  ratio?: Ratio;
  /** Extra instruction after a failed QC. */
  strictNote?: string;
  /** True when the brand has real screenshots (software); enables device scenes. */
  hasScreens?: boolean;
  /** Alternative scene index offset (diversity regeneration). */
  sceneShift?: number;
}

function palette(brand: ComposedPromptInput["brand"]): string {
  return brand.colors.slice(0, 4).map((c) => `${c.hex} (${c.role})`).join(", ") || "neutral";
}

function fontFeel(brand: ComposedPromptInput["brand"]): string {
  const f = brand.fonts.map((x) => x.family).filter(Boolean);
  return f.length ? `${f.slice(0, 2).join(" / ")}-style type` : "clean modern sans-serif";
}

function refs(labels: string[]): string {
  return labels.map((l, i) => `image ${i + 1} = ${l}`).join("; ");
}

/** Body copy is rendered only when short enough to stay readable. */
export function renderedBody(spec: AdSpec): string | undefined {
  return spec.body && spec.body.length <= BODY_MAX ? spec.body : undefined;
}

export function buildComposedPrompt(i: ComposedPromptInput): string {
  const { spec, brand } = i;
  const body = renderedBody(spec);
  const text = [`Headline (exact): "${spec.headline}"`, body ? `Small subline (exact): "${body}"` : "", spec.cta ? `Call to action (exact), as plain text followed by an arrow, never inside a button or pill: "${spec.cta} →"` : ""].filter(Boolean).join("\n");
  if (i.style === "lean") {
    return [
      `Premium ${i.ratio ?? "4:5"} social ad for ${brand.brandName}. Angle: ${spec.angle}. Idea: ${spec.visual.concept}`,
      `Scene (derive the place and moment from the angle): ${sceneFor(spec.index, i.hasScreens, i.sceneShift)}.`,
      `References: ${refs(i.refLabels)}. Show the real product/photo faithfully. Ignore any words inside the references; never copy them.`,
      i.hasScreens ? `Any screen shows exactly the reference screenshot, nothing invented.` : `No visible screen UI: any phone or laptop is off or out of frame.`,
      `Never draw the brand name, logo or wordmark (it is added later); a label already on the real product is fine.`,
      `Show only products and devices that appear in the references. Do not invent products, remotes, gadgets or hardware; generic props (furniture, plants, a ladder) are fine.`,
      text,
      `Colours ${palette(brand)}; ${fontFeel(brand)}. Big headline, lots of space. Keep the top-left corner (18% of width) completely empty.`,
      `No other text at all: no quotes, names, numbers, badges, stars. No people or faces. No other companies’ logos or signage. No frame or border around the ad; fill edge to edge. No charts, graphs or data visuals. No fake app UI: no buttons, pills, notification cards, play buttons, checkboxes, polls or chat bubbles.`,
      i.strictNote ?? "",
    ].filter(Boolean).join("\n");
  }
  return [
    `Design a premium paid-social ad (${i.ratio ?? "4:5"}) for ${brand.brandName}, as a top agency art director would.`,
    `Concept (one clear idea): ${spec.visual.concept}. Angle: ${spec.angle}. Composition: ${sceneFor(spec.index, i.hasScreens, i.sceneShift)}.`,
    `The viewer should feel understood: the headline voices their own moment or private thought.`,
    `Reference images: ${refs(i.refLabels)}. Use them as the hero, reproduced faithfully. Ignore any words inside them.`,
    `Never draw the brand name, logo or wordmark; keep the top-left 18% of width plain, the logo is added later.`,
    `Show only products and devices that appear in the references; no invented products, remotes, gadgets or hardware. Generic props are fine.`,
    `Render exactly this text and nothing else, spelled exactly:`,
    text,
    `Typography: ${fontFeel(brand)}; headline large, high contrast, readable at phone size, max 3 lines. CTA as plain text with an arrow or underline, never a button shape.`,
    `Colour: use exact brand colours ${palette(brand)}; one dominant colour, one accent.`,
    `Layout: generous whitespace, one focal point, no clutter.`,
    `Forbidden: extra words, quotes, testimonials, names, fake UI text, buttons, pills, notification cards, chat bubbles, play buttons, numbers, stats, badges, stars, guarantees, watermarks, people or faces, other companies’ logos or signage, frames or borders around the ad.`,
    i.strictNote ?? "",
  ].filter(Boolean).join("\n");
}
