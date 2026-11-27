// Rubric AI critique (Codex provider, strict JSON). Pure: schema, prompt builder, merge. The engine makes the call.
import { z } from "zod";
import type { AdCopy, Issue, PackContext } from "./creative";

const r = z.number().int().min(1).max(5);
export const CritiqueSchema = z.object({
  ads: z.array(z.object({
    adId: z.string().max(60),
    callout: r.describe("Does the first line name who it is for (call-out)?"),
    value: r.describe("Is the dream outcome clear and believable without promising results?"),
    cta: r.describe("Is the next step specific and low-effort?"),
    likelihood: r.describe("Hormozi: does it raise the reader's perceived likelihood of achievement?"),
    effort: r.describe("Hormozi: does it cut perceived time delay and effort?"),
    firstFiveSeconds: r.describe("Would the hook stop a scroll in the first 5 seconds?"),
    problem: z.string().max(220).describe("The single biggest weakness, or empty string"),
    fix: z.string().max(220).describe("One concrete copy/layout fix, or empty string"),
  })).max(12),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const CRITIQUE_SYSTEM = `You are a strict direct-response ad reviewer for small-business Meta ads. Rubric ($100M Leads): the ad must (1) call out the reader, (2) state a clear value, (3) give one specific call to action, and the hook must work in the first 5 seconds. Hormozi value equation: raise perceived likelihood of achievement, cut perceived time delay and effort. Score 1-5 (5 best); be harsh, most ads are 2-4. Never invent facts. Never suggest promising leads, sales, rankings or results. Describe only what is in the supplied copy (and the image if attached).`;

export function buildCritiquePrompt(ctx: PackContext, ads: AdCopy[]): string {
  return JSON.stringify({ business: ctx.brandName, trade: ctx.trade, city: ctx.city, offer: ctx.offer, ads: ads.map((a) => ({ adId: a.id, awareness: a.awareness, angle: a.angle, hook: a.hook, headline: a.headline, body: a.body, cta: a.cta })) });
}

/** Turn critique ratings into issues (<=2 on a dimension = a finding) and a 0-100 rubric score. */
export function critiqueToIssues(c: Critique["ads"][number]): { issues: Issue[]; rubric: number } {
  const dims: Array<[keyof typeof LABEL, number]> = [["callout", c.callout], ["value", c.value], ["cta", c.cta], ["likelihood", c.likelihood], ["effort", c.effort], ["firstFiveSeconds", c.firstFiveSeconds]];
  const issues: Issue[] = [];
  for (const [k, v] of dims) if (v <= 2) issues.push({ code: `ai_${k}`, severity: v === 1 ? "medium" : "low", detail: `${LABEL[k]} rated ${v}/5.${c.problem ? ` ${c.problem}` : ""}${c.fix ? ` Fix: ${c.fix}` : ""}`.slice(0, 400) });
  const rubric = Math.round((dims.reduce((s, [, v]) => s + v, 0) / (dims.length * 5)) * 100);
  return { issues, rubric };
}
const LABEL = { callout: "Call-out", value: "Value", cta: "Call to action", likelihood: "Likelihood of achievement", effort: "Time/effort", firstFiveSeconds: "First 5 seconds" } as const;

/** Blend: programmatic score keeps 70%, AI rubric 30%; AI issues are appended (never remove programmatic ones). */
export function blend(programmatic: number, rubric: number): number {
  return Math.round(programmatic * 0.7 + rubric * 0.3);
}
