// Codex-only AI text for testimonials: script (review words verbatim), per-clip delivery
// direction, actor recommendation. Any Codex failure -> free template. Never the paid API.
import { z } from "zod";
import { heuristicActorPicks, templateScript, type ActorCard, type ActorPick } from "../../../src/lib/testimonial/contracts";
import type { AIProvider, UsageMeter } from "../providers/types";
import { segmentText, words } from "./chunking";

export interface ScriptSegment {
  text: string;
  direction: string;
}
export interface ScriptResult {
  source: "codex" | "template" | "custom";
  fullScript: string;
  hook: string;
  testimonial: string;
  cta: string;
  segments: ScriptSegment[];
  usage?: UsageMeter;
}

/** ElevenLabs v3 audio tags the writer may use (sparingly). */
export const AUDIO_TAGS = ["laughs", "sighs", "pause", "chuckles", "exhales"] as const;

/** Remove [audio tags] for the display script / non-v3 models. */
export function stripAudioTags(s: string): string {
  return s.replace(/\[[a-z][a-z ]{0,20}\]/gi, " ").replace(/\s+([,.!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

const DEFAULT_DIRECTION = "Warm, relaxed, conversational; like telling a friend.";

const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, " ").split(/\s+/).filter(Boolean);

/** True when every review word appears in the script in order (fillers may be inserted between). */
export function keepsReviewVerbatim(script: string, review: string): boolean {
  const s = tokens(script);
  const r = tokens(review);
  let j = 0;
  for (const t of s) if (j < r.length && t === r[j]) j++;
  return j === r.length;
}

/**
 * Word n-grams (n >= minN) that `text` shares with `review`, e.g. a hook that echoes "our ac died".
 * Deterministic: lowercased tokens, maximal shared runs only, in order of appearance in `text`.
 */
export function sharedNgrams(text: string, review: string, minN = 3): string[] {
  const t = tokens(stripAudioTags(text));
  const r = tokens(review);
  const grams = new Set<string>();
  for (let i = 0; i + minN <= r.length; i++) grams.add(r.slice(i, i + minN).join(" "));
  const out: string[] = [];
  let i = 0;
  while (i + minN <= t.length) {
    if (!grams.has(t.slice(i, i + minN).join(" "))) {
      i++;
      continue;
    }
    let j = i + minN;
    while (j < t.length && grams.has(t.slice(j - minN + 1, j + 1).join(" "))) j++;
    out.push(t.slice(i, j).join(" "));
    i = j;
  }
  return out;
}

/** Problems with a Codex script, empty when acceptable. */
export function scriptProblems(s: { hook: string; cta: string; fullScript: string }, review: string): string[] {
  const p: string[] = [];
  if (!keepsReviewVerbatim(s.fullScript, review)) p.push("The review words must all appear verbatim and in order.");
  for (const [part, text] of [["hook", s.hook], ["CTA", s.cta]] as const) {
    const rep = sharedNgrams(text, review);
    if (rep.length) p.push(`The ${part} repeats phrases from the review (${rep.map((x) => `"${x}"`).join(", ")}); use fresh words.`);
  }
  return p;
}

/** Split any too-long segment, carrying its direction. */
export function fitSegments(segs: readonly ScriptSegment[], maxWords: number): ScriptSegment[] {
  return segs.flatMap((s) => (words(s.text) <= maxWords ? [s] : segmentText(s.text, maxWords).map((text) => ({ text, direction: s.direction }))));
}

const CodexScript = z.object({
  hook: z.string().min(1),
  testimonial: z.string().min(1),
  cta: z.string().min(1),
  segments: z.array(z.object({ text: z.string().min(1), direction: z.string().min(1) })).min(1),
});

const SCRIPT_SCHEMA = {
  type: "object",
  required: ["hook", "testimonial", "cta", "segments"],
  properties: {
    hook: { type: "string" },
    testimonial: { type: "string" },
    cta: { type: "string" },
    segments: {
      type: "array",
      items: { type: "object", required: ["text", "direction"], properties: { text: { type: "string" }, direction: { type: "string" } } },
    },
  },
} as const;

const SYSTEM = `You write scripts for short vertical UGC testimonial videos spoken by one person to a phone camera.
Rules:
- Structure: a short scroll-stopping hook (1 sentence), then the customer's review, then a soft, low-pressure CTA.
- It must sound like a real person filming themselves on an iPhone: casual spoken wording, contractions, short sentences.
- The hook and the CTA must use fresh wording: never reuse any 3+ word phrase from the review (the review is spoken right
  after the hook; an echoed phrase sounds scripted).
- The customer's review words must be kept VERBATIM and in order. Between them you MUST insert 1-2 light natural
  disfluencies: a filler ("honestly", "like", "you know", or one "um") and/or a quick self-correction
  ("it was, well, it still is"). Short connective phrases are fine; never drop, reorder or change a review word.
- You may use at most ONE ElevenLabs v3 audio tag in the whole script, only where it truly fits: [laughs], [sighs] or [pause].
  No other bracketed text. No marketing jargon, no emojis, no hashtags, no stage directions.
- segments: the whole script (hook+testimonial+cta, in order) split into consecutive spoken segments of at most MAX_WORDS words,
  each with a one-line delivery direction about tone, pace, energy and emphasis ONLY (never appearance, clothing, setting or camera).`;

/** Free fallback in the same spoken format (light disfluency + one [pause] tag); review verbatim. */
export function templateResult(review: string, businessName: string | null | undefined, maxWords: number): ScriptResult {
  const display = templateScript(review, businessName);
  const hook = "Okay so, honestly... you won't believe what happened when I tried this.";
  const cta = businessName ? `So yeah, check out ${businessName}. You'll thank me.` : "So yeah, try it for yourself.";
  const body = display.slice("You won't believe what happened when I tried this...".length).trim();
  const ctaOld = businessName ? `Check out ${businessName} today!` : "Try it for yourself!";
  const testimonial = body.endsWith(ctaOld) ? body.slice(0, body.length - ctaOld.length).trim() : body;
  const spoken = [hook, "[pause]", testimonial, "[pause]", cta];
  return {
    source: "template",
    fullScript: stripAudioTags(spoken.join(" ")),
    hook,
    testimonial,
    cta,
    segments: [
      { text: hook, direction: "Curious, a little conspiratorial, like starting a story to a friend." },
      ...segmentText(`[pause] ${testimonial}`, maxWords).map((text) => ({ text, direction: DEFAULT_DIRECTION })),
      { text: `[pause] ${cta}`, direction: "Soft, genuine recommendation; no hard sell." },
    ],
  };
}

export async function writeScript(
  provider: AIProvider | null,
  r: { reviewText: string; reviewerName?: string | null; businessName?: string | null; targetSeconds: number; maxWords: number; customScript?: string; useAI: boolean },
  signal?: AbortSignal,
): Promise<ScriptResult> {
  if (r.customScript) {
    return {
      source: "custom",
      fullScript: r.customScript,
      hook: "",
      testimonial: r.customScript,
      cta: "",
      segments: segmentText(r.customScript, r.maxWords).map((text) => ({ text, direction: DEFAULT_DIRECTION })),
    };
  }
  const fallback = () => templateResult(r.reviewText, r.businessName, r.maxWords);
  if (!r.useAI || provider?.name !== "codex") return fallback();
  const ask = (feedback: string) =>
    provider.text({
      system: SYSTEM.replace("MAX_WORDS", String(r.maxWords)),
      prompt: `Target length: about ${r.targetSeconds} seconds spoken (~${Math.round(r.targetSeconds * 2.5)} words).
Business: ${r.businessName ?? "(unknown)"}
Reviewer first name: ${r.reviewerName ?? "(unknown)"}
Customer review (keep verbatim):
"""${r.reviewText}"""${feedback}`,
      jsonSchema: SCRIPT_SCHEMA as unknown as Record<string, unknown>,
      reasoning: "low",
      signal,
    });
  const usages: UsageMeter[] = [];
  try {
    let feedback = "";
    // One re-ask with the concrete problems, then the free template.
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const res = await ask(feedback);
      usages.push(res.usage);
      const p = CodexScript.safeParse(res.json);
      if (!p.success) continue;
      const fullScript = stripAudioTags(p.data.segments.map((s) => s.text.trim()).join(" "));
      const problems = scriptProblems({ hook: p.data.hook, cta: p.data.cta, fullScript }, r.reviewText);
      if (problems.length) {
        feedback = `\n\nYour previous attempt was rejected:\n- ${problems.join("\n- ")}\nFix these and reply again.`;
        continue;
      }
      return {
        source: "codex",
        fullScript,
        hook: stripAudioTags(p.data.hook),
        testimonial: stripAudioTags(p.data.testimonial),
        cta: stripAudioTags(p.data.cta),
        segments: fitSegments(p.data.segments, r.maxWords),
        usage: sumUsage(usages),
      };
    }
  } catch {
    // fall through to the template
  }
  return usages.length ? { ...fallback(), usage: sumUsage(usages) } : fallback();
}

function sumUsage(u: readonly UsageMeter[]): UsageMeter {
  return u.reduce((a, b) => ({ ...a, ...b, costMicros: a.costMicros + b.costMicros, latencyMs: a.latencyMs + b.latencyMs }), { costMicros: 0, latencyMs: 0 });
}

export { heuristicActorPicks, type ActorCard, type ActorPick } from "../../../src/lib/testimonial/contracts";

const Picks = z.object({ picks: z.array(z.object({ actorId: z.string(), reason: z.string() })) });

export async function recommendActors(
  provider: AIProvider | null,
  review: { reviewText: string; businessName?: string | null },
  actors: readonly ActorCard[],
  limit: number,
  signal?: AbortSignal,
): Promise<{ source: "codex" | "heuristic"; picks: ActorPick[]; usage?: UsageMeter }> {
  const fallback = () => ({ source: "heuristic" as const, picks: heuristicActorPicks(review.reviewText, review.businessName, actors, limit) });
  if (provider?.name !== "codex" || actors.length === 0) return fallback();
  try {
    const res = await provider.text({
      system: "You cast the most believable on-camera customer for a UGC testimonial. Pick actors whose persona, age, setting and industries fit the business and the reviewer's voice. Reply JSON only.",
      prompt: `Business: ${review.businessName ?? "(unknown)"}\nReview: """${review.reviewText}"""\nPick the best ${limit} actor ids, best first.\nActors:\n${JSON.stringify(actors)}`,
      jsonSchema: {
        type: "object",
        required: ["picks"],
        properties: { picks: { type: "array", items: { type: "object", required: ["actorId", "reason"], properties: { actorId: { type: "string" }, reason: { type: "string" } } } } },
      },
      reasoning: "low",
      signal,
    });
    const p = Picks.safeParse(res.json);
    const ids = new Set(actors.map((a) => a.id));
    const seen = new Set<string>();
    const picks = (p.success ? p.data.picks : []).filter((x) => ids.has(x.actorId) && !seen.has(x.actorId) && seen.add(x.actorId)).slice(0, limit);
    return picks.length ? { source: "codex", picks, usage: res.usage } : fallback();
  } catch {
    return fallback();
  }
}
