// Optional premium background: one text-free gpt-image-2 scene plate built from the brand's real
// assets (logo excluded, faces never, product never: the real product is shown on top), checked by the composed renderer's vision QC.
import sharp from "sharp";
import type { AdSpec, Ratio } from "../../../../src/lib/ads/contracts";
import type { AIProvider, UsageMeter } from "../../providers/types";
import { buildReferences } from "../../render/composed/references";
import { GEN_SIZE, outPixels } from "../../render/composed/sizes";
import { verifyText } from "../../render/composed/verify-text";
import type { BrandKit } from "../../render/static/types";

export function platePrompt(spec: AdSpec, brand: BrandKit, ratio: Ratio): string {
  const colors = brand.colors.map((c) => `${c.hex} (${c.role})`).join(", ");
  return [
    `A premium, cinematic ${ratio} background plate for a ${brand.brandName} video ad.`,
    `Mood: ${spec.visual.concept || spec.angle}.`,
    "ENVIRONMENT ONLY: use the reference images for the setting, light and mood. Do NOT show the product, packaging, bottles, devices or screens; the real product is composited on top later.",
    `Colour grade toward the brand colours: ${colors}.`,
    "Composition: an empty, calm surface or space in the lower-middle third (where the real product will sit), uncluttered upper half for a headline, soft depth of field.",
    "ABSOLUTELY NO text, letters, numbers, logos, labels, signs, watermarks or UI. NO people, NO faces, NO hands.",
  ].join("\n");
}

/** PNG plate at the frame size, or null (no usable refs, provider error, or QC found text/faces twice). */
export async function makeScenePlate(provider: AIProvider, spec: AdSpec, brand: BrandKit, ratio: Ratio, signal?: AbortSignal): Promise<{ png: Buffer | null; usage: UsageMeter[]; reasons: string[] }> {
  const usage: UsageMeter[] = [];
  const refs = (await buildReferences(spec, brand)).filter((r) => !r.label.startsWith("brand logo"));
  if (!refs.length) return { png: null, usage, reasons: ["no usable assets"] };
  let reasons: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const img = await provider.image({ prompt: platePrompt(spec, brand, ratio), size: GEN_SIZE[ratio], quality: "medium", references: refs.map(({ mediaType, base64 }) => ({ mediaType, base64 })), signal });
      usage.push(img.usage);
      const { width, height } = outPixels(ratio);
      const png = await sharp(img.png).resize(width, height, { fit: "cover" }).png().toBuffer();
      const check = await verifyText(provider, png, { headline: "", brandName: brand.brandName }, signal);
      usage.push({ costMicros: check.costMicros, latencyMs: 0 });
      if (check.ok) return { png, usage, reasons: [] };
      reasons = check.reasons;
    } catch (e) {
      if (signal?.aborted) throw e;
      reasons = [e instanceof Error ? e.message.slice(0, 200) : String(e)];
    }
  }
  return { png: null, usage, reasons };
}
