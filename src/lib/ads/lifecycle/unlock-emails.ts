// Emails to people who bought the $9 "Unlock this pack": unlock_thanks (~10 min after paying), then unlock_day3 and
// unlock_day7 if they did not take the Growth Autopilot first month. Plain text from Nolan, fixed copy (never the
// AI copywriter), no tracked links. Pure + no package imports (the engine imports it). Rules: no promised leads, sales
// or results; no fake proof; the guarantee is about OUR work (AUTOPILOT_GUARANTEE_LINE).
import { AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, DIY_STEP_DOWN, HERO_INCLUDES } from "../public-offer";

export const UNLOCK_KINDS = ["unlock_thanks", "unlock_day3", "unlock_day7"] as const;
export type UnlockKind = (typeof UNLOCK_KINDS)[number];
export function isUnlockKind(kind: string): kind is UnlockKind {
  return (UNLOCK_KINDS as readonly string[]).includes(kind);
}

/** Replies go to Nolan's own inbox. */
export const UNLOCK_REPLY_TO = "nolan@prestyj.com";

export interface UnlockEmailInput {
  kind: UnlockKind;
  firstName: string | null;
  brandName: string | null;
  /** Plain link to the unlocked pack (where every ad downloads). */
  packUrl: string;
  /** Same page with the one-time offer card open. */
  offerUrl: string;
  /** Plain link to the plans page. */
  pricingUrl: string;
  unsubscribeUrl: string;
  /** The $97 first month can still be bought (7-day window open, spot free). False = don't mention that price. */
  autopilotOpen: boolean;
  /** The Ad Department first-month price ($97) is still open; false = state only the monthly price. */
  diyFirstMonthOpen: boolean;
}

export interface UnlockEmail {
  subject: string;
  text: string;
}

export function unlockEmail(i: UnlockEmailInput): UnlockEmail {
  const hi = `Hi ${i.firstName?.trim() || "there"},`;
  const brand = i.brandName?.trim() || null;
  const sign = ["", "Nolan", "", "--", `Don't want these emails? Unsubscribe: ${i.unsubscribeUrl}`];
  const ask = `What are you hoping these ads do for ${brand ?? "you"}? Just hit reply, I read every one myself.`;
  const upsell = i.autopilotOpen
    ? [
        `If you'd rather not do it yourself: we can put them live in your own Facebook and Instagram account for you. Growth Autopilot is ${AUTOPILOT_FIRST_MONTH_LINE}, and it is done for you: ${HERO_INCLUDES}. Ad spend is paid by you straight to Meta.`,
        "",
        AUTOPILOT_GUARANTEE_LINE,
        "",
        `Details, no pressure: ${i.offerUrl}`,
      ]
    : [
        "If you'd rather not do it yourself: Growth Autopilot puts your ads live in your own Facebook and Instagram account for you. Reply and I'll tell you how it works. No pressure.",
      ];
  if (i.kind === "unlock_thanks") {
    return {
      subject: brand ? `your ${brand} ads are unlocked` : "your komendly ads are unlocked",
      text: [
        hi,
        "",
        "Thank you for unlocking your pack, it means a lot.",
        "",
        `To download all your ads: open your pack and press "Download all". ${i.packUrl}`,
        "",
        ...upsell,
        "",
        ask,
        ...sign,
      ].join("\n"),
    };
  }
  if (i.kind === "unlock_day3") {
    return {
      subject: brand ? `${brand}: did the ads go live?` : "did your ads go live?",
      text: [
        hi,
        "",
        `Quick check-in: have you put your ${brand ? `${brand} ` : ""}ads live yet? Posting them takes a few minutes, and the in-app guide walks you through it. ${i.packUrl}`,
        "",
        ...upsell,
        "",
        ask,
        ...sign,
      ].join("\n"),
    };
  }
  // unlock_day7: the step-down. Different terms (you post, we make), not a cheaper Autopilot.
  return {
    subject: brand ? `${brand}: a lighter way to keep the ads coming` : "a lighter way to keep the ads coming",
    text: [
      hi,
      "",
      "If the done-for-you plan isn't for you right now, that's fine. There is a lighter option where you stay in control.",
      "",
      `${DIY_STEP_DOWN.name}: ${DIY_STEP_DOWN.terms} ${i.diyFirstMonthOpen ? DIY_STEP_DOWN.priceLine : `${DIY_STEP_DOWN.monthly}/month`}. Cancel anytime online.`,
      "",
      `See it here: ${i.pricingUrl}`,
      "",
      ask,
      ...sign,
    ].join("\n"),
  };
}
