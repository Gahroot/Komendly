import { AUTOPILOT_GUARANTEE_LINE } from "./public-offer";
// Page copy for the public offer, written as the buyer's dream (Hormozi value equation): outcome, likelihood, time, effort.
// Facts (prices, free-ad count, founding spots) stay in public-offer.ts / billing-config.ts. Pure: client-safe.
// Hard rules: never promise a number of leads, sales or revenue; no invented results or proof; never say publishing is
// one tap (Meta is connected WITH the owner).
export const DREAM_HEADLINE = "A steady flow of customers asking for quotes, without you running Facebook ads";
export const DREAM_HEADLINE_EM = "customers asking for quotes";
export const DREAM_SUB = "For roofers, plumbers, HVAC pros, landscapers, cleaners, dentists and other local businesses. We run your Facebook and Instagram ads for you, and every lead lands in your inbox within minutes. You set one budget and read one email a week.";
/** One line of plain-language process (Likelihood). */
export const DREAM_PROCESS = "How: we read your website, make ads from your own logo, colors and services, set up Facebook with you, then every day we pause ads that waste money and every week we add fresh ones.";

/** Every item answers a worry a local owner really has. */
export const OBJECTION_STACK: readonly { worry: string; answer: string }[] = [
  { worry: "Worried you can't run ads?", answer: "We run them. Your ads go out on Facebook and Instagram without you touching Ads Manager." },
  { worry: "Worried Facebook is complicated?", answer: "We connect it with you, step by step, when you join. You don't set up anything alone." },
  { worry: "Worried about wasting money?", answer: "Ads that waste money get paused daily, and you set a hard monthly limit that spend never goes over. You pay Meta directly." },
  { worry: "Worried the ads will look generic?", answer: "Every ad is made from your own website, logo and colors. You see 10 of them free, before you pay anything." },
  { worry: "Worried about leads getting lost?", answer: "Every inquiry is emailed to you within minutes, so you can call back while they're still thinking about it." },
  { worry: "Worried it'll go stale?", answer: "Fresh ads are added every week, so you don't have to remember to refresh anything." },
  { worry: "Worried about the time?", answer: "Ads are ready in minutes. Going live takes a short setup together, then you read one email a week." },
  { worry: "Worried about being stuck?", answer: "Cancel anytime online, and the first 30 days come with a full refund." },
];
