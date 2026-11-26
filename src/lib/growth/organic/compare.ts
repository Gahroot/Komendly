// Competitor comparison + alternatives data (/compare/komendly-vs-<slug>, /alternatives/<slug>-alternatives).
// HONESTY RULES: every competitor fact below was read on the vendor's own public page on VERIFIED_ON and carries that
// page as its source. Nothing is inferred, no ratings, no "worse than". Prices change; pages say so. Re-verify before
// editing a fact, and bump VERIFIED_ON. Competitors whose pages could not be read (Canva, Pencil) are deliberately absent.
import { PUBLIC_OFFER } from "../../ads/public-offer";

export const VERIFIED_ON = "2026-11-26";
export interface CompetitorFact { text: string; source: string }
export interface Competitor {
  slug: string; name: string; site: string;
  /** What it is, in the vendor's own positioning, neutrally worded. */
  summary: string;
  facts: CompetitorFact[];
  /** Honest cases where the competitor is the better fit. */
  chooseThemWhen: string[];
  chooseUsWhen: string[];
}

export const COMPETITORS: readonly Competitor[] = [
  { slug: "creatopy", name: "Creatopy", site: "https://www.creatopy.com/",
    summary: "A design-and-production platform for ads: an ad studio with templates, AI generation, resizing and publishing to ad networks.",
    facts: [
      { text: "Pro plan listed at $39 a month billed monthly, for one seat; includes an Ad Studio and Canvas with 5,000+ templates and 5 Brand Kits.", source: "https://www.creatopy.com/pricing/" },
      { text: "Ultra plan listed at $99 a month billed monthly; adds ad serving to 25+ networks, publishing to Meta and Google Ads, AI translate and automated A/B testing.", source: "https://www.creatopy.com/pricing/" },
      { text: "Team plan listed at $59 per seat a month billed monthly, for 2 to 10 people.", source: "https://www.creatopy.com/pricing/" },
      { text: "Paid plans show a 7-day free trial with no card required.", source: "https://www.creatopy.com/pricing/" },
    ],
    chooseThemWhen: ["You are a designer or agency that wants hands-on control of every ad and many output formats (HTML5, GIF, MP4).", "You need ad serving across many networks, or a team workspace with roles."],
    chooseUsWhen: ["You are a local business owner who would rather paste a website and get finished ads than operate a design tool.", "You want ads made from your own site's brand, photos and offers without learning an editor."] },
  { slug: "madgicx", name: "Madgicx", site: "https://madgicx.com/",
    summary: "A Meta-ads optimisation and analytics platform with AI features, priced by your monthly ad spend.",
    facts: [
      { text: "Madgicx Pro Complete is priced by monthly ad spend: from $45 a month (spend under $1K, billed monthly) to $99 a month ($1K to $2.5K); higher tiers go up to $329 a month for $20K to $30K spend, and above $30K the price is shown inside the app.", source: "https://madgicx.com/pricing" },
      { text: "Quarterly and annual billing lower the monthly price shown.", source: "https://madgicx.com/pricing" },
      { text: "Tracking Pro, a server-to-server tracking add-on, is listed at $49 a month.", source: "https://madgicx.com/pricing" },
      { text: "A 7-day free trial is offered.", source: "https://madgicx.com/pricing" },
    ],
    chooseThemWhen: ["You already run Meta campaigns with real spend and want automation, analytics and attribution on top.", "You run an ecommerce store and need tracking and reporting more than new creative."],
    chooseUsWhen: ["Your bottleneck is having good ads to run in the first place.", "You have a small budget and want a free first pack of ads before paying for an optimisation tool."] },
  { slug: "predis-ai", name: "Predis.ai", site: "https://predis.ai/",
    summary: "An AI tool for social posts, video and ad creatives, with scheduling and publishing, sold on credits.",
    facts: [
      { text: "Advertises making ads, videos and UGC \"for less than $1/day\" and a 3-day free trial; you are not charged until the trial ends.", source: "https://predis.ai/pricing/" },
      { text: "Plans are credit-based; one higher plan lists 10,000 credits a month, described as about 2,500 images or 250 videos.", source: "https://predis.ai/pricing/" },
      { text: "Can publish to Facebook, Instagram, LinkedIn, TikTok, Pinterest, Google Business Profile and X.", source: "https://predis.ai/pricing/" },
      { text: "Its pricing page showed a Black Friday offer of 50% off annual plans on the verified date; promotions end, so check the page.", source: "https://predis.ai/pricing/" },
    ],
    chooseThemWhen: ["You want one tool for a steady stream of social posts, carousels and short videos, with scheduling built in.", "You are comfortable managing a credit budget across content types."],
    chooseUsWhen: ["You want a ready pack of ads for Facebook and Instagram made from your own website, not a content calendar.", "You prefer a free first pack of ads (" + PUBLIC_OFFER.freeAds + " ads, no card) to a timed trial."] },
  { slug: "adcreative-ai", name: "AdCreative.ai", site: "https://www.adcreative.ai/",
    summary: "An AI ad-creative platform covering image ads, video ads, ad copy, A/B testing and creative insights.",
    facts: [
      { text: "Lists generating ad creatives, ad copy, UGC-style and product videos, social posts and buyer personas.", source: "https://www.adcreative.ai/" },
      { text: "Lists creative insights and competitor insights, and offers a \"Try For Free\" call to action.", source: "https://www.adcreative.ai/" },
      { text: "States it has been used by 4.2M+ businesses and is trained on $35B+ of ad spend data (the vendor's own claims, not verified by us).", source: "https://www.adcreative.ai/" },
      { text: "Its home page did not show plan prices when we checked; see the vendor's site for current pricing.", source: "https://www.adcreative.ai/" },
    ],
    chooseThemWhen: ["You are an ecommerce brand or agency that wants many creative variations plus performance insights and fashion or product shoots.", "You want video and UGC-style generation inside the same tool as image ads."],
    chooseUsWhen: ["You are a local service or small business that wants finished Facebook and Instagram ads from a website link with no setup.", "You want to see real ads before choosing any plan."] },
];
export const getCompetitor = (slug: string) => COMPETITORS.find((c) => c.slug === slug);
export const comparePath = (c: Pick<Competitor, "slug">) => `/compare/komendly-vs-${c.slug}`;
export const alternativesPath = (c: Pick<Competitor, "slug">) => `/alternatives/${c.slug}-alternatives`;
export const slugFromParam = (param: string, kind: "compare" | "alternatives") => param.replace(kind === "compare" ? /^komendly-vs-/ : /-alternatives$/, "");

export function komendlyFacts(): string[] {
  return [
    `Paste your website and get ${PUBLIC_OFFER.freeAds} free ads for Facebook and Instagram, no card required.`,
    `${PUBLIC_OFFER.diyName} is the do-it-yourself plan at ${PUBLIC_OFFER.diyPrice} a month (${PUBLIC_OFFER.diyFirstMonth} for the first month if bought inside the launch window): fresh ads every week and a coach; you post them yourself.`,
    `${PUBLIC_OFFER.heroName} (${PUBLIC_OFFER.heroPlanName}) is the done-for-you plan at ${PUBLIC_OFFER.heroPrice} a month founding price, ${PUBLIC_OFFER.foundingSpots} founding spots, regular ${PUBLIC_OFFER.heroRegularPrice}.`,
  ];
}
