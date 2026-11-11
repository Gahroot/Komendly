// Cold outbound email copy: a strict plain-text template. The AI (Codex) may only write ONE short opener sentence
// about the business; everything else (offer, links, postal address, unsubscribe) is fixed. Any doubt -> fallback opener.

export interface OutboundCopyContext {
  step: 1 | 2;
  businessName: string;
  city: string;
  niche: string;
  senderName: string;
  /** Hosted on our domain (token-checked image route). */
  adImageUrl: string;
  claimUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
  /** Optional AI opener (validated by checkOpener). */
  opener?: string | null;
}

export interface OutboundEmail {
  subject: string;
  text: string;
}

export const MAX_OPENER = 160;
const BANNED = /\b(guarantee|guaranteed|results|roi|revenue|leads? (?:will|guaranteed)|customer of ours|we work with|partner|award|#1|best in|free forever|limited time|act now|urgent|last chance|congratulations|winner|100%)\b|%|\$|!{2,}|https?:|www\.|@/i;

/** Validate an AI opener: one short sentence, no claims/urgency/links, mentions nothing we can't know. Returns error or null. */
export function checkOpener(opener: string, businessName: string): string | null {
  const o = opener.trim();
  if (o.length < 20 || o.length > MAX_OPENER) return "length";
  if (BANNED.test(o)) return "banned phrase";
  if ((o.match(/[.?]/g) ?? []).length > 1) return "more than one sentence";
  if (/\b(I saw your|your reviews|your rating|stars?)\b/i.test(o) && !o.includes(businessName)) return "unverifiable";
  if (/[<>{}]/.test(o)) return "markup";
  return null;
}

function nicheWord(niche: string): string {
  return niche.trim().toLowerCase().replace(/s$/, "") || "local business";
}

export function outboundSubject(c: Pick<OutboundCopyContext, "step" | "businessName">): string {
  return (c.step === 1 ? `made an ad for ${c.businessName}` : `re: made an ad for ${c.businessName}`).slice(0, 78);
}

/** The whole email: ~60-90 words of body + links + honest footer (postal address, one-line unsubscribe). */
export function buildOutboundEmail(c: OutboundCopyContext): OutboundEmail {
  const first = c.senderName.split(/\s+/)[0] ?? c.senderName;
  const opener = c.opener && !checkOpener(c.opener, c.businessName) ? c.opener.trim() : `I came across ${c.businessName} while looking at ${nicheWord(c.niche)} websites in ${c.city}.`;
  const body =
    c.step === 1
      ? [
          "Hi there,",
          "",
          `${opener} I run Komendly, a small tool that turns a business's own website into Facebook and Instagram ads, so I made one for you from your site. No catch, it's yours to use.`,
          "",
          `Here's the ad: ${c.adImageUrl}`,
          "",
          `If you like it, you can grab it plus a few more made the same way, free: ${c.claimUrl}`,
          "",
          "If it's not useful, no worries at all.",
        ]
      : [
          "Hi again,",
          "",
          `Just making sure the ad I made for ${c.businessName} didn't get buried. It's still there for you, free, along with a few more if you want them: ${c.claimUrl}`,
          "",
          "I won't follow up after this one.",
        ];
  const text = [
    ...body,
    "",
    first,
    `${c.senderName}, Komendly`,
    "",
    "--",
    c.postalAddress,
    `Don't want emails like this? Unsubscribe: ${c.unsubscribeUrl}`,
  ].join("\n");
  return { subject: outboundSubject(c), text };
}

/** Body words above the "--" footer, for the 60-90 word rule. */
export function bodyWordCount(text: string): number {
  const body = text.split("\n--\n")[0] ?? text;
  return body.replace(/https?:\/\/\S+/g, "").split(/\s+/).filter((w) => /\w/.test(w)).length;
}

/** Final compliance gate before any send (also on fallback copy). Returns an error string or null. */
export function checkOutboundEmail(e: OutboundEmail, c: OutboundCopyContext): string | null {
  if (!c.postalAddress.trim()) return "missing postal address";
  if (!e.text.includes(c.postalAddress)) return "postal address not in body";
  if (!e.text.includes(c.unsubscribeUrl)) return "unsubscribe link not in body";
  if (!e.text.includes(c.claimUrl)) return "claim link not in body";
  if (c.step === 1 && !e.text.includes(c.adImageUrl)) return "ad link not in body";
  if (!e.text.includes(c.senderName)) return "sender name not in body";
  const words = bodyWordCount(e.text);
  if (c.step === 1 && (words < 50 || words > 110)) return `body ${words} words`;
  if (/re:/i.test(e.subject) && c.step === 1) return "fake reply subject";
  return null;
}

/** RFC 8058 one-click unsubscribe + mailto fallback. */
export function unsubscribeHeaders(unsubscribeUrl: string, mailbox: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${mailbox}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export const OPENER_SYSTEM = [
  "You write ONE short, plain, friendly opening sentence for a cold email from a small software founder to a local business.",
  "Rules: one sentence, 8-25 words, no greeting, no links, no numbers, no prices, no compliments you can't verify, no claims about results,",
  "no urgency, no exclamation marks, never say we worked with them or know them. Only mention facts given to you (name, city, trade, what their site says).",
].join(" ");

export function openerPrompt(c: { businessName: string; city: string; niche: string; siteSummary: string }): string {
  return `Business: ${c.businessName}\nCity: ${c.city}\nTrade: ${c.niche}\nWhat their website says (may be empty): ${c.siteSummary.slice(0, 600)}\n\nReturn JSON {"opener": "..."} with the sentence. It is followed by: "I run Komendly ... so I made one for you from your site."`;
}
