// Expansion + referrals (system `expansion`): three data-triggered offers, each with a genuine reason.
// first_download -> referral (two-sided: friend gets REFERRAL_FACTS.referredTrial free ads, you get credits when their pack finishes);
// multi_brand    -> "adding another brand" ONLY when the workspace actually has 2+ distinct brand sites;
// diy_to_autopilot -> Growth Autopilot, ONLY for DIY customers who keep downloading new ads.
// First-win / first-lead / day-14 results already carry a referral line (growth/proof.ts), so those moments are not repeated here.
// Frequency: one expansion email per 30 days, max 3 per user, plus the global caps.
import { REFERRAL_FACTS } from "../ads/lifecycle/facts";
import { HERO_PRICE_LINE } from "../ads/public-offer";
import { withSystemUtm } from "../growth/systems";
import { capBlocks, compose, DAY, suppressedBy, type Note, type SendRecord, type Suppression } from "./core";

export const EXPANSION_SYSTEM = "expansion" as const;
export const EXPANSION_KINDS = ["referral_first_download", "multi_brand", "diy_to_autopilot"] as const;
export type ExpansionKind = (typeof EXPANSION_KINDS)[number];
export const EXPANSION_CAPS = { gapDays: 30, maxTotal: 3, diyMinDownloads14d: 2, diyMinAgeDays: 14, multiBrandMin: 2 } as const;

export interface ExpansionInput {
  firstName: string | null;
  plan: string; // adsPlan
  active: boolean; // paying
  firstDownloadAt: Date | null;
  downloads14d: number;
  distinctBrandDomains: number;
  paidSince: Date | null;
  referralUrl: string | null;
  suppression: Suppression;
  sends: SendRecord[];
  expansionSent: Array<{ kind: ExpansionKind; at: Date }>;
  appUrl: string;
  unsubscribeUrl: string;
}

export function expansionDue(i: ExpansionInput, now: Date): ExpansionKind | null {
  if (suppressedBy(i.suppression, { ignorePaid: true })) return null;
  if (i.expansionSent.length >= EXPANSION_CAPS.maxTotal) return null;
  const last = Math.max(0, ...i.expansionSent.map((s) => s.at.getTime()));
  if (last && now.getTime() - last < EXPANSION_CAPS.gapDays * DAY) return null;
  if (capBlocks(i.sends, now)) return null;
  const done = new Set(i.expansionSent.map((s) => s.kind));
  const t = now.getTime();
  // Multi-brand: a paying DIY/Autopilot workspace that really has 2+ brand sites.
  if (i.active && i.distinctBrandDomains >= EXPANSION_CAPS.multiBrandMin && !done.has("multi_brand")) return "multi_brand";
  // DIY -> Autopilot: DIY customer, 14+ days in, keeps downloading new ads.
  if (i.active && i.plan === "ad_department" && i.paidSince && t - i.paidSince.getTime() >= EXPANSION_CAPS.diyMinAgeDays * DAY && i.downloads14d >= EXPANSION_CAPS.diyMinDownloads14d && !done.has("diy_to_autopilot")) return "diy_to_autopilot";
  // Referral at the first-download happy moment (within 3 days of it), when a referral link exists.
  if (i.referralUrl && i.firstDownloadAt && t - i.firstDownloadAt.getTime() >= 2 * 3_600_000 && t - i.firstDownloadAt.getTime() < 3 * DAY && !done.has("referral_first_download")) return "referral_first_download";
  return null;
}

export function expansionNote(kind: ExpansionKind, i: ExpansionInput): Note {
  const u = (p: string) => withSystemUtm(`${i.appUrl}${p}`, EXPANSION_SYSTEM, { campaign: kind, medium: "email", content: "cta" });
  const base = { firstName: i.firstName, unsubscribeUrl: i.unsubscribeUrl };
  switch (kind) {
    case "referral_first_download":
      return { subject: "know another business owner who'd want free ads?", text: compose({ ...base, paragraphs: [`Glad you grabbed your ads. If you know another local business owner who'd like some, send them your link: they get ${REFERRAL_FACTS.referredTrial} free ads, and when their free pack finishes you get ${REFERRAL_FACTS.reward} credits.`, `Your link: ${i.referralUrl}`], question: "Is there someone who comes to mind?" }) };
    case "multi_brand":
      return { subject: "I see you have more than one site", text: compose({ ...base, paragraphs: [`I noticed you've made ads for ${i.distinctBrandDomains} different websites in your account. If they're separate businesses or client brands, I can set up the right plan for running them side by side.`, "I'd rather quote you exactly than guess, so tell me how many and I'll come back with the real price."], link: { label: "Your brands", url: u("/ads/brands") }, question: "How many brands or sites do you want ads for?" }) };
    case "diy_to_autopilot":
      return { subject: "you keep making ads, want us to run them?", text: compose({ ...base, paragraphs: [`You've been downloading new ads regularly, so you're clearly putting them to use. The part that takes your time is launching and checking them in Meta.`, `The Growth Autopilot does that for you in your own Meta account: ${HERO_PRICE_LINE}. Ad spend is paid directly to Meta. No promises on leads or sales, they depend on your offer and market.`], link: { label: "See how it works", url: u("/ads/team") }, question: "Would handing the launching and checking over save you real time?" }) };
  }
}
