// Audience landing pages (/for/<slug>) for agencies, freelancers and distribution partners. One data file drives the
// pages, the sitemap and llms.txt. Pure (no Next/Prisma). Honest by rule: no testimonials, results or promised leads/sales.
import { getPlan } from "@/lib/ads/billing-config";
import { FREE_TRIAL_ADS } from "@/lib/ads/bonus-access";
import { PARTNER_TERMS } from "@/lib/ads/partner";

export const AUDIENCE_BASE = "/for";

export type AudienceAngle = "multi-brand" | "client-pack" | "white-label" | "partner";

export interface Audience {
  slug: string;
  /** Plural label used in nav/llms ("Marketing agencies"). */
  name: string;
  /** Page <title> (never append the site name; the root template does). */
  title: string;
  description: string;
  /** H1. */
  headline: string;
  intro: string;
  angle: AudienceAngle;
  /** 3 concrete things they can do. */
  uses: { title: string; line: string }[];
  /** What to try first, 3 steps. */
  steps: { title: string; line: string }[];
  faq: { q: string; a: string }[];
}

const AGENCY_PRICE = `$${(getPlan("agency")?.priceCents ?? 49700) / 100}`;
export const FREE_LINE = `Your first ${FREE_TRIAL_ADS} ads are free, no card.`;

const COMMON_FAQ = {
  results: { q: "Will this get my clients leads or sales?", a: "We can't promise that, and neither should you. Komendly makes the ads fast; results depend on the offer, the budget and the market. It makes Facebook and Instagram (Meta) ads only." },
  adSpend: { q: "Who pays for ad spend?", a: "The client does, directly to Meta. Ad spend never goes through Komendly." },
};

const agencyPlan = `The Agency plan is ${AGENCY_PRICE}/month: it covers your client brands, includes weekly fresh ads and 4 gift packs a month to pitch new clients.`;
const markLine = "On a paid workspace the \"Made with Komendly\" mark is off by default, so client files go out without it. (There is no custom-logo or full white-label option yet.)";
const partnerLine = `The partner program is separate and by application: ${PARTNER_TERMS.commissionPct}% of what referred clients pay for ${PARTNER_TERMS.commissionMonths} months, paid after the ${PARTNER_TERMS.refundWindowDays}-day refund window.`;

export const AUDIENCES: Audience[] = [
  {
    slug: "agencies",
    name: "Marketing agencies",
    title: "Client ad creative from a website, for marketing agencies",
    description: `Point Komendly at any client's website and get a pack of ready-to-run Facebook and Instagram ads. ${FREE_LINE}`,
    headline: "A first set of ads for every client, before the kickoff call ends",
    intro: "Komendly reads a client's website and writes and designs a pack of Meta ads from it. Use it to cut the first-draft time on creative, not to replace your strategy.",
    angle: "multi-brand",
    uses: [
      { title: "One workspace, many brands", line: `${agencyPlan}` },
      { title: "A pack per client", line: "Paste each client's site and get ads in their colours, with headlines drawn from their own copy and reviews." },
      { title: "Pitch with a real sample", line: "Make a pack from a prospect's website before the call and show them their own ads." },
    ],
    steps: [
      { title: "Try it on your own site", line: "Paste your agency's URL into the free pack to see the output." },
      { title: "Run one live client", line: "Make a pack for a current client and review it like you would a junior's draft." },
      { title: "Move clients in", line: "Upgrade to a plan with client brands once it saves you time." },
    ],
    faq: [
      { q: "Can I use it for several clients?", a: agencyPlan },
      { q: "Do client files carry your branding?", a: markLine },
      COMMON_FAQ.results,
      COMMON_FAQ.adSpend,
    ],
  },
  {
    slug: "web-designers",
    name: "Web designers",
    title: "Facebook and Instagram ads for the sites you build",
    description: `Launched a client's site? Turn it into ready-to-run Meta ads in minutes, and add it to your site or theirs. ${FREE_LINE}`,
    headline: "The site is live. Now hand your client ads that match it",
    intro: "Clients often ask what comes after launch. Komendly reads the site you built and makes ads in the same look and voice, so the follow-up offer is concrete.",
    angle: "client-pack",
    uses: [
      { title: "A launch-day ad pack", line: "Make a pack from the finished site and send it with the handover email." },
      { title: "A widget on your own site", line: "Add the \"Make ads from your website\" box to your site or a client's; visitors land on the free pack. See /developers/embed." },
      { title: "Earn if they subscribe", line: `${partnerLine}` },
    ],
    steps: [
      { title: "Run it on a recent project", line: "Paste a live client site and judge the ads against the brand." },
      { title: "Share the result", line: "Send the client the ads as a next-step suggestion." },
      { title: "Optionally apply as a partner", line: "Get a referral link and free demo packs." },
    ],
    faq: [{ q: "Is there a white-label version?", a: markLine }, { q: "How does the partner program work?", a: partnerLine }, COMMON_FAQ.results],
  },
  {
    slug: "media-buyers",
    name: "Freelance media buyers",
    title: "More ad creative to test for freelance media buyers",
    description: `Generate a pack of Meta ad variations from a client's website to test against what you already run. ${FREE_LINE}`,
    headline: "Creative to test, without waiting on the client's designer",
    intro: "Meta rewards fresh creative. Komendly gives you a pack of varied angles per client site, so you can start testing while you wait for their assets.",
    angle: "client-pack",
    uses: [
      { title: "Variations per angle", line: "Packs mix problem-aware and solution-aware hooks so you can test angles, not just colours." },
      { title: "Run from your terminal or assistant", line: "The komendly CLI and MCP server make packs from scripts or Claude/ChatGPT (see /agents)." },
      { title: "Publish to the client's Meta account", line: "Paid plans can publish through the client's own connected Meta account." },
    ],
    steps: [
      { title: "Make a pack from a client site", line: "Use the free pack." },
      { title: "Put 2-3 ads into a test", line: "Treat them as hypotheses, as you would any creative." },
      { title: "Keep the ones that win", line: "Komendly doesn't measure results for you; your Ads Manager does." },
    ],
    faq: [COMMON_FAQ.results, COMMON_FAQ.adSpend, { q: "Does it work for Google or TikTok?", a: "No, Meta (Facebook and Instagram) only." }],
  },
  {
    slug: "social-media-managers",
    name: "Social media managers",
    title: "Ad creative for the clients you post for",
    description: `Add paid creative to your social media retainers: ads made from each client's website in minutes. ${FREE_LINE}`,
    headline: "Offer paid-social creative without learning design tools",
    intro: "If your clients ask about ads, Komendly makes the creative from their website so you can add it to your retainer.",
    angle: "multi-brand",
    uses: [
      { title: "One workspace for your clients", line: agencyPlan },
      { title: "Fresh ads each week", line: "Paid plans can make new ads from the client's website on a weekly schedule." },
      { title: "Show before you sell", line: "Gift packs let you send a prospect their own ads first." },
    ],
    steps: [
      { title: "Try one client", line: "Paste their site into the free pack." },
      { title: "Show them the ads", line: "Use them as the basis of an ads add-on." },
      { title: "Decide on a plan", line: "Choose a plan based on how many brands you run." },
    ],
    faq: [{ q: "Does it write organic posts?", a: "No. It makes Facebook and Instagram ads." }, COMMON_FAQ.results, COMMON_FAQ.adSpend],
  },
  {
    slug: "seo-agencies",
    name: "SEO agencies",
    title: "Paid-social creative for SEO agencies' clients",
    description: `Give SEO clients a paid channel while rankings build: ads made from their site. ${FREE_LINE}`,
    headline: "Rankings take months. Ads from the same site take minutes",
    intro: "Komendly reads the pages you already optimised and turns them into Meta ads, so you can offer a second channel without a creative team.",
    angle: "multi-brand",
    uses: [
      { title: "Reuse the site's own copy", line: "Ads are written from the client's real pages and reviews, not generic templates." },
      { title: "Multi-brand workspace", line: agencyPlan },
      { title: "A prospecting sample", line: "Make a sample pack from a prospect's site before your audit call." },
    ],
    steps: [
      { title: "Pick a client with a good site", line: "Paste the URL into the free pack." },
      { title: "Review with the client", line: "Pick the ads they like." },
      { title: "Scale to your roster", line: "Move to a client-brand plan when it fits." },
    ],
    faq: [COMMON_FAQ.results, { q: "Does it help SEO?", a: "No. It makes paid social ads, not search content." }, COMMON_FAQ.adSpend],
  },
  {
    slug: "shopify-agencies",
    name: "Shopify agencies",
    title: "Ad creatives from any Shopify store, for agencies",
    description: `Turn a client's Shopify storefront or a single product into Meta ads. ${FREE_LINE}`,
    headline: "Product pages in, Meta ads out",
    intro: "Komendly reads a store's products, photos and prices and makes ads around them. Works on the public storefront today; a Shopify app is in review.",
    angle: "multi-brand",
    uses: [
      { title: "Storefront to pack", line: "Paste the store URL; the pack uses its real products and brand colours." },
      { title: "Launch-ready creative", line: "Hand over ads with the store build. Password-protected stores need the Shopify app (in review)." },
      { title: "Several stores, one plan", line: agencyPlan },
    ],
    steps: [
      { title: "Try a live store", line: "Paste a client store URL." },
      { title: "Compare with their current ads", line: "Judge the creative yourself." },
      { title: "Add it to your launch checklist", line: "Offer it as a post-build add-on." },
    ],
    faq: [{ q: "Is there a Shopify app?", a: "It's in review for the Shopify App Store; the free pack works from a public store URL today." }, COMMON_FAQ.results, COMMON_FAQ.adSpend],
  },
  {
    slug: "branding-agencies",
    name: "Branding agencies",
    title: "Brand-faithful ad creative from a client's website",
    description: `Extend a brand into Meta ads: Komendly picks up a site's colours, logo and voice. ${FREE_LINE}`,
    headline: "Carry the brand you built into the ads",
    intro: "Brand work often stops at guidelines. Komendly reads the finished site and makes ads that follow its look, as a starting point your team can review.",
    angle: "client-pack",
    uses: [
      { title: "Follows the site's brand", line: "Colours, logo and tone come from the client's website." },
      { title: "A rollout add-on", line: "Offer ready-to-run Meta ads alongside the identity project." },
      { title: "Exports without our mark", line: markLine },
    ],
    steps: [
      { title: "Run a finished brand", line: "Paste the live site." },
      { title: "Check fidelity", line: "Your art director decides if it's on brand." },
      { title: "Decide where it fits", line: "Use it for fast rollouts, not flagship campaigns." },
    ],
    faq: [{ q: "Will it match our guidelines?", a: "It reads the website, not a guidelines PDF, so review every ad." }, COMMON_FAQ.results],
  },
  {
    slug: "coaches",
    name: "Business coaches and consultants",
    title: "Ads for your own offer, and a tool to hand your clients",
    description: `Make Meta ads for your coaching offer from your site, and recommend a simple ad tool to clients. ${FREE_LINE}`,
    headline: "Ads for your offer, and an ad tool to point clients to",
    intro: "Coaches tell clients to \"run ads\" and then watch them stall at the creative. Komendly gets a client from website to first ads in minutes.",
    angle: "partner",
    uses: [
      { title: "Ads for your own site", line: "Try it on your own offer first." },
      { title: "Give clients a first step", line: "Send the free-pack link in your onboarding." },
      { title: "Partner link", line: partnerLine },
    ],
    steps: [
      { title: "Try it on your site", line: "Free pack, no card." },
      { title: "Recommend it only if it's good", line: "Judge the output yourself." },
      { title: "Apply for the partner program", line: "Optional; by application." },
    ],
    faq: [{ q: "Do I have to disclose a referral link?", a: "Yes. Tell your audience when you earn from a link; in many places it's a legal requirement." }, COMMON_FAQ.results],
  },
  {
    slug: "educators",
    name: "Marketing educators and course creators",
    title: "A hands-on ad creative exercise for your students",
    description: `Give students a real website-to-ads exercise, free. ${FREE_LINE}`,
    headline: "Let students make a real ad pack in a lesson",
    intro: "Teaching Meta ads is easier when students have creative to work with. Komendly makes a pack from any public website, so every student can practise on a real business.",
    angle: "partner",
    uses: [
      { title: "A practical assignment", line: "Each student pastes a local business's site and critiques the ads." },
      { title: "Use it from the CLI or MCP", line: "Developers and technical students can call it from scripts (see /agents)." },
      { title: "Partner link", line: partnerLine },
    ],
    steps: [
      { title: "Run the exercise yourself", line: "Know what the output looks like." },
      { title: "Set the assignment", line: "Students critique, not just generate." },
      { title: "Tell us what you teach", line: "Apply for partner details if you'd like a link." },
    ],
    faq: [{ q: "Is there an education discount?", a: "Not currently. The free pack is the classroom option." }, COMMON_FAQ.results],
  },
  {
    slug: "franchises",
    name: "Franchises and multi-location brands",
    title: "Ad creatives for franchisors and multi-location brands",
    description: `One brand, many locations: make ad packs from each location's page. ${FREE_LINE}`,
    headline: "Local ads for every location, in the brand's look",
    intro: "Franchisors need creative that stays on brand but speaks to each location. Komendly makes packs from a location's own page; contact us for rollouts beyond the Agency plan's brand count.",
    angle: "multi-brand",
    uses: [
      { title: "Per-location packs", line: "Use each location's page so ads name the real place and offer." },
      { title: "Plan fit", line: `${agencyPlan} Larger rollouts: talk to us first.` },
      { title: "Approval stays with you", line: "Nothing publishes without the account owner connecting Meta." },
    ],
    steps: [
      { title: "Pick one location", line: "Run its page through the free pack." },
      { title: "Check brand rules", line: "Your brand team decides what's acceptable." },
      { title: "Talk to us about scale", line: "We don't offer franchise-wide tooling yet." },
    ],
    faq: [{ q: "Is there franchise-level approval or locking?", a: "No, not yet." }, COMMON_FAQ.results, COMMON_FAQ.adSpend],
  },
  {
    slug: "virtual-assistants",
    name: "Virtual assistants and VA agencies",
    title: "Add Meta ad creative to your VA services",
    description: `VAs: offer ad creative to clients without design skills. ${FREE_LINE}`,
    headline: "Add \"ad creative\" to what you offer clients",
    intro: "If clients already hand you their marketing admin, Komendly lets you make Facebook and Instagram ads from their site, for you to review and send.",
    angle: "partner",
    uses: [
      { title: "A new line item", line: "Produce a client's ads pack in minutes and review it." },
      { title: "Several clients", line: agencyPlan },
      { title: "Partner link", line: partnerLine },
    ],
    steps: [
      { title: "Try it on one client", line: "Free pack." },
      { title: "Review before sending", line: "You are the quality check." },
      { title: "Price your service", line: "That's your business decision." },
    ],
    faq: [COMMON_FAQ.results, COMMON_FAQ.adSpend],
  },
];

export const AUDIENCE_SLUGS = AUDIENCES.map((a) => a.slug);

export function getAudience(slug: string): Audience | undefined {
  return AUDIENCES.find((a) => a.slug === slug);
}

export function audiencePath(slug: string): string {
  return `${AUDIENCE_BASE}/${slug}`;
}

/** UTM-tagged CTA into the free pack (utm_campaign = audience slug; utm_content = position). */
export function audienceCtaHref(slug: string, position: string, target: "/free-ads" | "/partners/apply" = "/free-ads"): string {
  const q = new URLSearchParams({ utm_source: "audience", utm_medium: "landing", utm_campaign: slug, utm_content: position });
  return `${target}?${q.toString()}`;
}
