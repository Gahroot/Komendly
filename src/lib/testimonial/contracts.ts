// Shared contract between the web app and the engine for testimonial video jobs.
// Pure TypeScript + zod only: no Next, Prisma or Node-specific imports.
import { z } from "zod";

/** AdJob.type the engine claims for testimonial generation (AdJob is the shared queue table). */
export const TESTIMONIAL_JOB_TYPE = "testimonial_generate";
/** AdJob.type for Codex actor recommendation; result lands in AdJob.result. */
export const TESTIMONIAL_RECOMMEND_JOB_TYPE = "testimonial_recommend_actors";

export const TestimonialJobPayloadSchema = z.object({
  compositeVideoId: z.string().min(1),
  useAIScript: z.boolean().default(true),
  customScript: z.string().max(4000).optional(),
});
export type TestimonialJobPayload = z.infer<typeof TestimonialJobPayloadSchema>;

export const RecommendActorsPayloadSchema = z.object({
  reviewId: z.string().min(1),
  userId: z.string().min(1),
  limit: z.number().int().min(1).max(10).default(3),
});

export const MINUTES_STATES = ["none", "reserved", "charged", "released"] as const;
export type MinutesState = (typeof MINUTES_STATES)[number];

/** Whole minutes billed for a video of `seconds` (at least 1). */
export function minutesForDuration(seconds: number): number {
  return Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
}

export interface EntitlementUser {
  subscriptionStatus: string;
  minutesUsed: number;
  minutesLimit: number;
  bonusMinutes: number;
}

export type Entitlement =
  | { allowed: true; remainingMinutes: number; via: "subscription" | "credits" }
  | { allowed: false; remainingMinutes: number; code: "no_entitlement" | "insufficient_minutes"; reason: string };

const ACTIVE = new Set(["active", "trialing"]);

/**
 * Active subscription: remaining = minutesLimit - minutesUsed (limit includes credit packs).
 * No subscription: only purchased credit-pack minutes count, capped by bonusMinutes.
 */
export function evaluateEntitlement(u: EntitlementUser, neededMinutes: number): Entitlement {
  const left = Math.max(0, u.minutesLimit - u.minutesUsed);
  const active = ACTIVE.has(u.subscriptionStatus);
  const remaining = active ? left : Math.min(left, Math.max(0, u.bonusMinutes));
  if (!active && remaining <= 0) {
    return { allowed: false, remainingMinutes: 0, code: "no_entitlement", reason: "Active subscription or credit pack required to generate videos." };
  }
  if (remaining < neededMinutes) {
    return {
      allowed: false,
      remainingMinutes: remaining,
      code: "insufficient_minutes",
      reason: `Insufficient minutes. You have ${remaining} minute(s) remaining but need ${neededMinutes}.`,
    };
  }
  return { allowed: true, remainingMinutes: remaining, via: active ? "subscription" : "credits" };
}

/** Free template script (same output as generateSimpleScript in src/lib/openai-script.ts). */
export function templateScript(testimonial: string, businessName?: string | null): string {
  const hook = "You won't believe what happened when I tried this...";
  const cta = businessName ? `Check out ${businessName} today!` : "Try it for yourself!";
  const script = `${hook} ${testimonial} ${cta}`;
  if (script.length > 800) {
    const max = 800 - hook.length - cta.length - 10;
    return `${hook} ${testimonial.substring(0, max)}... ${cta}`;
  }
  return script;
}

export interface ActorCard {
  id: string;
  name: string;
  gender: string;
  style: string;
  ageRange?: string | null;
  persona?: string | null;
  occupation?: string | null;
  setting?: string | null;
  tags: string[];
  industries: string[];
}
export interface ActorPick {
  actorId: string;
  reason: string;
}

const tokenize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Cheap deterministic ranking: industry/tag/setting word overlap with the review, then catalogue order. */
export function heuristicActorPicks(reviewText: string, businessName: string | null | undefined, actors: readonly ActorCard[], limit: number): ActorPick[] {
  const bag = new Set(tokenize(`${reviewText} ${businessName ?? ""}`));
  const scored = actors.map((a, i) => {
    const terms = [...a.industries, ...a.tags, a.setting ?? "", a.occupation ?? "", a.persona ?? ""].flatMap(tokenize);
    return { a, i, score: terms.filter((t) => bag.has(t)).length };
  });
  scored.sort((x, y) => y.score - x.score || x.i - y.i);
  return scored.slice(0, limit).map(({ a, score }) => ({ actorId: a.id, reason: score ? "matches the review's industry/keywords" : "default pick" }));
}

const ACCENT_QUALIFIERS = /^(?:a|an|the|light|natural|noticeable|strong|soft|relaxed|smooth|warm|clear|young|casual|hearty|subtle|slight|thick|mild|deep|gentle)\b[\s,]*/i;

/**
 * Display accent from an actor's voicePrompt ("... with a light, natural Indian accent; warm" ->
 * "Indian"; "..., general American accent; ..." -> "General American"). Null when none is named.
 */
export function accentFromVoicePrompt(voicePrompt: string | null | undefined): string | null {
  if (!voicePrompt) return null;
  const m = /(?:\bwith\s+|,\s*)([^;,]*(?:,\s*[^;,]*)?)\baccent\b/i.exec(voicePrompt.split(";")[0] ?? "");
  let a = (m?.[1] ?? "").replace(/^.*\bwith\s+/i, "").trim();
  for (let prev = ""; prev !== a; ) {
    prev = a;
    a = a.replace(ACCENT_QUALIFIERS, "").trim();
  }
  a = a.replace(/\s+in English$/i, "").trim();
  return a ? a.charAt(0).toUpperCase() + a.slice(1) : null;
}
