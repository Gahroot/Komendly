// Inbound auto-responder, pure part (unit-tested): loop prevention, classification rules, guardrails, reply builder.
// Server side (DB, AI, send): ./auto-reply-server.ts. Never imports Next/Prisma.
import { AD_SPEND_LINE, DIY_PRICE_LINE, FREE_PACK_LINE, HERO_PRICE_LINE, NO_GUARANTEE_LINE } from "./public-offer";
import { GUARANTEE_DAYS } from "./billing-config";

export const REPLY_CATEGORIES = ["support_problem", "refund_request", "how_to", "interested", "objection", "not_interested", "unsubscribe", "spam", "out_of_office", "billing", "angry_legal", "other"] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export const SENDER_WINDOW_MS = 12 * 3_600_000;
export const MAX_PER_SENDER_WINDOW = 1;
export const MAX_PER_THREAD = 3;
const OWN_DOMAINS = ["komendly.com", "getkomendly.com", "prestyj.com"];

/** Header we stamp on our auto-replies; seeing it on an inbound mail means a loop. */
export const AUTO_HEADER = "X-Komendly-Auto";

/** A reason NOT to auto-reply at all (own domain, forward address, bounce, auto-reply, loop), or null. */
export function loopSkipReason(m: { from: string; subject: string; headers?: Record<string, string | null | undefined>; forwardTo?: string }): string | null {
  const from = m.from.trim().toLowerCase();
  if (!from || !from.includes("@")) return "no sender";
  const [local, domain] = [from.split("@")[0], from.split("@")[1] ?? ""];
  if (m.forwardTo && from === m.forwardTo.trim().toLowerCase()) return "forward address";
  if (OWN_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return "own domain";
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?|notifications?|abuse)([+._-].*)?$/.test(local)) return "system sender";
  const h = (k: string) => (m.headers?.[k] ?? m.headers?.[k.toLowerCase()] ?? "").toString().toLowerCase();
  if (h(AUTO_HEADER)) return "our own auto-reply";
  const auto = h("Auto-Submitted");
  if (auto && auto !== "no") return "auto-submitted";
  if (/bulk|junk|list|auto_reply/.test(h("Precedence"))) return "precedence";
  if (h("X-Autoreply") || h("X-Autorespond") || h("X-Auto-Response-Suppress") || h("List-Unsubscribe") || h("List-Id")) return "automatic/list mail";
  if (/^(auto(matic)?[ -]?(reply|response)|out of (the )?office|undeliverable|delivery (status|failure)|mail delivery|returned mail|failure notice)\b|\bout of office\b|\bautomatic reply\b/i.test(m.subject.trim())) return "auto-reply subject";
  return null;
}

const ANGRY = /\b(lawyer|attorney|legal action|lawsuit|sue you|suing|scam|fraud|report you|reporting you|police|bbb|ftc|gdpr|cease and desist|harass|fuck|bullshit|piece of shit)\b/i;
const UNSUB = /\b(unsubscribe|remove me|take me off|opt[ -]?out|stop (emailing|sending|messaging|contacting)|stop these emails|stop email)/i;
const NOT_INT = /\b(not interested|no thanks|no thank you|don'?t need|do not need|not for me|not looking)\b/i;
const REFUND = /\b(refund|money back|chargeback|charge ?back|reimburse)/i;
const BILLING = /\b(charged|double charge|invoice|billing|payment|cancel (my|the|our) (subscription|plan|account)|cancel subscription|subscription)\b/i;
const SUPPORT = /(can'?t|cannot|unable to|won'?t|doesn'?t|not)\s+(\w+\s+){0,3}(download|log ?in|sign ?in|work|load|open|access|receive|get)|\b(error|bug|broken|stuck|verification code|password|no code|never (got|received)|not working|failed|crash)/i;
const OBJECTION = /\b(too expensive|expensive|too much|can'?t afford|not sure (it|this|if|that)|will (it|this) (really )?work|does (it|this) (really )?work|worth it|skeptical|doubt|no budget|tried .* before)\b/i;
const INTERESTED = /\b(how much|pricing|price|cost|plans?|sign me up|want to (buy|start|try|upgrade)|interested|autopilot|ad department|tell me more|more info|demo)\b/i;
const HOWTO = /\b(how (do|can|to|does|would)|where (do|can|is|are)|can i (change|edit|add|use|get|make|remove)|is there a way)\b/i;

/** Rules-first classification; null = ambiguous (ask the AI). `paying` enables the billing category. */
export function classifyByRules(text: string, opts: { paying?: boolean } = {}): ReplyCategory | null {
  const t = text.trim();
  if (!t) return "other";
  if (ANGRY.test(t)) return "angry_legal";
  if (UNSUB.test(t)) return "unsubscribe";
  if (REFUND.test(t)) return "refund_request";
  if (opts.paying && BILLING.test(t)) return "billing";
  if (SUPPORT.test(t)) return "support_problem";
  if (NOT_INT.test(t)) return "not_interested";
  if (OBJECTION.test(t)) return "objection";
  if (HOWTO.test(t)) return "how_to";
  if (INTERESTED.test(t)) return "interested";
  return null;
}

export function parseCategory(raw: unknown): ReplyCategory | null {
  let v: unknown = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v.slice(v.indexOf("{"), v.lastIndexOf("}") + 1)); } catch { return null; }
  }
  const c = v && typeof v === "object" ? (v as { category?: unknown }).category : null;
  return typeof c === "string" && (REPLY_CATEGORIES as readonly string[]).includes(c) ? (c as ReplyCategory) : null;
}

export const CLASSIFY_SCHEMA = { type: "object", additionalProperties: false, required: ["category"], properties: { category: { type: "string", enum: [...REPLY_CATEGORIES] } } } as const;
export const CLASSIFY_SYSTEM = `Classify an email reply sent to Komendly (makes Facebook/Instagram ads from a website). Categories: support_problem (can't download/log in/bug), refund_request, how_to, interested (buying/pricing question), objection (price, unsure it works), not_interested, unsubscribe, billing (charges/invoices/cancelling), angry_legal (angry, threats, legal), spam, out_of_office, other. Reply as JSON {"category": "..."}.`;

/** Categories where a person must look (flagged `email_needs_human`). */
export function needsHuman(category: ReplyCategory): boolean {
  return category === "refund_request" || category === "angry_legal" || category === "billing";
}
/** Categories that get an automatic answer. */
export function repliesTo(category: ReplyCategory): boolean {
  return !["spam", "out_of_office", "angry_legal", "other"].includes(category);
}

export interface GuardrailFacts {
  /** Auto-replies already sent to this sender in the last 12h. */
  senderRecent: number;
  /** Auto-replies already sent in this thread (same sender + normalised subject). */
  threadTotal: number;
}
export function guardrailBlock(f: GuardrailFacts): string | null {
  if (f.senderRecent >= MAX_PER_SENDER_WINDOW) return "sender limit (1 per 12h)";
  if (f.threadTotal >= MAX_PER_THREAD) return "thread limit (3)";
  return null;
}

export function threadKey(subject: string): string {
  return subject.replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/i, "").trim().toLowerCase().slice(0, 120);
}

export interface ReplyContext {
  category: ReplyCategory;
  firstName: string | null;
  /** Absolute links. */
  runUrl: string | null;
  pricingUrl: string;
  billingUrl: string;
  paying: boolean;
  /** AI-written answer paragraph for how_to/interested/objection (already facts-constrained); optional. */
  answer?: string | null;
}

/** Facts the AI answer may use (only public-offer facts). */
export const ANSWER_FACTS = [FREE_PACK_LINE, DIY_PRICE_LINE, HERO_PRICE_LINE, AD_SPEND_LINE, NO_GUARANTEE_LINE, `30-day refund guarantee on the first payment (${GUARANTEE_DAYS} days).`].join("\n");

const FOOTER = "(Reply \"unsubscribe\" any time and I'll stop emailing you.)";

/** The reply (subject is added by the caller as `Re: ...`). Plain text, short, signed Nolan; null = send nothing. */
export function buildAutoReply(c: ReplyContext): string | null {
  const hi = `Hi ${c.firstName?.trim() || "there"},`;
  const run = c.runUrl ? `Your ads are here: ${c.runUrl}` : null;
  const download = c.runUrl ? "To download, open that page, tap an ad and hit Download." : "To download, open your ads page, tap an ad and hit Download.";
  const sign = ["", "Nolan"];
  const wrap = (lines: (string | null)[]) => [hi, "", ...lines.filter((l): l is string => l !== null), ...sign, "", FOOTER].join("\n");
  switch (c.category) {
    case "unsubscribe":
    case "not_interested":
      return [hi, "", "Done, I've taken you off. You won't get more emails from me. All the best.", "", "Nolan"].join("\n");
    case "support_problem":
      return wrap(["Sorry you're hitting trouble. Here's what I'd try first:", run, download, "If you can't log in, request a fresh sign-in code on the login page and check your spam folder.", "If that doesn't fix it, reply with what you see (a screenshot helps) and what you were trying to do."]);
    case "refund_request":
      return wrap(["Thanks for telling me. I've flagged your refund request for review and you'll get an answer by email.", c.paying ? `You can see your billing here: ${c.billingUrl}` : null]);
    case "billing":
      return c.paying ? wrap([`For anything about charges or your plan, your billing page is the place: ${c.billingUrl}`, "I've also flagged your message so it gets looked at."]) : null;
    case "how_to":
      return wrap([c.answer?.trim() || "Happy to help.", run, download, "What are you trying to do with your ads? That helps me point you the right way."]);
    case "interested":
      return wrap([c.answer?.trim() || `${FREE_PACK_LINE}. Plans and prices are here: ${c.pricingUrl}`, `Plans and prices: ${c.pricingUrl}`, run, "What's the main thing you want your ads to do for your business?"]);
    case "objection":
      return wrap([c.answer?.trim() || `Fair question. ${NO_GUARANTEE_LINE} There's a ${GUARANTEE_DAYS}-day refund guarantee on the first payment, and the free pack lets you see the ads first.`, `Plans and prices: ${c.pricingUrl}`, run, "What would you need to see to feel sure about it?"]);
    default:
      return null;
  }
}
