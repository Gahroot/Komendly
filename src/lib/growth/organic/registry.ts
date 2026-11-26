// Registry of the organic-search resources (opportunities 46-60, 86, 91-92): tools under /tools, libraries, comparisons,
// benchmarks. One place feeds the sitemap, llms.txt, the /tools hub and the IndexNow URL list.
import { withSystemUtm } from "../systems";
import { SITE_URL } from "../../site";
import { COMPETITORS, alternativesPath, comparePath } from "./compare";
import { COPY_LIBRARY } from "./copy-library";

export type ResourceSlug = "marketing-offer-generator" | "marketing-calendar-generator" | "ad-image-resizer" | "marketing-playbook-quiz" | "ad-templates";
export interface ResourceTool {
  slug: ResourceSlug; name: string; description: string; blurb: string; h1: string; intro: string;
  /** Has an /embed/<slug> version. */
  embeddable: boolean; tips: string[]; faq: Array<{ q: string; a: string }>;
}

export const RESOURCE_TOOLS: readonly ResourceTool[] = [
  { slug: "marketing-offer-generator", name: "Marketing offer generator", embeddable: true,
    description: "Pick your trade and goal and get offer ideas built for local businesses, each with why it works and what to watch, plus a discount calculator that shows how many extra sales a discount needs. Free, no sign-up.",
    blurb: "Offer ideas for your trade and goal, plus a check on whether a discount can pay off.",
    h1: "Marketing offer generator for local businesses",
    intro: "Choose your trade and what you want more of. You get offer structures with blanks to fill in with your own numbers, and a calculator that checks a discount against your margin before you run it.",
    tips: ["Fill every [bracket] with a real number you can honour.", "Run one offer at a time so you know which one worked.", "Put an end date on every offer."],
    faq: [{ q: "Does the generator invent prices or results?", a: "No. Offers use placeholders such as [$X] for you to fill in. Nothing here promises sales." }, { q: "How does the discount calculator work?", a: "It compares your profit per sale at the normal price and the discounted price, and shows how many more sales you need to earn the same profit." }] },
  { slug: "marketing-calendar-generator", name: "Marketing calendar generator", embeddable: true,
    description: "Get a seasonal marketing calendar for your trade: the dates that matter, when to start ads, and an idea for each. Download it as a CSV or add the reminders to your calendar (.ics). Free, no sign-up.",
    blurb: "A seasonal ad calendar for your trade, with a CSV and calendar download.",
    h1: "Seasonal marketing calendar generator",
    intro: "Pick your trade and year. You get each seasonal moment, the date, when to start your ads, and a trade-specific idea where one genuinely fits. Download it as a spreadsheet or calendar file.",
    tips: ["Start ads before the date, not on it.", "Seasons that begin by weather (spring, winter) shift with your climate; adjust the start date.", "Skip events that do not fit your trade."],
    faq: [{ q: "Are the dates exact?", a: "Holiday dates follow US rules (for example Mother's Day is the second Sunday in May). Seasons such as spring and summer use an approximate start you should adjust to your area." }, { q: "How do I add it to my calendar?", a: "Download the .ics file and open it; Google Calendar, Apple Calendar and Outlook import it as all-day reminders to start each campaign." }] },
  { slug: "ad-image-resizer", name: "Ad image resizer", embeddable: true,
    description: "Resize one image to every Meta, Google Display, Pinterest, TikTok, LinkedIn and YouTube ad size in your browser. Crop or fit, download each size or all of them. Your image never leaves your device.",
    blurb: "One image, every ad size, resized in your browser. Nothing is uploaded.",
    h1: "Ad image resizer for Facebook, Instagram, Google, Pinterest and TikTok",
    intro: "Drop in your image, pick the platforms, and download each size. Everything runs in your browser; your image is never uploaded.",
    tips: ["Start from the largest, sharpest version of your image.", "Keep text and logos away from the edges so a crop does not cut them.", "For Stories and Reels keep key content out of the top and bottom of the 9:16 frame."],
    faq: [{ q: "Is my image uploaded?", a: "No. The resize happens on your device with your browser's canvas." }, { q: "Are these sizes current?", a: "They are commonly recommended sizes. Platforms change specs, so confirm in the ad manager before you launch." }, { q: "Crop or fit?", a: "Crop fills the frame and cuts the edges; fit keeps the whole image and adds bars." }] },
  { slug: "marketing-playbook-quiz", name: "Marketing playbook quiz", embeddable: true,
    description: "Answer five quick questions about your business and get a personalised step-by-step marketing plan with a starting test budget and the free tools to do each step. No sign-up.",
    blurb: "Five questions, one personalised marketing plan with the next steps linked.",
    h1: "Marketing playbook quiz: your personalised plan",
    intro: "Tell us your trade, goal, budget, website, reviews and time. You get an ordered plan, a starting-test budget and links to the tool for each step.",
    tips: ["Do the steps in order; the first ones cost nothing.", "Treat budget guidance as a starting test, not a promise.", "Repeat the quiz when your situation changes."],
    faq: [{ q: "Is the budget a benchmark?", a: "No. It is a starting test size, because results depend on your market. Judge by your own cost per lead." }, { q: "Are my answers stored?", a: "No. The quiz runs in your browser." }] },
  { slug: "ad-templates", name: "Free ad templates", embeddable: false,
    description: "Download free editable ad templates (SVG) in square, portrait and Story sizes: big offer, photo with headline, customer review and event announcement. Works in Canva, Figma and Photopea.",
    blurb: "12 editable SVG ad templates: offer, photo, review and event, in 3 sizes.",
    h1: "Free ad templates you can edit",
    intro: "Four layouts in the three sizes Facebook and Instagram use. The text is live, so open a file in Canva, Figma, Photopea or any vector editor, swap in your words and photo, and export.",
    tips: ["Replace every [bracket] with real details.", "Use your own photo and logo; keep one message per ad.", "Export a JPG or PNG for the ad manager."],
    faq: [{ q: "Can I use them commercially?", a: "Yes, for your own business ads. They are plain layouts with no stock photos or third-party fonts." }, { q: "Which program opens them?", a: "Any editor that opens SVG, such as Figma, Canva (upload), Photopea or Inkscape." }] },
];
export const getResource = (slug: string) => RESOURCE_TOOLS.find((t) => t.slug === slug);
export const resourcePath = (slug: string) => `/tools/${slug}`;
export const embedPath = (slug: string) => `/embed/${slug}`;
export const EMBEDDABLE = RESOURCE_TOOLS.filter((t) => t.embeddable).map((t) => t.slug);
/** Embeddable existing tool (lives in the shared ToolRunner). */
export const EMBED_EXISTING = ["ad-budget-calculator"] as const;

export const INSPIRATION_PATH = "/ad-inspiration";
export const COPY_LIBRARY_BASE = "/ad-copy-library";
export const COMPARE_BASE = "/compare";
export const ALTERNATIVES_BASE = "/alternatives";

/** /free-ads link attributed to the free_tools system. */
export function organicCtaHref(campaign: string, content = "page"): string {
  const u = new URL(withSystemUtm(`${SITE_URL}/free-ads`, "free_tools", { campaign, content, medium: "organic" }));
  return `${u.pathname}${u.search}`;
}

/** All public, indexable paths added by this system (sitemap, llms.txt, IndexNow). Benchmarks are added separately (data-gated). */
export function organicPaths(): string[] {
  return [
    ...RESOURCE_TOOLS.map((t) => resourcePath(t.slug)),
    INSPIRATION_PATH, COPY_LIBRARY_BASE, ...COPY_LIBRARY.map((c) => `${COPY_LIBRARY_BASE}/${c.slug}`),
    COMPARE_BASE, ...COMPETITORS.flatMap((c) => [comparePath(c), alternativesPath(c)]),
  ];
}
