// Builders for the free local-service ad library: /ad-examples/<trade> content and /ad-examples/ideas/<category>/<angle>
// pages. Pure TS (no Next/Prisma): page copy is derived from hand-written playbooks, so every page has substance without
// waiting for engine jobs. Example ads use placeholders ([Your business], [your town]): never real or invented names.
import { getIndustry, type Industry } from "../ads/industries";
import type { SampleAd } from "./industry-examples";
import { CATEGORIES, PLAYBOOKS, SEASONS, type CategoryDef, type Playbook, type SeasonDef, type SeasonKey, type TradeAction, type TradeCategory } from "./trade-playbooks-data";

export { CATEGORIES, PLAYBOOKS, SEASONS };
export type { CategoryDef, Playbook, SeasonDef, SeasonKey, TradeCategory };

export const FREE_OFFER = "3 free ads, no card";
export const PAID_OFFER = "Ozzy Ad Department: $97 for the first month, then $197/mo. Your ads go live in your own Meta account and the losers get replaced every week.";
export const IDEAS_BASE = "/ad-examples/ideas";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titleCase = (s: string) => s.split(" ").map((w) => (["and", "or", "for", "of", "a"].includes(w) ? w : /^[A-Z]{2,}/.test(w) ? w : cap(w))).join(" ");
const lower1 = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
/** Offers carry notes in parentheses ("(only if you offer it)"): advice for the owner, not ad copy. */
const offerText = (o: string) => o.replace(/\s*\([^)]*\)/g, "").trim();

export function playbook(slug: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.slug === slug);
}
export function category(slug: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
export function season(key: string): SeasonDef | undefined {
  return SEASONS.find((s) => s.key === key);
}
export function tradesIn(cat: TradeCategory): Playbook[] {
  return PLAYBOOKS.filter((p) => p.category === cat);
}
export function tradeIndustry(p: Playbook): Industry {
  const i = getIndustry(p.slug);
  if (!i) throw new Error(`playbook ${p.slug} has no industry`);
  return i;
}

// ------------------------------------------------------------------------------------------------ trade pages

const CTA_BUTTON: Record<TradeAction, string> = { call: "Call now", quote: "Get quote", book: "Book now", visit: "Get directions", order: "Order now" };
const ACTION_LINE: Record<TradeAction, string> = {
  call: "Tap to call and talk to a real person.",
  quote: "Tap below for your free quote.",
  book: "Book online in under a minute.",
  visit: "Come see us this week.",
  order: "Order online for pickup or delivery.",
};

/** Three example ads Ozzy wrote from the playbook, with placeholders instead of business names. */
export function tradeExampleAds(p: Playbook): SampleAd[] {
  const i = tradeIndustry(p);
  const btn = CTA_BUTTON[p.action];
  return [
    {
      business: "Problem-first ad", city: "[your town]",
      hook: p.hooks[0]!,
      headline: cap(offerText(p.offers[0]!)).slice(0, 60),
      primaryText: `${p.hooks[0]} [Your business] handles ${p.services[0]} and ${p.services[1]} across [your town]. ${cap(p.proof[0]!)}, right on our site. ${ACTION_LINE[p.action]}`,
      offer: offerText(p.offers[0]!), cta: btn,
      angle: `Opens on a moment the customer is already in, then answers the "can I trust them?" question before asking for the ${btn.toLowerCase()}.`,
    },
    {
      business: "Offer-first ad", city: "[your town]",
      hook: p.hooks[1]!,
      headline: `${cap(offerText(p.offers[1]!))}`.slice(0, 60),
      primaryText: `${p.hooks[1]} ${cap(offerText(p.offers[1]!))} for [your town] customers through [date]. Here's what's included: [list it]. ${ACTION_LINE[p.action]}`,
      offer: offerText(p.offers[1]!), cta: btn,
      angle: `Leads with one concrete ${i.singular} offer and a real end date, so there's a reason to act this week instead of "someday".`,
    },
    {
      business: "Review-first ad", city: "[your town]",
      hook: "\"[Paste one line from a real 5-star review]\"",
      headline: `${cap(p.term)} [your town] neighbors recommend`.slice(0, 60),
      primaryText: `"[Real review line]" - [customer first name], [neighborhood]. That's the kind of ${p.services[2] ?? p.services[0]} job we do every week. ${cap(p.proof[2] ?? p.proof[1]!)} on our page. ${ACTION_LINE[p.action]}`,
      offer: offerText(p.offers[2] ?? p.offers[0]!), cta: btn,
      angle: "Lets a real customer do the talking: a named, local review is more believable than anything the business says about itself.",
    },
  ];
}

export function budgetGuidance(p: Playbook): string {
  const band = p.ticket === "high" ? "$20 to $50 a day" : p.ticket === "mid" ? "$10 to $30 a day" : "$5 to $15 a day";
  const why = p.ticket === "high"
    ? "One won job can pay for weeks of ads, so the test needs enough budget to get real leads."
    : p.ticket === "mid"
      ? "That's usually enough to see which of two or three ads gets cheaper calls or leads."
      : "Lower-ticket services win on repeat visits, so a small, steady budget aimed close to you usually beats short bursts.";
  return `Guidance, not a promise: many ${tradeIndustry(p).plural} start with a test of around ${band} for two to three weeks, split across two or three different ads. ${why} What you pay per call or lead depends on your city, season, offer and competition, so judge ads on cost per lead and booked jobs, not clicks.`;
}

export interface TradeFaq { q: string; a: string }

export function tradeFaq(p: Playbook): TradeFaq[] {
  const i = tradeIndustry(p);
  const faq: TradeFaq[] = [
    { q: `What makes a good Facebook ad for a ${i.singular}?`, a: `Open on a moment your customer recognizes ("${p.hooks[0]}"), show ${p.proof[0]}, make one clear offer and ask for one action. ${p.formats}` },
    { q: `What offers work best in ${p.term} ads?`, a: `Common ones that work: ${p.offers.map(offerText).join("; ")}. Only advertise offers you really run, state what's included and give it an end date.` },
    { q: `How much should a ${i.singular} spend on Facebook ads?`, a: budgetGuidance(p) },
    { q: `When is the best time to run ${p.term} ads?`, a: `${p.peak} Start ads a couple of weeks before demand peaks so they're tested by the time people are searching.` },
  ];
  if (p.note) faq.push({ q: `Are there special ad rules for ${i.plural}?`, a: p.note });
  faq.push({ q: `Can I get ${p.term} ads made for my business for free?`, a: `Yes. Paste your website and Ozzy, Komendly's AI ad maker, makes ready-to-run Facebook and Instagram ads from your own brand, photos and offers: ${FREE_OFFER}.` });
  return faq;
}

export interface TradePage {
  playbook: Playbook;
  industry: Industry;
  path: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  examples: SampleAd[];
  budget: string;
  faq: TradeFaq[];
  /** Seasonal ideas with their category season page, when one exists. */
  seasonal: Array<{ season: SeasonDef; idea: string; path?: string }>;
  related: Playbook[];
}

export function tradePage(slug: string): TradePage | null {
  const p = playbook(slug);
  if (!p) return null;
  const i = tradeIndustry(p);
  const cat = category(p.category)!;
  const Term = titleCase(p.term);
  return {
    playbook: p, industry: i, path: `/ad-examples/${p.slug}`,
    title: `${Term} Ad Examples: Facebook Ad Ideas, Hooks & Copy`,
    h1: `${cap(p.term)} ad examples and ideas`,
    description: `Example ${p.term} ads for Facebook and Instagram, with hooks, offers that work (${offerText(p.offers[0]!)}), copy templates, budget guidance and seasonal ideas for US ${i.plural}.`.slice(0, 300),
    intro: `What a good ${p.term} ad looks like for a US ${i.singular}: the hooks, offers and wording that fit ${p.services.slice(0, 3).join(", ")}, ready to adapt. Everything here is written for your own business, with no made-up companies or results.`,
    examples: tradeExampleAds(p),
    budget: budgetGuidance(p),
    faq: tradeFaq(p),
    seasonal: (Object.entries(p.seasonal) as Array<[SeasonKey, string]>).map(([k, idea]) => ({ season: season(k)!, idea, ...(cat.seasons[k] ? { path: ideasPath(p.category, k) } : {}) })),
    related: tradesIn(p.category).filter((x) => x.slug !== p.slug),
  };
}

// ------------------------------------------------------------------------------------------------ angle pages

export const EVERGREEN_ANGLES = ["hooks", "ad-copy", "offer-ideas"] as const;
export type EvergreenAngle = (typeof EVERGREEN_ANGLES)[number];
export type Angle = EvergreenAngle | SeasonKey;

export function ideasPath(cat: TradeCategory, angle?: Angle): string {
  return angle ? `${IDEAS_BASE}/${cat}/${angle}` : `${IDEAS_BASE}/${cat}`;
}

/** Every (category, angle) pair that has a page: evergreen angles for all, seasons only where the category has ideas. */
export function anglePairs(): Array<{ category: TradeCategory; angle: Angle }> {
  return CATEGORIES.flatMap((c) => [
    ...EVERGREEN_ANGLES.map((angle) => ({ category: c.slug, angle: angle as Angle })),
    ...SEASONS.filter((s) => c.seasons[s.key]).map((s) => ({ category: c.slug, angle: s.key as Angle })),
  ]);
}

export interface AngleRow { trade: Playbook; industry: Industry; items: string[] }

export interface AnglePage {
  category: CategoryDef;
  angle: Angle;
  path: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  /** Category-level advice (formulas, rules, ideas). */
  points: Array<{ title: string; detail: string }>;
  /** Per-trade rows (hooks, copy, offers or seasonal ideas), each linking to the trade page. */
  rows: AngleRow[];
  rowsTitle: string;
  faq: TradeFaq[];
  season?: SeasonDef;
}

const shortList = (c: CategoryDef) => tradesIn(c.slug).slice(0, 3).map((p) => tradeIndustry(p).plural);
const tradeNames = (c: CategoryDef) => { const n = shortList(c); return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`; };

function copyTemplate(p: Playbook): string {
  return `${p.hooks[0]} [Your business] does ${p.services[0]} in [your town]. ${cap(offerText(p.offers[0]!))}. ${ACTION_LINE[p.action]}`;
}

export function anglePage(cat: string, angle: string): AnglePage | null {
  const c = category(cat);
  if (!c) return null;
  const trades = tradesIn(c.slug);
  const label = c.label;
  const names = tradeNames(c);
  const rowsOf = (f: (p: Playbook) => string[]) => trades.map((t) => ({ trade: t, industry: tradeIndustry(t), items: f(t) })).filter((r) => r.items.length > 0);
  const free = { q: `Can I get ${label.toLowerCase()} ads made for free?`, a: `Yes. Paste your website and Ozzy makes ready-to-run Facebook and Instagram ads from your own brand and offers: ${FREE_OFFER}.` };

  if (angle === "hooks") {
    const rows = rowsOf((t) => t.hooks);
    const n = rows.reduce((k, r) => k + r.items.length, 0);
    return {
      category: c, angle, path: ideasPath(c.slug, angle),
      title: `${label} Ad Hooks: ${n} Opening Lines for ${titleCase(names)}`,
      h1: `${label} ad hooks that stop the scroll`,
      description: `${n} ad hooks (opening lines) for ${c.plural}: ${names}. Five hook formulas, trade-by-trade examples and how to test them.`,
      intro: `The first line of an ad decides whether anyone reads the second. ${c.intro}`,
      points: c.hookFormulas.map((h) => ({ title: h.name, detail: h.how })),
      rowsTitle: "Hooks by trade",
      rows,
      faq: [
        { q: "What is an ad hook?", a: "The first line, image or second of video that makes someone stop scrolling. On Facebook it's the first line of the primary text and whatever the image shows first." },
        { q: "How many hooks should I test?", a: "Three is a good start: run the same offer with three different opening lines, then keep the one with the lowest cost per lead and replace the rest." },
        free,
      ],
    };
  }
  if (angle === "ad-copy") {
    return {
      category: c, angle, path: ideasPath(c.slug, angle),
      title: `${label} Ad Copy Templates for Facebook & Instagram`,
      h1: `${label} ad copy templates`,
      description: `Fill-in-the-blank Facebook and Instagram ad copy for ${c.plural} (${names}), plus the copy rules that keep ads honest and approved.`,
      intro: `Copy you can paste and adapt for ${c.plural}: one template per trade, written with placeholders for your business and town. ${c.intro}`,
      points: c.copyRules.map((r, k) => ({ title: `Rule ${k + 1}`, detail: r })),
      rowsTitle: "Copy templates by trade",
      rows: rowsOf((t) => [copyTemplate(t)]),
      faq: [
        { q: "How long should Facebook ad copy be?", a: "Put the hook and the offer in the first 125 characters, which is what shows before 'See more'. Longer copy is fine after that if it answers real questions." },
        { q: "Should I write different copy for Instagram?", a: "Keep the same message but shorter: Instagram users read less caption text, so the image and first line carry it." },
        free,
      ],
    };
  }
  if (angle === "offer-ideas") {
    return {
      category: c, angle, path: ideasPath(c.slug, angle),
      title: `${label} Offer Ideas for Ads: What to Promote and How`,
      h1: `Offer ideas for ${c.plural}`,
      description: `Ad offers that work for ${c.plural} (${names}), trade by trade, plus rules for offers that bring good customers instead of bargain hunters.`,
      intro: `The offer is the reason to act now instead of "someday". ${c.intro}`,
      points: c.offerRules.map((r, k) => ({ title: `Offer rule ${k + 1}`, detail: r })),
      rowsTitle: "Offers by trade",
      rows: rowsOf((t) => t.offers),
      faq: [
        { q: "Do I need a discount to run ads?", a: "No. A clear first step (a free estimate, a consult, a set price) often works as well as a discount and attracts better customers." },
        { q: "How long should an offer run?", a: "Give it a real end date, usually two to four weeks, then refresh it. Fake countdowns hurt trust." },
        free,
      ],
    };
  }
  const s = season(angle);
  const ideas = s ? c.seasons[s.key] : undefined;
  if (!s || !ideas) return null;
  const rows = rowsOf((t) => (t.seasonal[s.key] ? [t.seasonal[s.key]!] : []));
  const top = rows.slice(0, 3).map((r) => r.industry.plural);
  return {
    category: c, angle: s.key, season: s, path: ideasPath(c.slug, s.key),
    title: `${s.name} Ad Ideas for ${titleCase(top.length ? top.join(", ") : c.plural)} & More`,
    h1: `${s.name} ad ideas for ${c.plural}`,
    description: `${s.name} ad ideas for ${c.plural}: timing, offers and trade-by-trade ideas for ${top.join(", ")} and more. Honest, US-focused, ready to adapt.`.slice(0, 300),
    intro: `${s.name} is ${s.when}. ${s.timing}`,
    points: [
      ...ideas.ideas.map((d, k) => ({ title: `Idea ${k + 1}`, detail: d })),
      { title: "Offer that fits", detail: ideas.offer },
      { title: "Avoid", detail: ideas.avoid },
    ],
    rowsTitle: `${s.name} ideas by trade`,
    rows,
    faq: [
      { q: `When should ${c.plural} start ${s.name} ads?`, a: s.timing },
      { q: `What's a good ${s.name} offer for ${c.plural}?`, a: `${ideas.offer} Avoid: ${lower1(ideas.avoid)}` },
      free,
    ],
  };
}

/** All angle pages (sitemap, hub, tests). */
export function allAnglePages(): AnglePage[] {
  return anglePairs().map((x) => anglePage(x.category, x.angle)!).filter(Boolean);
}

/** Angle pages of one category, for internal links. */
export function categoryAngles(cat: TradeCategory): AnglePage[] {
  return allAnglePages().filter((a) => a.category.slug === cat);
}

/** Short anchor text for an angle link ("Black Friday ideas", "Ad hooks"). */
export function angleLabel(a: Angle): string {
  if (a === "hooks") return "Ad hooks";
  if (a === "ad-copy") return "Ad copy templates";
  if (a === "offer-ideas") return "Offer ideas";
  return `${season(a)?.name ?? a} ad ideas`;
}

// ------------------------------------------------------------------------------------------------ engine samples

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Engine samples were written for fictional businesses in named towns: show them as templates instead. Replaces the
 * business name and town (and the town before a comma) with placeholders so no made-up company appears on the page.
 */
export function templatizeSample(s: SampleAd): SampleAd {
  const town = s.city.split(",")[0]!.trim();
  const subs: Array<[RegExp, string]> = [
    [new RegExp(escapeRe(s.business.trim()), "gi"), "[Your business]"],
    ...(s.city.trim().length > 2 ? [[new RegExp(escapeRe(s.city.trim()), "gi"), "[your town]"] as [RegExp, string]] : []),
    ...(town.length > 2 ? [[new RegExp(`\\b${escapeRe(town)}\\b`, "gi"), "[your town]"] as [RegExp, string]] : []),
  ];
  const fix = (t: string) => subs.reduce((acc, [re, to]) => acc.replace(re, to), t);
  return { ...s, business: "Example ad", city: "[your town]", headline: fix(s.headline), primaryText: fix(s.primaryText), hook: fix(s.hook), offer: fix(s.offer), angle: fix(s.angle) };
}

/** Text of a page for honesty checks in tests. */
export function tradePageText(t: TradePage): string {
  return [t.title, t.h1, t.description, t.intro, t.budget, ...t.faq.flatMap((f) => [f.q, f.a]), ...t.examples.flatMap((e) => [e.headline, e.hook, e.primaryText, e.angle]), ...t.seasonal.map((s) => s.idea)].join("\n");
}
export function anglePageText(a: AnglePage): string {
  return [a.title, a.h1, a.description, a.intro, ...a.points.flatMap((p) => [p.title, p.detail]), ...a.rows.flatMap((r) => r.items), ...a.faq.flatMap((f) => [f.q, f.a])].join("\n");
}

