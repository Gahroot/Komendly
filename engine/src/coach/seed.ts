// "Make 5 more like the winner": the planning seed of a run. From the plan job payload (`seed`) or,
// for runs that went through extraction first, from the AdCoachReview that started the run.
import { CoachVerdictSchema, RunSeedSchema, type RunSeed } from "../../../src/lib/ads/coach/contracts";
import type { Db } from "../db";

export async function loadRunSeed(db: Db, runId: string, payload: Record<string, unknown>): Promise<RunSeed | null> {
  const direct = RunSeedSchema.safeParse(payload.seed);
  if (direct.success) return direct.data;
  const review = await db.adCoachReview.findUnique({ where: { moreRunId: runId }, select: { id: true, verdict: true } });
  if (!review) return null;
  const v = CoachVerdictSchema.safeParse(review.verdict);
  const w = v.success ? v.data.winner : null;
  if (!w) return null;
  let visual: RunSeed["visual"];
  if (w.matchedAdId) {
    const ad = await db.ad.findUnique({ where: { id: w.matchedAdId }, select: { visualBrief: true } });
    const vb = (ad?.visualBrief ?? null) as { concept?: unknown; layout?: unknown } | null;
    visual = {
      ...(typeof vb?.concept === "string" ? { concept: vb.concept.slice(0, 1000) } : {}),
      ...(typeof vb?.layout === "string" ? { layout: vb.layout.slice(0, 120) } : {}),
    };
  }
  return { angle: w.angle, hook: w.hook, headline: w.headline, style: w.style, ...(visual ? { visual } : {}), ...(w.matchedAdId ? { sourceAdId: w.matchedAdId } : {}), coachReviewId: review.id };
}

/** Prompt block for the strategist: variations on a proven ad, not copies. */
export function seedPrompt(seed: RunSeed): string {
  if (seed.origin === "hook_library") {
    return `MEMBER-PICKED HOOK (the owner chose this hook from their Ozzy hook library; build this pack around it):
- hook: ${seed.hook ?? seed.angle}
- angle: ${seed.angle}
Use this hook (word for word or a very close, natural variation) as the opening of the first ads, and the same buyer moment for the rest with fresh wording and scenes. Claims still only from the facts.`;
  }
  return `PROVEN WINNER (this ad is winning in the owner's real Meta account; write variations of it):
- angle: ${seed.angle}
${seed.hook ? `- hook: ${seed.hook}\n` : ""}${seed.headline ? `- headline: ${seed.headline}\n` : ""}${seed.style ? `- look/style: ${seed.style}\n` : ""}${seed.visual?.concept ? `- its visual concept: ${seed.visual.concept}\n` : ""}${seed.visual?.layout ? `- its layout: ${seed.visual.layout} (reuse it for most slots)\n` : ""}Every ad keeps this same core angle and buyer worry, but each uses a different hook, headline wording and scene, so they test fresh versions of the winner. Never copy the headline word for word.`;
}
