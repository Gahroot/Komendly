// Review gate: every autonomous growth system sends its outgoing item (email, public page, store listing, report,
// cold-email arm copy, extension text...) through an AI reviewer before it goes live. The reviewer approves it or
// sends it back with reasons; the caller may revise ONCE and resubmit, otherwise the item is dropped (never sent).
// Pure TS (no Next/Prisma/Node imports): imported by web, engine and kly. Runner: engine/src/growth/review-gate.ts.
// Decisions are logged as AdsEvent `review_gate` {system, kind, itemKey, approved, reasons, attempt}.
// Benchmark (21 Nov 2026, goal folder bench/: 46 labelled items x2, incl. 16 held out): rules-only precheck caught 0-11% of
// bad items; precheck + AI reviewer caught 97-100% and blocked 0-8% of good ones (~7-12s each). So: gate AI-written or
// data-filled items before they go out; review fixed templates once per version, not per send.

/** Komendly hard rules (autopilot plan s5) + the true public offer. The reviewer rejects any breach. */
export const HARD_RULES: readonly string[] = [
  "Every message or page is openly from Komendly (sender/brand visible); no pretending to be a customer, a neutral third party or Meta.",
  "No fake reviews, testimonials, numbers or results. Every figure must come from the supplied facts/data; nothing invented.",
  "No promise of leads, sales, revenue, ROAS or rankings. 'We make and refresh your ads' is fine; outcomes are not promised.",
  "No phone calls or text messages are offered or requested.",
  "Emails to people who did not opt in must carry a working opt-out and Komendly's postal identity; opted-out people are never contacted.",
  "No shaming a named business publicly: scores/teardowns about a specific business are private (noindex, token link) only.",
  "Community/forum content answers the question first; any Komendly mention is disclosed.",
  "Offer facts must match exactly: Ozzy Ad Department is $97 the first month then $197/month, cancel anytime (do it yourself: fresh ads weekly + a coach, the customer posts them); Growth Autopilot is $297/month founding price, locked while subscribed (regular $497), 10 founding spots, and runs the customer's Meta lead ads; free pack = 10 ads (20 for referred friends).",
  "No claim of Meta partnership, endorsement or affiliation unless the supplied facts say so.",
  "No misleading urgency, fake scarcity or hidden costs.",
];

export interface ReviewItem {
  /** GrowthSystem key or channel name, e.g. "ad_check", "ad_watch", "zapier_listing". */
  system: string;
  /** What it is: "email" | "page" | "listing" | "report" | "copy" | "extension" | ... */
  kind: string;
  /** Stable id for dedupe/logging (e.g. `watch:<userId>:<week>`). */
  itemKey: string;
  /** The exact content that will go out (text/markdown/HTML-stripped). */
  content: string;
  /** Ground truth the content may use (data rows, offer facts). Anything not here counts as invented. */
  facts?: string;
  /** Extra rules for this system (e.g. "must link with utm_source=ad_watch"). */
  extraRules?: readonly string[];
}

export interface ReviewVerdict {
  approved: boolean;
  /** Concrete problems; empty when approved. */
  reasons: string[];
  /** Optional suggested fix the caller may apply before its single resubmission. */
  fix?: string;
}

export const REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "reasons", "fix"],
  properties: {
    approved: { type: "boolean" },
    reasons: { type: "array", items: { type: "string" } },
    fix: { type: "string" },
  },
} as const;

/** True product facts the reviewer may treat as known (features, not results). Keep in sync with src/lib/ads/public-offer.ts. */
export const PRODUCT_FACTS: readonly string[] = [
  "Komendly makes Facebook/Instagram (Meta) ads from a business's website; free remakes of a single ad via /remix are free.",
  "Ozzy Ad Department: $97 the first month, then $197/month, cancel anytime. Free pack: 10 ads. Referred friends get 20.",
  "Ozzy Ad Department: fresh ads every week ('weekly drop') and Ozzy Ad Coach; the customer posts them. Growth Autopilot (Ozzy's AI Marketing Team, $297/month founding price, 10 founding spots): the team runs the customer's Facebook and Instagram lead ads in their own Meta account; Meta connection set up with the customer on joining.",
  "Integrations Komendly ships: ChatGPT/Claude app, Zapier (actions: generate ads from a website, find ad run; triggers: ads ready, new ad run), Jobber (reviews/jobs feed ad ideas), Chrome extension for the Meta Ad Library.",
  "Free tools: Meta Ad Check (scores live Ad Library ads; rubric: an ad running over 45 days is flagged as possibly tired), Competitor ad watch weekly email (opt-in), data report from the public Meta Ad Library (collected Nov 2026).",
  "Komendly's postal address is inserted from configuration (OUTBOUND_POSTAL_ADDRESS) and is correct; never judge the address itself.",
];

export function reviewSystemPrompt(): string {
  return [
    "You are Komendly's compliance reviewer. Content below is sent or published automatically with no human check.",
    "Block it ONLY for a clear, material breach of a numbered rule, e.g.: an invented number/result/testimonial, a number that",
    "contradicts the facts, a promise of leads/sales/outcomes, a wrong price or free-pack size, a fake identity or Meta",
    "affiliation, fake urgency, asking for calls/texts, publicly shaming a named business, or a broken placeholder.",
    "Do NOT block for wording nits, missing optional details, descriptive words that summarise the facts, product features",
    "listed in PRODUCT FACTS, ordinary dates/timeframes the content's kind implies (a weekly email talks about 'this week'),",
    "or general, non-numeric advice. Transactional/opt-in emails (alerts, reports to customers) need an off switch, not an address.",
    'Reply as JSON: {"approved": boolean, "reasons": string[], "fix": string}. reasons empty and fix "" when approved.',
  ].join("\n");
}

export function reviewPrompt(item: ReviewItem): string {
  const rules = [...HARD_RULES, ...(item.extraRules ?? [])].map((r, i) => `${i + 1}. ${r}`).join("\n");
  return [
    `SYSTEM: ${item.system}  KIND: ${item.kind}`,
    `RULES:\n${rules}`,
    `PRODUCT FACTS (always true):\n${PRODUCT_FACTS.map((f) => `- ${f}`).join("\n")}`,
    `ITEM FACTS (the only allowed source of numbers about third parties and results):\n${item.facts?.trim() || "(none)"}`,
    `CONTENT TO REVIEW:\n<<<\n${item.content}\n>>>`,
  ].join("\n\n");
}

/** Cheap deterministic checks run before (and regardless of) the AI reviewer. */
export function precheck(item: ReviewItem): string[] {
  const out: string[] = [];
  const c = item.content;
  if (!c.trim()) out.push("empty content");
  if (/\{\{[^}]*\}\}|%[A-Z][A-Z_]{2,}%|\$\{[^}]*\}|\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]|lorem ipsum|\bTODO\b/i.test(c)) out.push("unfilled placeholder or broken value");
  if (/guarantee[sd]?\s+(more\s+)?(leads|sales|customers|revenue|roas)/i.test(c)) out.push("promises leads/sales");
  if (/\b(call|text|sms) (us|me)\b/i.test(c)) out.push("asks for a call or text");
  if (item.kind === "email" && !/unsubscribe|opt.?out|turn off|manage emails/i.test(c)) out.push("email without opt-out");
  return out;
}

/** Parse the model output defensively: anything unparseable is a rejection (fail closed). */
export function parseVerdict(raw: unknown): ReviewVerdict {
  let v: unknown = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v.slice(v.indexOf("{"), v.lastIndexOf("}") + 1)); } catch { return { approved: false, reasons: ["reviewer output unparseable"] }; }
  }
  if (!v || typeof v !== "object") return { approved: false, reasons: ["reviewer output missing"] };
  const o = v as { approved?: unknown; reasons?: unknown; fix?: unknown };
  const reasons = Array.isArray(o.reasons) ? o.reasons.filter((r): r is string => typeof r === "string" && r.trim() !== "") : [];
  const approved = o.approved === true && reasons.length === 0;
  return { approved, reasons: approved ? [] : reasons.length ? reasons : ["rejected without reason"], fix: typeof o.fix === "string" && o.fix ? o.fix : undefined };
}

export type TextFn = (req: { system: string; prompt: string; jsonSchema?: Record<string, unknown> }) => Promise<{ text: string; json?: unknown }>;
export type ReviewLog = (e: { system: string; kind: string; itemKey: string; approved: boolean; reasons: string[]; attempt: number }) => Promise<void>;

/** One review: deterministic precheck, then the AI reviewer. Fails closed on any error. */
export async function reviewOnce(text: TextFn, item: ReviewItem): Promise<ReviewVerdict> {
  const pre = precheck(item);
  if (pre.length) return { approved: false, reasons: pre };
  try {
    const r = await text({ system: reviewSystemPrompt(), prompt: reviewPrompt(item), jsonSchema: REVIEW_JSON_SCHEMA as unknown as Record<string, unknown> });
    return parseVerdict(r.json ?? r.text);
  } catch (e) {
    return { approved: false, reasons: [`reviewer error: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/**
 * Review with one revision round: if rejected, `revise(item, verdict)` may return new content (or null to give up),
 * which is reviewed once more. Returns the approved content, or null = do not send/publish.
 */
export async function reviewGate(
  text: TextFn,
  item: ReviewItem,
  opts: { revise?: (item: ReviewItem, v: ReviewVerdict) => Promise<string | null>; log?: ReviewLog } = {},
): Promise<{ approved: boolean; content: string | null; verdict: ReviewVerdict }> {
  let current = item;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const v = await reviewOnce(text, current);
    await opts.log?.({ system: current.system, kind: current.kind, itemKey: current.itemKey, approved: v.approved, reasons: v.reasons, attempt }).catch(() => {});
    if (v.approved) return { approved: true, content: current.content, verdict: v };
    if (attempt === 2 || !opts.revise) return { approved: false, content: null, verdict: v };
    const next = await opts.revise(current, v).catch(() => null);
    if (!next) return { approved: false, content: null, verdict: v };
    current = { ...current, content: next };
  }
  return { approved: false, content: null, verdict: { approved: false, reasons: ["unreachable"] } };
}
