// Auto quality review of the hook ad: a Codex vision judge on the image. Only judged-good ads get sent.
import { z } from "zod";
import { ask, type AIProvider } from "./ai";

export const VerdictSchema = z.object({
  score: z.number().min(0).max(10),
  brandCorrect: z.boolean(),
  textLegible: z.boolean(),
  typos: z.boolean(),
  brokenLayout: z.boolean(),
  inventedClaims: z.boolean(),
  wrongIndustry: z.boolean(),
  notes: z.string().max(400),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/** Pass only when the score clears the bar AND no hard defect was found. */
export function qualityGate(v: Verdict, minScore: number): { pass: boolean; score: number; notes: string } {
  const defects = [
    !v.brandCorrect && "wrong business/brand",
    !v.textLegible && "illegible text",
    v.typos && "typos",
    v.brokenLayout && "broken layout",
    v.inventedClaims && "invented claims",
    v.wrongIndustry && "wrong industry",
  ].filter((d): d is string => Boolean(d));
  const score = Math.round(Math.min(10, Math.max(0, v.score)));
  const pass = score >= minScore && defects.length === 0;
  return { pass, score, notes: [defects.length ? `defects: ${defects.join(", ")}` : "", v.notes].filter(Boolean).join(". ").slice(0, 500) };
}

/** Next step for a weak ad: regenerate once, then drop. */
export function afterReject(giftAttempts: number): "regenerate" | "drop" {
  return giftAttempts < 2 ? "regenerate" : "drop";
}

const SYSTEM = [
  "You are a strict reviewer of a Facebook/Instagram ad made for a local business owner who never asked for it.",
  "Score 0-10: would this owner be impressed and could they run it as-is?",
  "Check: the business name/brand is correct; text is legible with no typos; no broken layout; no invented claims (prices, awards, guarantees, reviews not on their site); the industry is right.",
].join(" ");

export async function judgeAd(provider: AIProvider, img: { mediaType: string; base64: string }, lead: { businessName: string; niche: string; city: string; website: string }, signal?: AbortSignal): Promise<{ verdict: Verdict; costMicros: number }> {
  const { out, costMicros } = await ask(provider, VerdictSchema, {
    system: SYSTEM,
    prompt: `Business: ${lead.businessName}\nTrade: ${lead.niche}\nCity: ${lead.city}\nWebsite: ${lead.website}\nReview the attached ad image.`,
    images: [img],
    reasoning: "medium",
    signal,
  });
  return { verdict: out, costMicros };
}
