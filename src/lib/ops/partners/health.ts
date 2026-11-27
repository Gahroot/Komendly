// Partner health + templated outreach (pure). Activation email once per partner; thank-you at most every 90 days.
export type HealthInput = {
  id: string; name: string; status: string; approvedAt: Date | null;
  referralsTotal: number; lastReferralAt: Date | null; payingCustomers: number; commissionCents: number;
  activationSentAt: Date | null; thanksSentAt: Date | null;
};
export type Health = "inactive" | "activation_needed" | "activation_sent" | "stalled" | "top" | "healthy";
const DAY = 86_400_000;
export const ACTIVATION_AFTER_DAYS = 14, STALLED_AFTER_DAYS = 45, THANKS_EVERY_DAYS = 90;

export function classifyPartner(p: HealthInput, now: Date, topIds: ReadonlySet<string> = new Set()): Health {
  if (p.status !== "approved" || !p.approvedAt) return "inactive";
  if (p.referralsTotal === 0) {
    if (now.getTime() - p.approvedAt.getTime() < ACTIVATION_AFTER_DAYS * DAY) return "healthy";
    return p.activationSentAt ? "activation_sent" : "activation_needed";
  }
  if (topIds.has(p.id) && p.payingCustomers > 0) return "top";
  if (p.lastReferralAt && now.getTime() - p.lastReferralAt.getTime() > STALLED_AFTER_DAYS * DAY) return "stalled";
  return "healthy";
}

/** Top performers = up to 3 partners with at least one paying customer, ranked by commission. */
export function topPerformers(ps: readonly HealthInput[]): Set<string> {
  return new Set(ps.filter((p) => p.payingCustomers > 0).sort((a, b) => b.commissionCents - a.commissionCents).slice(0, 3).map((p) => p.id));
}
export const thanksDue = (p: HealthInput, now: Date) => !p.thanksSentAt || now.getTime() - p.thanksSentAt.getTime() > THANKS_EVERY_DAYS * DAY;

export type Mail = { subject: string; text: string };
const first = (n: string) => n.trim().split(/\s+/)[0] || "there";

export function activationEmail(name: string, link: string, assetsUrl: string): Mail {
  return {
    subject: "Your Komendly partner link is ready",
    text: `Hi ${first(name)},\n\nYou're set up as a Komendly partner but we haven't seen a referral yet. Here is everything you need:\n\nYour link: ${link}\nAssets (images, copy, demo packs): ${assetsUrl}\n\nThe simplest start: make a free demo pack for one client from your partner page and send them the link. Reply to this email if anything is unclear.\n\nNolan`,
  };
}
export function thankYouEmail(name: string, payingCustomers: number): Mail {
  return {
    subject: "Thank you for sending customers to Komendly",
    text: `Hi ${first(name)},\n\nYour referrals have ${payingCustomers} paying customer${payingCustomers === 1 ? "" : "s"} so far. Thank you, it means a lot to a small team. If there's anything that would make it easier to refer more (assets, a demo pack, a question), reply and I'll sort it.\n\nNolan`,
  };
}

/** Partner support routed onto the EXISTING auto-responder categories (src/lib/ads/auto-reply.ts). Payout/commission
 *  questions are billing = human (the owner approves money); link/how-to questions are answered automatically. */
export type PartnerTopic = "payout" | "terms" | "link" | "other";
export function partnerSupportRoute(text: string): { topic: PartnerTopic; category: "billing" | "how_to" | "other"; auto: boolean } {
  const t = text.toLowerCase();
  if (/\b(payout|paid|payment|commission|owed|statement|invoice)\b/.test(t)) return { topic: "payout", category: "billing", auto: false };
  if (/\b(link|asset|logo|banner|code|referral url|demo)\b/.test(t)) return { topic: "link", category: "how_to", auto: true };
  if (/\b(terms|percent|%|how long|months|cookie|attribution)\b/.test(t)) return { topic: "terms", category: "how_to", auto: true };
  return { topic: "other", category: "other", auto: false };
}
