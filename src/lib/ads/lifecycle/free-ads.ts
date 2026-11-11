// "Ways to get more free ads" block: referral (Give 10, get 10), gift a pack, partner program. Pure; used as a
// footer section in lifecycle emails (engine) and as a card on the billing success page (web).
import { REFERRAL_FACTS } from "./facts";

export interface LinkItem {
  text: string;
  linkLabel: string;
  /** App-relative path ("/ads/gifts") or absolute URL on the app origin. */
  href: string;
}

export interface LinkBlock {
  title: string;
  items: LinkItem[];
}

export function freeAdsBlock(input: { referralCode: string | null; paid: boolean }): LinkBlock {
  const items: LinkItem[] = [];
  if (input.referralCode) {
    items.push({ text: `Give 10, get 10: friends who sign up with your link get ${REFERRAL_FACTS.referredTrial} free ads instead of 10, and you get ${REFERRAL_FACTS.reward} credits when their ads are ready.`, linkLabel: "Your invite link", href: `/r/${input.referralCode}` });
  }
  items.push({ text: `Gift a pack: paste another business's website and Ozzy makes them 3 free ads from you (${input.paid ? "1 a month on paid plans, 4 on Agency" : "1 free gift on the trial"}).`, linkLabel: "Send a gift", href: "/ads/gifts" });
  items.push({ text: "Partner program: earn 30% of what the businesses you refer pay, for 12 months.", linkLabel: "Become a partner", href: "/partners" });
  return { title: "Ways to get more free ads", items };
}
