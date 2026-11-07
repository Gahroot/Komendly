// Strict vision QC of a composed ad: all visible text must be in the brief; no quotes, numbers, badges, faces.
import { z } from "zod";
import type { AIProvider } from "../../providers/types";

const Read = z.object({
  headline: z.string(),
  cta: z.string(),
  allText: z.array(z.string()).describe("every separate piece of designed ad text (headline, subline, button, captions, quotes), verbatim"),
  incidentalText: z.array(z.string()).describe("text that is part of a pictured object: words inside a device/app screenshot, or printed on a product label/packaging"),
  hasQuoteOrAttribution: z.boolean(),
  hasBadgeOrStars: z.boolean(),
  hasHumanFace: z.boolean(),
  hasThirdPartyBrand: z.boolean().describe("a recognisable logo or storefront sign of another company is prominent"),
  hasFrame: z.boolean().describe("a drawn border or frame runs around the whole ad"),
  topLeftEmpty: z.boolean().describe("true if the top-left 18% x 12% area has no text and no product"),
  textBoxes: z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })).describe("bounding box of every designed text block (headline lines, subline, button), as fractions 0-1 of image width/height from the top-left"),
  screenUi: z.enum(["none", "matches_reference", "other"]).describe("any phone/laptop/monitor screen with UI: none, matches the reference screenshot (image 2 if given), or other/invented UI"),
  productNotInReferences: z.boolean().describe("a product, device, gadget or piece of hardware is featured that does not appear in any reference image (generic props like furniture, plants, a ladder do not count)"),
  hasInventedData: z.boolean().describe("a chart, graph, dashboard figure or data visual that is not a real screenshot"),
});
export type ReadBack = z.infer<typeof Read>;
export interface Allowed { headline: string; cta?: string; body?: string; brandName: string; screenshotRef?: { mediaType: string; base64: string }; productRefs?: Array<{ mediaType: string; base64: string }> }
export interface TextCheck { ok: boolean; reasons: string[]; read: ReadBack | null; costMicros: number }

export function normText(s: string): string {
  return s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”"]/g, "").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Pure judgement of a read-back against the brief. */
export function judge(read: ReadBack, a: Allowed): string[] {
  const reasons: string[] = [];
  if (normText(read.headline) !== normText(a.headline)) reasons.push(`headline reads "${read.headline}"`);
  if (a.cta && normText(read.cta) !== normText(a.cta)) reasons.push(`cta reads "${read.cta}"`);
  // The brand name is never drawn by the model (the real logo is overlaid later), unless it is part of the copy.
  const brand = normText(a.brandName);
  const copy = normText([a.headline, a.cta ?? "", a.body ?? ""].join(" "));
  for (const t of read.allText) if (brand && normText(t) === brand && !copy.includes(brand)) reasons.push(`drawn brand name "${t}"`);
  const allowed = copy;
  const allowedWords = new Set(allowed.split(" "));
  for (const t of read.allText) {
    const n = normText(t);
    if (!n) continue;
    if (allowed.includes(n)) continue;
    const words = n.split(" ");
    if (words.every((w) => allowedWords.has(w))) continue;
    reasons.push(`extra text "${t}"`);
  }
  void read.incidentalText;
  const briefNums = new Set(allowed.match(/\d+/g) ?? []);
  for (const t of read.allText) for (const d of t.match(/\d+/g) ?? []) if (!briefNums.has(d)) reasons.push(`number "${d}" not in brief`);
  // The headline is often a first-person thought set in quotes; only an extra quote or a credit counts.
  const extra = reasons.some((r) => r.startsWith("extra text"));
  if (read.hasQuoteOrAttribution && extra) reasons.push("quote/attribution");
  if (read.hasBadgeOrStars) reasons.push("badge or stars");
  if (read.hasHumanFace) reasons.push("human face");
  if (read.hasThirdPartyBrand) reasons.push("third-party brand prominent");
  if (read.hasFrame) reasons.push("frame around ad");
  if (read.hasInventedData) reasons.push("invented chart or data visual");
  if (read.productNotInReferences) reasons.push("product_not_in_references");
  if (read.screenUi === "other" || (read.screenUi === "matches_reference" && !a.screenshotRef)) reasons.push("invented screen UI");
  return [...new Set(reasons)];
}

export async function verifyText(provider: AIProvider, png: Buffer, a: Allowed, signal?: AbortSignal): Promise<TextCheck> {
  const res = await provider.text({
    system: "You audit ad images. Transcribe text exactly as rendered (do not fix spelling) and report quotes, testimonials, attributions, badges, star ratings and human faces truthfully.",
    prompt: "Image 1 is the ad" + ((a.productRefs?.length ?? 0) > 0 ? "; the following images are the real brand references (products, photos, screenshots) the ad may show" : a.screenshotRef ? "; image 2 is the real product screenshot it may show on a screen" : "") + ". Read the ad. Put the designed ad text in allText (a logo wordmark counts). Put words that belong to a pictured screenshot or a product label in incidentalText instead. hasQuoteOrAttribution = a testimonial quote or a person's name/credit OTHER than the main headline.",
    jsonSchema: z.toJSONSchema(Read) as Record<string, unknown>,
    images: [{ mediaType: "image/png", base64: png.toString("base64") }, ...(a.productRefs ?? (a.screenshotRef ? [a.screenshotRef] : []))],
    signal,
  });
  const p = Read.safeParse(res.json);
  if (!p.success) return { ok: false, reasons: ["unreadable QC response"], read: null, costMicros: res.usage.costMicros };
  const reasons = judge(p.data, a);
  return { ok: reasons.length === 0, reasons, read: p.data, costMicros: res.usage.costMicros };
}
