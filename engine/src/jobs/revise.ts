// Fix an ad between QC attempts: rewrite copy for copy failures, swap the image for
// image-related failures. Keeps the same angle, awareness and grounded claims.
import { z } from "zod";
import { AdSpecSchema, type AdSpec } from "../../../src/lib/ads/contracts";
import { PLAN_SYSTEM } from "../prompts/plan";
import { structured } from "../providers/structured";
import type { JobContext } from "./context";
import { mapClaimsToFacts, type Fact } from "./grounding";
import type { Check } from "./qc";

export const COPY_CHECKS = ["vision_plain_words", "vision_buyer_moment", "grounded", "claim_mapped", "vision_no_cut_text", "vision_headline_readable"];
const IMAGE_WORDS = /screenshot|image|photo|asset|picture|left-side|right-side|embedded|ui\b/i;

export function classifyFailures(failed: Check[]): { copy: Check[]; image: Check[] } {
  const image = failed.filter((c) => (c.name === "vision_one_idea" || c.name === "vision_no_cut_text") && IMAGE_WORDS.test(c.detail ?? ""));
  const copy = failed.filter((c) => COPY_CHECKS.includes(c.name) && !image.includes(c));
  return { copy, image };
}

const Copy = z.object({ hook: z.string(), headline: z.string(), body: z.string().optional(), cta: z.string().optional(), claims: z.array(z.object({ claim: z.string(), sourceUrl: z.string() })) });

export async function reviseCopy(ctx: JobContext, spec: AdSpec, failed: Check[], facts: Fact[]): Promise<AdSpec> {
  const shorten = failed.some((c) => c.name === "vision_no_cut_text" || c.name === "vision_headline_readable");
  const r = await structured(
    ctx.provider,
    Copy,
    {
      system: PLAN_SYSTEM,
      prompt: `Rewrite this ad's copy to fix the review failures below. Same angle ("${spec.angle}"), same awareness (${spec.awareness}), same buyer moment.
${shorten ? "The text was cut off or too small: make headline and body at least 35% shorter.\n" : ""}Use plain everyday words, open with the buyer's moment, and only use claims copied from these FACTS:
${facts.map((f, i) => `F${i + 1}. ${f.claim} | ${f.sourceUrl}`).join("\n") || "(none: no product claims)"}

Review failures (fix every one):
${failed.map((c) => `- ${c.name}: ${c.detail ?? "failed"}`).join("\n")}

Current copy:
hook: ${spec.hook}
headline: ${spec.headline}
body: ${spec.body ?? ""}
cta: ${spec.cta ?? ""}
claims: ${JSON.stringify(spec.claims)}`,
      reasoning: "low",
      signal: ctx.signal,
    },
    ctx.usage,
  );
  const mapped = mapClaimsToFacts(r.claims, facts).filter((m) => m.factIndex !== null);
  // Keep a testimonial quote (claims[0]) untouched when the layout depends on it.
  const claims = spec.visual.layout === "testimonial" && spec.claims[0] ? [spec.claims[0], ...mapped.map((m) => ({ claim: m.claim, sourceUrl: m.sourceUrl }))] : mapped.map((m) => ({ claim: m.claim, sourceUrl: m.sourceUrl }));
  return AdSpecSchema.parse({
    ...spec,
    hook: r.hook,
    headline: r.headline.slice(0, 90),
    body: r.body ? r.body.slice(0, 220) : undefined,
    cta: r.cta ? r.cta.slice(0, 30) : spec.cta,
    claims,
  });
}

/** Swap to a different usable real image, or drop images (text layout) if none is left. */
export function swapImage(spec: AdSpec, assets: Array<{ key: string; hasFace: boolean; kind: string; width: number; height: number }>, tried: string[]): AdSpec {
  const pool = assets.filter((a) => a.kind !== "icon" && a.width >= 300 && !tried.includes(a.key) && !spec.visual.assetKeys.includes(a.key));
  const pick = pool.find((a) => !a.hasFace) ?? pool[0];
  if (pick) return { ...spec, visual: { ...spec.visual, assetKeys: [pick.key] } };
  return { ...spec, visual: { ...spec.visual, assetKeys: [], layout: "quote_thought" } };
}
