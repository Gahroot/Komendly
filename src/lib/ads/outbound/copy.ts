// Cold outbound email copy (Kly). Human, short, plain text, ONE link. The variable parts (subject, body, follow-up)
// are experiment arms with placeholders; the signature, postal address and unsubscribe line are always added here,
// so no variant can drop a compliance part. No AI-written openers: they read like a robot summarising a website.

export interface OutboundCopyContext {
  step: 1 | 2;
  businessName: string;
  city: string;
  niche: string;
  senderName: string;
  /** The gift ad's headline (from the Ad row), if known. */
  headline?: string | null;
  /** The one link: short claim URL that opens the gift page (ad + "get more"). */
  claimUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
  /** Experiment variants (invalid ones fall back to the defaults). */
  variant?: CopyVariant;
  /** Step 2: the subject the first email actually went out with (threaded "Re:"). */
  firstSubject?: string | null;
  /** Step 1 only: one evidence-backed sentence about the lead's real signal (e.g. "Your longest-running Facebook ad has been live since Jun 2024."). Never invented. */
  signalLine?: string | null;
  /** Calendar hook (seasonal_hook) used as the opener only when there is no signalLine. */
  seasonalHook?: string | null;
}

/** Default CAN-SPAM postal address (OUTBOUND_POSTAL_ADDRESS overrides). */
export const DEFAULT_POSTAL_ADDRESS = "2211 Cole St, Birmingham, MI 48009";

export interface OutboundEmail {
  subject: string;
  text: string;
}

// "$" only for the real, fixed prices (Ozzy Ad Department $97 first month then $197/mo, $9 unlock); any other amount is banned.
const BANNED = /\b(guarantee|guaranteed|results|roi|revenue|leads? (?:will|guaranteed)|customer of ours|we work with|partner(?!s? program)|award|#1|best in|free forever|limited time|act now|urgent|last chance|congratulations|winner|100%|dear sir|to whom it may concern|i hope this (?:email|message) finds you|hi there)\b|%|\$(?!(?:97|197|9)\b(?![.,]\d))|!{2,}|https?:|www\.|@/i;

/** Does `text` (placeholders already blanked, e.g. "{link}" -> "X") trip the claim/format guard? `allowPrices` are exact public
 * price strings (e.g. "$297" from public-offer.ts) a fixed, non-arm message may carry on top of the arm price rule. */
export function hasBannedClaim(text: string, allowPrices: readonly string[] = []): boolean {
  let t = text;
  for (const p of allowPrices) t = t.replace(new RegExp(`${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?![.,]\\d)`, "g"), "PRICE");
  return BANNED.test(t);
}

// ---------------------------------------------------------------------------
// Names

const SUFFIX = /[,\s]+(l\.?l\.?c\.?|inc\.?|incorporated|co\.?|corp\.?|corporation|ltd\.?|llp|pllc|p\.?c\.?|company)\s*$/i;
const KEEP_UPPER = new Set(["HVAC", "AC", "A/C", "USA", "US", "LLC", "DJ", "BBQ", "ABC", "JM", "JR", "TV", "PC", "ATX", "NYC", "LA", "DC"]);

function titleWord(w: string): string {
  if (KEEP_UPPER.has(w.toUpperCase()) || (w.length <= 3 && /^[A-Z]+$/.test(w) && !/[AEIOU]/.test(w))) return w.toUpperCase();
  const lower = w.toLowerCase();
  const t = lower.charAt(0).toUpperCase() + lower.slice(1);
  return t.replace(/^(Mc|Mac(?=[^aeiouk]))(\w)/, (_m, p: string, c: string) => p + c.toUpperCase()).replace(/^O'(\w)/, (_m, c: string) => `O'${c.toUpperCase()}`);
}

/** "MCCARRICK ELECTRIC LLC" -> "McCarrick Electric"; "EVERYDAYPLUMBER.com" -> "Everydayplumber"; mixed case is kept. */
export function cleanBusinessName(raw: string): string {
  let n = raw.trim().replace(/\s+/g, " ");
  n = n.replace(/\.(com|net|org|co|us|biz)\b.*$/i, "");
  for (let i = 0; i < 2; i++) n = n.replace(SUFFIX, "");
  const short = n.replace(/\s+(service department|services|service|department|& (?:more|co))\s*$/i, "").trim();
  if (short.split(" ").length >= 2) n = short;
  n = n.replace(/[,\-–|:]+$/, "").trim();
  const letters = n.replace(/[^A-Za-z]/g, "");
  const shouting = letters.length > 3 && letters === letters.toUpperCase();
  const glued = !/\s/.test(n) && letters === letters.toLowerCase();
  if (shouting || glued) n = n.split(" ").map(titleWord).join(" ");
  return n || raw.trim();
}

function trade(niche: string): string {
  return niche.trim().toLowerCase() || "local businesses";
}

// ---------------------------------------------------------------------------
// Variable parts (Kly experiment arms)

export const PLACEHOLDERS = ["business", "city", "niche", "headline", "link"] as const;
export type CopyDimension = "subject" | "body" | "followup";

/** When the gift ad is made: before the email (the ad is in it) or live when the prospect opens the link. */
export type GiftTiming = "prebuilt" | "on-click";
export const GIFT_TIMINGS: readonly GiftTiming[] = ["prebuilt", "on-click"];

export interface CopyVariant {
  subject?: string | null;
  body?: string | null;
  followup?: string | null;
}

export const DEFAULT_SUBJECT = "made you something";
export const DEFAULT_BODY = [
  "Made this for {business} \u2193",
  "",
  "{link}",
  "",
  "Built it from your website. It's yours to run, free, no catch. Want more? That page gets you 10 more free ads, no card.",
].join("\n");
export const DEFAULT_FOLLOWUP = ["Your ad's still here if you want it: {link}", "", "No pressure either way."].join("\n");

/**
 * The starting copy arms. The first body line is what shows in the inbox preview after the subject, so it's the hook
 * (never a greeting). Subjects: short, lowercase, gift/curiosity, never the company name. One link.
 */
export interface SeedCopy {
  dimension: CopyDimension;
  key: string;
  template: string;
  audience?: "agency";
  timing: GiftTiming | "any";
  /** Kept for history only: Kly retires the live arm and never selects it again (Nov 21 rewrite). */
  retired?: true;
}

/** Sign-off the founder variants carry themselves (no auto signature is added under it). */
export const NOLAN_SIGNOFF = "\u2014 Nolan, founder, Komendly";

/** A template that ends with its own "— Name" sign-off line. */
export function hasOwnSignOff(text: string): boolean {
  return /(^|\n)\u2014 [^\n]+\s*$/.test(text.trim());
}

/**
 * Nov 21 rewrite (autopilot plan): 3 local-business bodies + 1 threaded follow-up, signed by Nolan, pitching Ozzy Ad
 * Department. Timing "any": the wording is true whether the gift ad is pre-made or drawn when they open {link}.
 */
export const NOLAN_COPY: SeedCopy[] = [
  { dimension: "body", key: "nolan-meta-live", timing: "any", template: ["Here's a Facebook ad for {business}, drawn from your website:", "", "{link}", "", "I'm Nolan, I run Komendly. Our Ozzy Ad Department makes ads like this from your website every week, ready to post. $97 the first month, then $197/mo.", "", "Your first 10 ads are free, no card.", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "body", key: "nolan-would-you-run", timing: "any", template: ["Would you run this ad for {business}?", "", "{link}", "", "It comes straight from your website. If you like it, Komendly's Ozzy Ad Department makes fresh ones every week, with a coach that tells you what's working. $97 for the first month, $197/mo after.", "", "The first 10 ads are free, no card needed.", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "body", key: "nolan-no-agency", timing: "any", template: ["Ozzy, Komendly's ad tool, turns {business}'s website into Facebook ads. Yours is here:", "", "{link}", "", "Want fresh ones every week without hiring an agency? Ozzy makes new ads from your website every Monday. Month to month: $97 the first month, then $197/mo.", "", "10 free ads to start, no card.", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "followup", key: "nolan-followup", timing: "any", template: ["The ad for {business} is one tap away: {link}", "", "Want fresh ads every week? Ozzy Ad Department makes new ones from your website every Monday. $97 the first month, 10 ads free first.", "", NOLAN_SIGNOFF].join("\n") },
];

/**
 * Hormozi rewrite (Nov 26, $100M Leads): lead with THEIR finished ad (the gift), name the outcome in one line, one tiny ask
 * ("reply yes"), one reason-to-reply question. No price, no plan pitch in the first touch: the gift page carries the offer.
 * Timing "any": true whether the ad is pre-made or drawn when they open {link}. Replaces the Nolan variants (retired below).
 */
export const HORMOZI_COPY: SeedCopy[] = [
  { dimension: "body", key: "hz-gift-outcome", timing: "any", template: ["Here's a Facebook ad for {business}, made from your website:", "", "{link}", "", "The idea: a Facebook ad that keeps asking for quote requests, without you running it.", "", "Want me to help you put it live? Reply yes.", "", "Which job would you most like more of?", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "body", key: "hz-which-job", timing: "any", template: ["Which job would you like more of at {business}? I made a Facebook ad from your website to start with:", "", "{link}", "", "So your ads keep working while you're out on a job, without you running them.", "", "Want me to help you put it live? Reply yes.", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "body", key: "hz-headline", timing: "any", template: ["\"{headline}\"", "", "That's the Facebook ad I made for {business} from your website:", "", "{link}", "", "It's built so your ads keep going out for quote requests without you running them. Want me to help you put it live? Reply yes.", "", "What's your slowest month for new jobs?", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "followup", key: "hz-followup", timing: "any", template: ["Your Facebook ad for {business} is still here: {link}", "", "Want me to help you put it live? Reply yes. Or tell me which service you want more calls for.", "", NOLAN_SIGNOFF].join("\n") },
];

/**
 * Nov 27 rewrite (governor: ~744 sends, 0 positive replies on the hz arms). Each opens with a question a busy owner can
 * answer in one word, names the gift plainly, and asks for a one-word reply. No price in the first touch. Wording is
 * true for both gift timings ("from your website", never "I made you"). Replaces HORMOZI_COPY (retired below).
 */
export const QUESTION_COPY: SeedCopy[] = [
  { dimension: "body", key: "q-who-does-ads", timing: "any", template: ["Who handles the ads for {business} right now?", "", "I ask because Komendly turns a website into ready-to-post Facebook ads. Here's one from yours, free to keep:", "", "{link}", "", "If the answer is \"nobody, no time\", that's who it's for. Reply \"more\" and I'll send the next 10, free.", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "body", key: "q-more-jobs", timing: "any", template: ["Could {business} take on more jobs this month?", "", "If so, here's a Facebook ad drawn from your website. Free to keep, no card:", "", "{link}", "", "Reply with the one service you want more of and I'll aim the next ads at it.", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "body", key: "q-useful-or-not", timing: "any", template: ["A Facebook ad for {business}, from your website:", "", "{link}", "", "Free to keep, no card, nothing to install. Is this useful, or not your thing? A one-word reply helps me either way.", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "followup", key: "q-followup", timing: "any", template: ["Quick nudge on the ad for {business}: {link}", "", "Want more like it? Reply \"more\". Not for you? Reply \"no\" and I'll stop.", "", NOLAN_SIGNOFF].join("\n") },
  { dimension: "subject", key: "q-quick-question", timing: "any", template: "quick question" },
  { dimension: "subject", key: "q-your-website", timing: "any", template: "from your website" },
];

/** Old local-business body/follow-up seeds, retired by the Nov 21 rewrite (agency copy keeps running). */
const RETIRED_KEYS = new Set(["free-gift", "made-this", "would-you-run", "headline-hook", "too-busy", "still-here", "last-note", "did-it-land", "oc-tap-to-draw", "oc-want-one", "oc-too-busy", "oc-still-ready", "oc-last-note"]);

export const SEED_COPY: SeedCopy[] = ([
  { dimension: "subject", key: "made-you-something", timing: "prebuilt", template: DEFAULT_SUBJECT },
  { dimension: "subject", key: "free-gift", timing: "any", template: "a free gift for you" },
  { dimension: "subject", key: "your-free-ad", timing: "prebuilt", template: "here's your free ad" },
  { dimension: "subject", key: "new-fb-ad", timing: "prebuilt", template: "your new facebook ad" },
  { dimension: "body", key: "made-this", timing: "prebuilt", template: DEFAULT_BODY },
  { dimension: "body", key: "would-you-run", timing: "prebuilt", template: ["Would you run this ad?", "", "{link}", "", "I made it from {business}'s website. Free to keep, no catch. If the angle's off, that page gets you 10 more free ads, no card."].join("\n") },
  { dimension: "body", key: "headline-hook", timing: "prebuilt", template: ["\"{headline}\"", "", "That's your new Facebook ad. Made it from {business}'s website:", "", "{link}", "", "Yours to use, free. Tweak it or ignore it, totally up to you."].join("\n") },
  { dimension: "body", key: "too-busy", timing: "prebuilt", template: ["Most {niche} are too busy doing the actual work to make ads. So I made {business} one.", "", "{link}", "", "Free to keep. No call, no catch."].join("\n") },
  { dimension: "followup", key: "still-here", timing: "prebuilt", template: DEFAULT_FOLLOWUP },
  { dimension: "followup", key: "last-note", timing: "prebuilt", template: ["Last note from me. If ads aren't a priority right now, totally get it.", "", "The ad's yours either way: {link}"].join("\n") },
  { dimension: "followup", key: "did-it-land", timing: "prebuilt", template: ["Did this one land? {link}", "", "Just didn't want it lost in your inbox."].join("\n") },
  // Agencies: the pitch is speed across every client, not one ad for themselves.
  { dimension: "subject", key: "agency-for-your-clients", timing: "any", audience: "agency", template: "for your clients" },
  { dimension: "subject", key: "agency-made-this", timing: "prebuilt", audience: "agency", template: "made this from your site" },
  { dimension: "subject", key: "agency-creative", timing: "any", audience: "agency", template: "client ads, in minutes" },
  { dimension: "body", key: "agency-roster", timing: "prebuilt", audience: "agency", template: ["Made this for {business}, straight from your website \u2193", "", "{link}", "", "Now picture that for every client on your roster. Point Ozzy at any client's site and he makes a full pack of ready-to-run Meta ads. Your first 10 are free."].join("\n") },
  { dimension: "body", key: "agency-how-long", timing: "prebuilt", audience: "agency", template: ["How long does your team spend on one client's ad creative?", "", "{link}", "", "Ozzy made that from your website in a couple of minutes. Give him any client's site and you get a full pack. First 10 ads are free, no card."].join("\n") },
  { dimension: "body", key: "agency-headline", timing: "prebuilt", audience: "agency", template: ["\"{headline}\"", "", "That's an ad Ozzy made for {business} from your site:", "", "{link}", "", "Komendly turns any client's website into ready-to-run Facebook and Instagram ads. Your first 10 are free."].join("\n") },
  { dimension: "followup", key: "agency-still-here", timing: "prebuilt", audience: "agency", template: ["Still here if you want it: {link}", "", "Worth a look before your next client creative sprint."].join("\n") },
  { dimension: "followup", key: "agency-last-note", timing: "prebuilt", audience: "agency", template: ["Last note from me. If your team already has creative covered, all good.", "", "The ad's yours either way: {link}"].join("\n") },
  // Partner program (real terms: AdsPartner.commissionPct 30, 12 months; see /partners). "%" is banned, so "percent".
  { dimension: "body", key: "agency-partner-roster", timing: "prebuilt", audience: "agency", template: ["Made this for {business}, straight from your website \u2193", "", "{link}", "", "Ozzy can do the same for any client's site. And if your clients sign up through our partner program, you earn 30 percent of what they pay for 12 months. Your first 10 ads are free."].join("\n") },
  { dimension: "body", key: "oc-agency-partner", timing: "on-click", audience: "agency", template: ["Want to see what Ozzy draws from your website?", "", "{link}", "", "Tap it and he makes three ready-to-run Meta ads live. If your clients like them too, our partner program pays you 30 percent of what they pay for 12 months. Your own first 10 ads are free, no card."].join("\n") },
  { dimension: "followup", key: "agency-partner-note", timing: "any", audience: "agency", template: ["One more thing: if your clients sign up through our partner program, you earn 30 percent of what they pay for 12 months.", "", "Ozzy's still here for you: {link}"].join("\n") },
  // Gift on click: no ad exists yet when the email goes out; Ozzy draws 3 live when they open the link. So the copy
  // must never say "made you" / "your ad" (it isn't made yet): it offers the drawing instead.
  { dimension: "subject", key: "oc-want-a-free-ad", timing: "on-click", template: "want a free ad?" },
  { dimension: "subject", key: "oc-ozzy-draw", timing: "on-click", template: "ozzy wants to draw you an ad" },
  { dimension: "body", key: "oc-tap-to-draw", timing: "on-click", template: ["Ozzy draws free Facebook ads straight from a business's website. He's got {business}'s site open and is ready to make yours.", "", "{link}", "", "Tap that and watch him draw 3 ads for you, live, in about two minutes. Free to keep, no card, no catch."].join("\n") },
  { dimension: "body", key: "oc-want-one", timing: "on-click", template: ["Want a free Facebook ad for {business}?", "", "{link}", "", "Open that and Ozzy draws three from your website while you watch. Takes a couple of minutes. Yours to keep, no catch."].join("\n") },
  { dimension: "body", key: "oc-too-busy", timing: "on-click", template: ["Most {niche} are too busy doing the actual work to make ads. So Ozzy will make {business} a few, free.", "", "{link}", "", "Tap it and he draws them live from your website. No call, no card."].join("\n") },
  { dimension: "body", key: "oc-agency", timing: "on-click", audience: "agency", template: ["Want to see what Ozzy makes from your website?", "", "{link}", "", "Tap it and he draws three ready-to-run Meta ads live. Then point him at any client's site. Your first 10 ads are free, no card."].join("\n") },
  { dimension: "followup", key: "oc-still-ready", timing: "on-click", template: ["Ozzy's still ready to draw your ads: {link}", "", "Takes two minutes, free either way."].join("\n") },
  { dimension: "followup", key: "oc-last-note", timing: "on-click", template: ["Last note from me. If ads aren't a priority right now, totally get it.", "", "Ozzy's offer stands: {link}"].join("\n") },
] as SeedCopy[]).map((c): SeedCopy => (RETIRED_KEYS.has(c.key) ? { ...c, retired: true } : c)).concat(NOLAN_COPY.map((c): SeedCopy => ({ ...c, retired: true })), HORMOZI_COPY.map((c): SeedCopy => ({ ...c, retired: true })), QUESTION_COPY);

export function renderTemplate(t: string, vars: Partial<Record<(typeof PLACEHOLDERS)[number], string>>): string {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (vars[k as keyof typeof vars] ?? "") : m));
}

/** Validate one variable part (seed, strategist or manual). Returns an error or null. */
export function checkVariant(dim: CopyDimension, t: string): string | null {
  const text = t.trim();
  if (!text) return "empty";
  const unknown = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").filter((k) => !(PLACEHOLDERS as readonly string[]).includes(k));
  if (unknown.length) return `unknown placeholder {${unknown[0]}}`;
  const bare = text.replace(/\{\w+\}/g, "X");
  if (BANNED.test(bare)) return "banned phrase";
  if (/[<>]/.test(bare)) return "markup";
  const count = (k: string) => text.split(`{${k}}`).length - 1;
  if (dim === "subject") {
    if (text.length > 50 || text.length < 5) return "subject length";
    if (/^\s*(re|fwd?)\s*:/i.test(text)) return "fake reply subject";
    if (/\n/.test(text) || /!/.test(text)) return "subject format";
    if (count("business") || count("headline") || count("link")) return "subject must not name the business";
    return null;
  }
  if (count("link") !== 1) return `${dim} needs {link} exactly once`;
  if (/^\s*(hey|hi|hello|dear|good (morning|afternoon)|greetings)\b/i.test(text)) return "starts with a greeting (lead with the hook)";
  if (dim === "body") return text.length > 600 ? "too long" : null;
  return text.length > 400 ? "too long" : null;
}

function variantOr(dim: CopyDimension, t: string | null | undefined, fallback: string): string {
  return t && !checkVariant(dim, t) ? t : fallback;
}

export function outboundSubject(c: Pick<OutboundCopyContext, "step" | "city" | "niche" | "variant" | "firstSubject">): string {
  const first = renderTemplate(variantOr("subject", c.variant?.subject, DEFAULT_SUBJECT), { city: c.city, niche: trade(c.niche) }).slice(0, 60);
  // Step 2 is a real reply in the same thread (In-Reply-To), so "Re:" is truthful there.
  return c.step === 1 ? first : `Re: ${c.firstSubject ?? first}`.slice(0, 70);
}

/** First name + a short line; the Ozzy mailbox signs as the wizard himself. */
export function signature(senderName: string): string[] {
  const first = senderName.trim().split(/\s+/)[0] || "Ozzy";
  return /^ozzy$/i.test(first) ? ["Ozzy", "the ad wizard at Komendly"] : [first, "Komendly"];
}

/** The whole email: short body + signature + a quiet footer (postal address, one-line opt-out). */
export function buildOutboundEmail(c: OutboundCopyContext): OutboundEmail {
  const headline = (c.headline ?? "").trim().replace(/^["“]|["”]$/g, "");
  const vars = { business: cleanBusinessName(c.businessName), city: c.city, niche: trade(c.niche), headline, link: c.claimUrl };
  let tpl = c.step === 1 ? variantOr("body", c.variant?.body, DEFAULT_BODY) : variantOr("followup", c.variant?.followup, DEFAULT_FOLLOWUP);
  if (tpl.includes("{headline}") && (headline.length < 8 || headline.length > 90)) tpl = c.step === 1 ? DEFAULT_BODY : DEFAULT_FOLLOWUP;
  const rendered = renderTemplate(tpl, vars);
  const opener = c.step === 1 ? (c.signalLine ?? c.seasonalHook ?? "").trim() : "";
  const body = opener && opener.length <= 160 && !/https?:|\{\w+\}/.test(opener) ? `${opener}\n\n${rendered}` : rendered;
  const text = [
    body,
    "",
    ...(hasOwnSignOff(body) ? [] : [...signature(c.senderName), ""]),
    "--",
    `Komendly, ${c.postalAddress}`,
    `Not for you? Reply "stop" or unsubscribe: ${c.unsubscribeUrl}`,
  ].join("\n");
  return { subject: outboundSubject(c), text };
}

/** Body words above the "--" footer. */
export function bodyWordCount(text: string): number {
  const body = text.split("\n--\n")[0] ?? text;
  return body.replace(/https?:\/\/\S+/g, "").split(/\s+/).filter((w) => /\w/.test(w)).length;
}

/** Final compliance gate before any send (also on fallback copy). Returns an error string or null. */
export function checkOutboundEmail(e: OutboundEmail, c: OutboundCopyContext, o: { maxFollowUpWords?: number } = {}): string | null {
  if (!c.postalAddress.trim()) return "missing postal address";
  if (!e.text.includes(c.postalAddress)) return "postal address not in body";
  if (!e.text.includes(c.unsubscribeUrl)) return "unsubscribe link not in body";
  if (!e.text.includes(c.claimUrl)) return "claim link not in body";
  const links = (e.text.split("\n--\n")[0] ?? "").match(/https?:\/\//g)?.length ?? 0;
  if (links !== 1) return `${links} links above the footer (want 1)`;
  const words = bodyWordCount(e.text);
  if (c.step === 1 && (words < 20 || words > 90)) return `body ${words} words`;
  if (c.step === 2 && words > (o.maxFollowUpWords ?? 70)) return `follow-up ${words} words`;
  if (/\b(re|fwd?):/i.test(e.subject) && c.step === 1) return "fake reply subject";
  if (/\{\w+\}/.test(e.text) || /\{\w+\}/.test(e.subject)) return "unfilled placeholder";
  if (BANNED.test(e.subject)) return "banned phrase in subject";
  return null;
}

/** Short public links used in emails (komendly.com/g/<claimToken>, /u/<unsubToken>). */
export function claimLink(base: string, claimToken: string): string {
  return `${base.replace(/\/$/, "")}/g/${claimToken}`;
}
export function unsubscribeLink(base: string, unsubToken: string): string {
  return `${base.replace(/\/$/, "")}/u/${unsubToken}`;
}

/** RFC 8058 one-click unsubscribe + mailto fallback. */
export function unsubscribeHeaders(unsubscribeUrl: string, mailbox: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${mailbox}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Style guide shared with Kly's strategist (it writes new variants within these rules). */
export const COPY_STYLE_GUIDE = [
  "Write like one real person typing a quick note to a local business owner, not marketing.",
  "Subjects: 2-6 words, lowercase, curiosity or gift framing (e.g. 'made you something', 'a free gift for you'); never the business name, never 're:', no '!'.",
  "Prices may appear only as the real ones: $97 the first month, then $197/mo (Ozzy Ad Department); 10 free ads, no card (gift packs drawn from the link are 3 ads). Never promise leads, sales or outcomes.",
  "Bodies: under 70 words, short lines. The FIRST LINE is the inbox preview, so it must be the hook (the gift, a question, their ad's headline), never a greeting like 'Hey X team' or 'Hi there'. Exactly one {link}, no summary of their own website back to them, no buzzwords, no claims about results.",
  "Follow-ups: 1-3 short lines, exactly one {link}, friendly, zero guilt.",
  "Agency variants (audience agency) pitch speed across all their clients and the Agency plan, never claim we work with other agencies.",
  "Placeholders allowed: {business} (clean short name), {city}, {niche} (plural trade), {headline} (the gift ad's headline), {link}.",
].join(" ");

// ---------------------------------------------------------------------------
// HTML version (Kly "format" arm = html): Ozzy's night-sky card, the gift ad as the hero, one gold button.
// Same words as the plain-text part (multipart/alternative), table layout + inline CSS for every mail client.
// Animation: an animated GIF (the only motion that works in Gmail/Outlook/Apple Mail).

export type EmailFormat = "html" | "plain";
export const EMAIL_FORMATS: readonly EmailFormat[] = ["html", "plain"];

export interface OutboundHtmlInput {
  /** Public origin for static images (default https://www.komendly.com). */
  assetBase?: string;
  /** The gift ad image (absolute URL, already sized for email), or null. */
  adImageUrl: string | null;
  /** Shown under the hero ("Made for <business>"). */
  businessName: string;
  /** Gift on click: the hero is a preview card and the button says Ozzy will draw it. */
  onClick?: boolean;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Resized email copy of a gift image via Next's optimizer (local path only; widths from Next's default set). */
export function emailImageUrl(base: string, giftImagePath: string, width = 750): string {
  return `${base.replace(/\/$/, "")}/_next/image?url=${encodeURIComponent(giftImagePath)}&w=${width}&q=75`;
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";
const K = { bg: "#0c0820", card: "#150d2e", border: "#2f1a5e", text: "#fff1d6", muted: "#c9b8e8", gold: "#ffcf4a", ink: "#2a0f10", faint: "#8f7fb5" };

/** The full HTML email for one message (step 1 = gift, step 2 = nudge). */
export function buildOutboundHtml(c: OutboundCopyContext, h: OutboundHtmlInput): string {
  const asset = (h.assetBase ?? "https://www.komendly.com").replace(/\/$/, "");
  const plain = buildOutboundEmail(c);
  const bodyText = plain.text.split("\n--\n")[0] ?? plain.text;
  const ownSig = hasOwnSignOff(bodyText);
  const sig = signature(c.senderName);
  const sigStart = ownSig ? -1 : bodyText.lastIndexOf(`\n\n${sig[0]}\n`);
  const message = sigStart >= 0 ? bodyText.slice(0, sigStart) : bodyText;
  const name = cleanBusinessName(h.businessName);
  const link = esc(c.claimUrl);
  const heroW = c.step === 1 ? 480 : 300;
  const hero = h.adImageUrl
    ? `<tr><td align="center" style="padding:6px 0 6px;"><a href="${link}" target="_blank" style="text-decoration:none;"><img src="${esc(h.adImageUrl)}" width="${heroW}" alt="${h.onClick ? `Ozzy is ready to draw free ads for ${esc(name)}` : `Your free Facebook ad, made for ${esc(name)}`}" style="display:block;width:100%;max-width:${heroW}px;height:auto;border:3px solid ${K.gold};border-radius:14px;"></a></td></tr>
<tr><td align="center" style="padding:6px 0 14px;font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${K.gold};">&#10022; ${h.onClick ? "tap to watch ozzy draw" : `made for ${esc(name)}`} &#10022;</td></tr>`
    : "";
  const button = `<tr><td align="center" style="padding:4px 0 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" class="ctat"><tr><td bgcolor="${K.gold}" style="border-radius:12px;background-color:${K.gold};box-shadow:0 4px 0 #b8862a;"><a href="${link}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${SANS};font-size:16px;font-weight:700;color:${K.ink};text-decoration:none;border-radius:12px;">${h.onClick ? "Watch Ozzy draw it &rarr;" : c.step === 1 ? "Claim your free ad &rarr;" : "See your ad &rarr;"}</a></td></tr></table></td></tr>`;
  // Paragraphs; the one holding the link becomes: text before it, the hero ad + button, text after it.
  const paras = message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let placed = false;
  const rows: string[] = [];
  const para = (t: string) => `<tr><td style="padding:0 0 14px;font-family:${SANS};font-size:16px;line-height:1.6;color:${K.text};">${esc(t).replace(/\n/g, "<br>")}</td></tr>`;
  for (const p of paras) {
    const i = p.indexOf(c.claimUrl);
    if (i < 0 || placed) {
      rows.push(para(p.split(c.claimUrl).join("").trim()));
      continue;
    }
    placed = true;
    const before = p.slice(0, i).trim().replace(/[:\-–]\s*$/, "").trim();
    const after = p.slice(i + c.claimUrl.length).trim();
    if (before) rows.push(para(before.endsWith(".") || before.endsWith("?") ? before : `${before}:`));
    rows.push(hero, button);
    if (after) rows.push(para(after));
  }
  if (!placed) rows.push(hero, button);
  // Inbox preview = the hook line (the first paragraph without the link), not a generic summary.
  const hook = (paras[0] ?? "").split(c.claimUrl).join("").replace(/[:\s]+$/, "").trim();
  const preheader = hook || (h.onClick ? `Ozzy is ready to draw free ads for ${name}.` : c.step === 1 ? `Ozzy made a Facebook ad for ${name}. It's yours, free.` : `Your free ad for ${name} is still waiting.`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(plain.subject)}</title>
<style>
:root{color-scheme:dark light;supported-color-schemes:dark light;}
a{color:${K.gold};}
@media only screen and (max-width:480px){.pad{padding:22px 18px 26px !important;}.ctat{width:100% !important;}.ctat a{display:block !important;text-align:center;}}
</style>
</head>
<body style="margin:0;padding:0;background-color:${K.bg};color:${K.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${K.bg}" style="background-color:${K.bg};background-image:linear-gradient(180deg,#0c0820 0%,#1d0f42 55%,#3a1a4a 80%,#b8513d 100%);">
<tr><td align="center" style="padding:26px 12px 30px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">
<tr><td align="center" style="padding-bottom:4px;"><img src="${asset}/brand/ozzy-email-wave.gif" width="120" height="120" alt="Ozzy the ad wizard waving" style="display:block;width:120px;height:120px;border:0;"></td></tr>
<tr><td align="center" style="padding-bottom:14px;font-family:${MONO};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${K.gold};">&#10022; ${h.onClick ? "a gift from ozzy" : c.step === 1 ? "a gift from ozzy" : "still yours"} &#10022;</td></tr>
<tr><td class="pad" bgcolor="${K.card}" style="background-color:${K.card};padding:28px 36px 30px;border-radius:18px;border:1px solid ${K.border};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.join("\n")}
${ownSig ? "" : `<tr><td style="padding:6px 0 0;font-family:${SERIF};font-size:18px;font-style:italic;color:${K.text};">${esc(sig[0] ?? "Ozzy")}</td></tr>
<tr><td style="padding:2px 0 0;font-family:${SANS};font-size:13px;color:${K.muted};">${esc(sig[1] ?? "Komendly")} &middot; <a href="https://www.komendly.com" target="_blank" style="color:${K.muted};text-decoration:underline;">komendly.com</a></td></tr>`}
</table>
</td></tr>
<tr><td align="center" style="padding:18px 16px 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${K.faint};">Komendly, ${esc(c.postalAddress)}<br>Not for you? Reply &quot;stop&quot; or <a href="${esc(c.unsubscribeUrl)}" style="color:${K.faint};text-decoration:underline;">unsubscribe</a>.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
