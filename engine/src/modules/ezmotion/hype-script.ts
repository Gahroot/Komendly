// Hype script: the few words a fast-cut social video shows, one short card per cut.
// Pain cards speak in the buyer's own voice (from the site's pains); proof cards only shorten
// a given claim; numbers anywhere must already exist in the source text. Everything else falls back.
import { z } from "zod";
import type { AdSpec } from "../../../../src/lib/ads/contracts";
import type { AIProvider, UsageMeter } from "../../providers/types";
import { balanceLines } from "./composition";

export const CARD_ROLES = ["pain", "turn", "proof"] as const;
export const MAX_CARD_WORDS = 4;
export const MAX_END_WORDS = 7;

export const HypeScriptSchema = z.object({
  cards: z
    .array(
      z.object({
        role: z.enum(CARD_ROLES),
        text: z.string(),
        emphasis: z.string().nullable(),
        claimIndex: z.number().int().nullable(),
      }),
    )
    .min(1)
    .max(8),
  endLine: z.string(),
});
export type HypeScript = z.infer<typeof HypeScriptSchema>;
export type HypeCard = HypeScript["cards"][number];

export const HYPE_SCRIPT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["cards", "endLine"],
  properties: {
    cards: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "text", "emphasis", "claimIndex"],
        properties: {
          role: { type: "string", enum: [...CARD_ROLES] },
          text: { type: "string" },
          emphasis: { type: ["string", "null"] },
          claimIndex: { type: ["integer", "null"] },
        },
      },
    },
    endLine: { type: "string" },
  },
};

export interface HypeBrief {
  audience?: string;
  pains?: string[];
  offer?: string;
}

const words = (s: string) => s.replace(/[\u201c\u201d"]/g, "").split(/\s+/).filter(Boolean);
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
const numbersIn = (s: string) => s.match(/\d[\d.,:%]*/g)?.map((n) => n.replace(/[.,:]+$/, "")) ?? [];

/** Deterministic script: the hook cut into short cards, short claims as proof, headline as the end line. */
export function defaultHypeScript(spec: AdSpec): HypeScript {
  const src = words(spec.hook).length <= 12 ? spec.hook : spec.headline;
  const n = Math.min(3, Math.max(2, Math.ceil(words(src).length / MAX_CARD_WORDS)));
  const pains = balanceLines(src, n).filter((l) => words(l).length <= MAX_CARD_WORDS + 1);
  const cards: HypeCard[] = (pains.length >= 2 ? pains : [src.split(/\s+/).slice(0, MAX_CARD_WORDS).join(" ")]).map((text) => ({ role: "pain", text, emphasis: null, claimIndex: null }));
  spec.claims.forEach((c, i) => {
    if (cards.filter((k) => k.role === "proof").length < 2 && words(c.claim).length <= MAX_CARD_WORDS) cards.push({ role: "proof", text: c.claim, emphasis: null, claimIndex: i });
  });
  const head = words(spec.headline);
  return { cards, endLine: head.length <= MAX_END_WORDS ? spec.headline : head.slice(0, MAX_END_WORDS).join(" ") };
}

/** Keep only cards that obey the rules; refill from the default script when too few survive. */
export function sanitizeHypeScript(raw: unknown, spec: AdSpec, brief: HypeBrief = {}): { script: HypeScript; fixes: string[] } {
  const base = defaultHypeScript(spec);
  const parsed = HypeScriptSchema.safeParse(raw);
  if (!parsed.success) return { script: base, fixes: ["hype:invalid"] };
  const fixes: string[] = [];
  const source = [spec.hook, spec.headline, spec.body ?? "", spec.angle, ...(brief.pains ?? []), brief.audience ?? "", ...spec.claims.map((c) => c.claim)].join(" ");
  const sourceNums = new Set(numbersIn(source));
  const cards: HypeCard[] = [];
  for (const c of parsed.data.cards) {
    const text = c.text.trim().replace(/\s+/g, " ");
    const n = words(text).length;
    if (!n || n > MAX_CARD_WORDS) { fixes.push(`card too long: ${text.slice(0, 40)}`); continue; }
    if (c.role === "proof") {
      const claim = c.claimIndex !== null ? spec.claims[c.claimIndex]?.claim : undefined;
      if (!claim) { fixes.push(`proof without claim: ${text}`); continue; }
      const claimNums = new Set(numbersIn(claim));
      if (numbersIn(text).some((x) => !claimNums.has(x))) { fixes.push(`proof number not in claim: ${text}`); continue; }
    } else if (numbersIn(text).some((x) => !sourceNums.has(x))) { fixes.push(`invented number: ${text}`); continue; }
    const emphasis = c.emphasis && words(text).some((w) => norm(w) === norm(c.emphasis ?? "")) ? c.emphasis : null;
    cards.push({ role: c.role, text, emphasis, claimIndex: c.role === "proof" ? c.claimIndex : null });
  }
  // Order: pains first, then the turn, then proof (max 3 pains, 1 turn, 2 proofs).
  const pick = (role: HypeCard["role"], max: number) => cards.filter((c) => c.role === role).slice(0, max);
  let pains = pick("pain", 3);
  if (pains.length < 2) { fixes.push("pain cards: default"); pains = base.cards.filter((c) => c.role === "pain"); }
  const out = [...pains, ...pick("turn", 1), ...pick("proof", 2)];
  const end = parsed.data.endLine.trim();
  const endOk = words(end).length > 0 && words(end).length <= MAX_END_WORDS && numbersIn(end).every((x) => sourceNums.has(x));
  if (!endOk) fixes.push("endLine: default");
  return { script: { cards: out, endLine: endOk ? end : base.endLine }, fixes };
}

export function buildHypeBrief(spec: AdSpec, brandName: string, brief: HypeBrief): { system: string; prompt: string } {
  const system = [
    "You write the on-screen words for a 10-second, high-energy, fast-cut social video ad (TikTok/Reels hype edit). One short card per cut.",
    "Goal: in the first second the right buyer thinks 'that's me'. Call out ONE specific pain from their own life, in the words they'd use in their head. Acknowledge it before the product. Never explain features.",
    "Cards, in order:",
    "- 2-3 'pain' cards: together one punchy buyer moment or private thought, split across cuts. 1-4 words each. Concrete and plain (a time, a place, what they keep doing, what they're tired of). No product, no brand name, no jargon, no clever wordplay.",
    "- 1 'turn' card: 1-4 words that flip to relief (e.g. 'There's an easier way.'). No claim, no promise.",
    "- 0-2 'proof' cards: 1-4 words shortening ONE given claim (set claimIndex), as a complete plain phrase a stranger understands at a glance (e.g. 'No pressure to buy.'). Only facts in that claim; numbers copied exactly; no people's names, no colons. Skip proof if no claim is short and strong.",
    "endLine: at most 7 words, the one thing to remember, said plainly (the payoff of the pain). Do not repeat the brand name or the CTA (both are already on the end card). No new claims.",
    "Never invent numbers, results, guarantees, prices or testimonials. Numbers only if they appear in the input. emphasis: one word of the card to colour, or null.",
    "Reply with JSON only.",
  ].join("\n");
  const prompt = JSON.stringify(
    {
      brand: brandName,
      audience: brief.audience ?? null,
      sitePains: (brief.pains ?? []).slice(0, 6),
      offer: brief.offer ?? null,
      awareness: spec.awareness,
      angle: spec.angle,
      buyerMoment: spec.hook,
      headline: spec.headline,
      cta: spec.cta ?? null,
      claims: spec.claims.map((c, i) => ({ index: i, claim: c.claim })),
    },
    null,
    1,
  );
  return { system, prompt };
}

export async function writeHypeScript(provider: AIProvider, spec: AdSpec, brandName: string, brief: HypeBrief, signal?: AbortSignal): Promise<{ script: HypeScript; usage: UsageMeter[]; source: "llm" | "default"; fixes: string[] }> {
  const { system, prompt } = buildHypeBrief(spec, brandName, brief);
  try {
    const s = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
    const res = await provider.text({ system, prompt, jsonSchema: HYPE_SCRIPT_JSON_SCHEMA, reasoning: "low", signal: s });
    const { script, fixes } = sanitizeHypeScript(res.json ?? JSON.parse(res.text), spec, brief);
    return { script, usage: [res.usage], source: fixes.includes("hype:invalid") ? "default" : "llm", fixes };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { script: defaultHypeScript(spec), usage: [], source: "default", fixes: [`hype:error: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`] };
  }
}

/** Every word the video shows (for grounding QC). */
export function hypeOnScreenText(script: HypeScript, cta: string): string[] {
  return [...script.cards.map((c) => c.text), script.endLine, cta];
}
