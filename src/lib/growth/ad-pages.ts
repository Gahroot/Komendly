// /ad-examples intent pages beyond industries (growth system `industry_examples`). Pure TS: imported by web and engine.
// One page per INTENT from the vocabulary (platform / format / occasion / "facebook ads for <industry>" combo).
// Content (tips + sample ads for FICTIONAL demo businesses) is engine-written into GalleryPage rows, keyed by page key.
// A page is indexable only when it has substance (pageSubstance); near-duplicate content vs siblings is rejected.
import { INDUSTRIES } from "../ads/industries";
import type { IndustryContent } from "./industry-examples";
import { COMBO_VOCAB, FORMAT_VOCAB, OCCASION_VOCAB, PLATFORM_VOCAB, type VocabEntry } from "./vocabulary";

export type GalleryKind = "platform" | "format" | "occasion" | "combo";

/** Which real consented ads fit a page: by industry and/or image shape. "none" = real ads can't show this (e.g. video). */
export type AdShape = "any" | "vertical" | "square" | "feed" | "none";

/** "<platform> ads for <industry>" combos; slug = `<platform>-<industry>`, path = /ad-examples/<industry>/<platform>. */
export const COMBO_PLATFORMS = ["facebook", "google"] as const;
export type ComboPlatform = (typeof COMBO_PLATFORMS)[number];

export function parseComboSlug(slug: string): { platform: ComboPlatform; industry: string } {
  const m = /^(facebook|google)-(.+)$/.exec(slug);
  if (!m) throw new Error(`bad combo slug ${slug}`);
  return { platform: m[1] as ComboPlatform, industry: m[2]! };
}

export interface GalleryPageDef {
  key: string;
  kind: GalleryKind;
  slug: string;
  path: string;
  entry: VocabEntry;
  /** Combo pages only. */
  industry?: string;
  /** Combo pages only: which ad platform the combo is about. */
  comboPlatform?: ComboPlatform;
  shape: AdShape;
}

const SHAPES: Record<string, AdShape> = {
  "platform:facebook": "feed", "platform:instagram": "feed", "platform:tiktok": "vertical", "platform:google-business": "feed", "platform:nextdoor": "feed",
  "platform:google-search": "none", "platform:linkedin": "feed", "platform:youtube": "none", "platform:pinterest": "feed", "platform:snapchat": "vertical", "platform:reddit": "feed", "platform:x": "feed",
  "format:instagram-story": "vertical", "format:carousel": "square", "format:ugc": "none", "format:promo-video": "none",
};

export function galleryPath(kind: GalleryKind, slug: string): string {
  if (kind === "combo") { const c = parseComboSlug(slug); return `/ad-examples/${c.industry}/${c.platform}`; }
  return `/ad-examples/${kind}/${slug}`;
}

const def = (entry: VocabEntry): GalleryPageDef => {
  const kind = entry.kind as GalleryKind;
  return {
    key: entry.key, kind, slug: entry.slug, path: galleryPath(kind, entry.slug), entry,
    ...(kind === "combo" ? { industry: parseComboSlug(entry.slug).industry, comboPlatform: parseComboSlug(entry.slug).platform } : {}),
    // Google combos are text search ads: real image ads don't show that.
    shape: kind === "combo" ? (entry.slug.startsWith("google-") ? "none" : "any") : kind === "occasion" ? "none" : (SHAPES[entry.key] ?? "any"),
  };
};

export const GALLERY_PAGES: readonly GalleryPageDef[] = [...PLATFORM_VOCAB, ...FORMAT_VOCAB, ...OCCASION_VOCAB, ...COMBO_VOCAB].map(def);
/**
 * Engine generation order (missing pages are filled in this order): the higher-demand new pages first, then the rest
 * in GALLERY_PAGES order. Display order (hub, siblings) stays GALLERY_PAGES.
 */
const GENERATE_FIRST = ["platform:google-search", "platform:linkedin", "platform:youtube", "occasion:valentines-day"];
export function galleryGenerationOrder(): string[] {
  const all = GALLERY_PAGES.map((p) => p.key);
  const first = [...GENERATE_FIRST, ...GALLERY_PAGES.filter((p) => p.comboPlatform === "google").map((p) => p.key), "occasion:new-year"].filter((k) => all.includes(k));
  return [...new Set([...first, ...all])];
}

/** Static first segments of the new URL scheme; must never be an industry slug. */
export const RESERVED_SEGMENTS = ["platform", "format", "occasion"] as const;

export function galleryPage(key: string): GalleryPageDef | undefined {
  return GALLERY_PAGES.find((p) => p.key === key);
}
export function galleryPageFor(kind: GalleryKind, slug: string): GalleryPageDef | undefined {
  return GALLERY_PAGES.find((p) => p.kind === kind && p.slug === slug);
}
export function comboForIndustry(industry: string, platform: ComboPlatform = "facebook"): GalleryPageDef | undefined {
  return GALLERY_PAGES.find((p) => p.kind === "combo" && p.industry === industry && p.comboPlatform === platform);
}

/** Real consented ads that fit the page (combo: that industry; shape filter by aspect). Order kept (featured first). */
export function matchAds<T extends { industry: string; width: number; height: number }>(page: GalleryPageDef, ads: readonly T[]): T[] {
  if (page.shape === "none") return [];
  return ads.filter((a) => {
    if (page.industry && a.industry !== page.industry) return false;
    const r = a.height / Math.max(1, a.width);
    if (page.shape === "vertical") return r >= 1.6;
    if (page.shape === "square") return Math.abs(r - 1) < 0.05;
    if (page.shape === "feed") return r <= 1.3;
    return true;
  });
}

export const MIN_PAGE_TIPS = 3;
export const MIN_PAGE_SAMPLES = 3;
export const MIN_PAGE_REAL_ADS = 3;

/** Pure substance rule: engine tips present AND (enough samples OR enough real ads). Below it = noindex + no sitemap. */
export function pageSubstance(x: { realAds: number; samples: number; tips: number }): { score: number; indexable: boolean } {
  const indexable = x.tips >= MIN_PAGE_TIPS && (x.samples >= MIN_PAGE_SAMPLES || x.realAds >= MIN_PAGE_REAL_ADS);
  return { score: x.realAds * 2 + x.samples + x.tips, indexable };
}

// ------------------------------------------------------------------------------------------------ near-duplicate check

export function contentText(c: IndustryContent): string {
  return [c.intro, ...c.whatWorks.flatMap((w) => [w.title, w.detail]), ...c.samples.flatMap((s) => [s.headline, s.hook, s.primaryText, s.offer, s.angle])].join(" ");
}

function shingles(text: string, n = 3): Set<string> {
  const w = text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Jaccard similarity of word 3-shingles (0 = nothing shared, 1 = identical). */
export function similarity(a: string, b: string): number {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Generated copy sharing more than this with any sibling is rejected (and regenerated once). */
export const MAX_SIBLING_SIMILARITY = 0.25;

export function mostSimilar(text: string, siblings: ReadonlyArray<{ key: string; text: string }>): { key: string; score: number } | null {
  let best: { key: string; score: number } | null = null;
  for (const s of siblings) {
    const score = similarity(text, s.text);
    if (!best || score > best.score) best = { key: s.key, score };
  }
  return best;
}

export function tooSimilar(text: string, siblings: ReadonlyArray<{ key: string; text: string }>, max = MAX_SIBLING_SIMILARITY): { key: string; score: number } | null {
  const m = mostSimilar(text, siblings);
  return m && m.score > max ? m : null;
}

/** Siblings for the duplicate check: same kind (combos: also all combos), excluding the page itself. */
export function siblingKeys(page: GalleryPageDef): string[] {
  return GALLERY_PAGES.filter((p) => p.kind === page.kind && p.key !== page.key).map((p) => p.key);
}

// ------------------------------------------------------------------------------------------------ engine cycle

/** Env: GALLERY_PAGES_PER_CYCLE (default 3), GALLERY_PAGES_DAILY_CAP (default 6), GALLERY_PAGES_REFRESH_DAYS (default 60). */
export function galleryCycleConfig(env: Record<string, string | undefined>): { perCycle: number; dailyCap: number; refreshDays: number } {
  const n = (k: string, d: number) => { const v = Number(env[k]); return env[k] !== undefined && env[k] !== "" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d; };
  return { perCycle: n("GALLERY_PAGES_PER_CYCLE", 3), dailyCap: n("GALLERY_PAGES_DAILY_CAP", 6), refreshDays: n("GALLERY_PAGES_REFRESH_DAYS", 60) || 60 };
}

/** Missing pages first (list order), then the stalest past refreshDays; at most perCycle and what's left of the 24h cap. */
export function pickGalleryPages(allKeys: readonly string[], existing: ReadonlyArray<{ key: string; generatedAt: Date }>, cfg: { perCycle: number; dailyCap: number; refreshDays: number }, now: Date): string[] {
  const day = now.getTime() - 86_400_000;
  const usedToday = existing.filter((e) => e.generatedAt.getTime() > day).length;
  const room = Math.max(0, Math.min(cfg.perCycle, cfg.dailyCap - usedToday));
  const have = new Set(existing.map((e) => e.key));
  const missing = allKeys.filter((k) => !have.has(k));
  const stale = existing
    .filter((e) => allKeys.includes(e.key) && now.getTime() - e.generatedAt.getTime() > cfg.refreshDays * 86_400_000)
    .sort((a, b) => a.generatedAt.getTime() - b.generatedAt.getTime())
    .map((e) => e.key);
  return [...missing, ...stale].slice(0, room);
}

const HONEST = "Komendly makes ad creatives and copy and publishes only to Facebook and Instagram: never say or imply Komendly posts, runs or publishes ads on this platform; the owner uploads them there.";

/** Per-platform sample hints (what a real ad on that platform looks like). */
const PLATFORM_HINT: Record<string, string> = {
  "platform:google-search": `These are Google SEARCH TEXT ads (responsive search ads), no images. ${HONEST} Tips: keywords, match intent, headline/description writing, assets (call, location, sitelinks), negative keywords.`,
  "platform:linkedin": `LinkedIn is B2B: the 4 FICTIONAL businesses sell to other businesses or professionals (e.g. bookkeeping, IT support, B2B software, commercial cleaning, recruiting); write to a job role's problem. Headline <=70 chars is ideal, opening text <=150 chars before truncation. ${HONEST}`,
  "platform:youtube": `These are YouTube VIDEO ads: in primaryText give the script beats with the first 5 seconds (before skip) spelled out, plus length (6s bumper / 15-30s skippable / Shorts 9:16). ${HONEST}`,
  "platform:pinterest": `Pinterest Pins are saved ideas for planning (home, weddings, food, style, gifts, DIY): pick businesses that fit; headline is the Pin title (lead with the idea in the first 40 chars), primaryText is the Pin description using words people search on Pinterest. ${HONEST}`,
  "platform:snapchat": `Snapchat full-screen vertical ads for a younger audience: headline <=34 chars, primaryText describes the 9:16 Snap (under 10s, message in the first seconds) plus the caption. ${HONEST}`,
  "platform:reddit": `Reddit promoted posts: headline reads like a post title from someone in the community (plain, specific, no hype); name the subreddit-style audience in angle; businesses fit niche communities. ${HONEST}`,
  "platform:x": `X (Twitter) promoted posts: primaryText is the post itself, under 280 characters, short and conversational, tied to a moment; headline is the website card title. ${HONEST}`,
};

/** Sample field instructions: Google text ads map RSA parts onto the shared sample shape (no schema change). */
const SAMPLES_DEFAULT = "samples: 4 sample ads. Fields: business, city, headline (<=40 chars), primaryText (2-4 sentences, ends with a call to action), hook, offer, cta (button text), angle (one sentence: why it works).";
const SAMPLES_SEARCH = "samples: 4 Google responsive search ads. Map them onto these fields: business, city, headline = two RSA headlines, each <=27 characters, joined with \" | \" (whole field <=60 chars); hook = a third RSA headline (<=30 chars); primaryText = two RSA descriptions, each <=90 characters, as two sentences (the second ends with a call to action); offer = the offer or price point in the ad; cta = the main action (e.g. Call now, Get a quote); angle = one sentence: which search it targets and why it works. Count characters: never exceed 30 per headline or 90 per description. Never use the word 'guaranteed'.";

const isSearchPage = (p: GalleryPageDef) => p.key === "platform:google-search" || p.comboPlatform === "google";

const TASK: Record<GalleryKind, (e: VocabEntry, industry?: (typeof INDUSTRIES)[number], page?: GalleryPageDef) => string> = {
  platform: (e, _i, p) => `Page: "${e.h1}" (people search "${e.primaryQuery}"). Tips must be about this platform's placements, specs, audience behaviour and what small businesses post there, not generic ad advice. Samples: 4 ads for 4 different FICTIONAL small businesses in 4 different industries, each written for this platform.${p && PLATFORM_HINT[p.key] ? ` ${PLATFORM_HINT[p.key]}` : ""}`,
  format: (e) => `Page: "${e.h1}" (people search "${e.primaryQuery}"). Tips must be about making this format well (structure, length, shots/cards, specs). Samples: 4 FICTIONAL small businesses in different industries; in primaryText describe the piece in this format (e.g. cards, shots or script beats) plus the caption.`,
  occasion: (e) => `Page: "${e.h1}" (people search "${e.primaryQuery}"). Tips must be about timing, offers and wording for this occasion. Samples: 4 ads for this occasion from 4 FICTIONAL small businesses in different industries.`,
  combo: (e, i, p) => p?.comboPlatform === "google"
    ? `Page: "${e.h1}" (people search "${e.primaryQuery}"). This is about RUNNING Google search ads as a ${i?.singular ?? "business"}: which keywords to bid on, negative keywords, location targeting, daily budget, call assets and ad schedule, and when Local Services Ads (pay per lead, where available) fit better than search ads. Samples: 4 Google search text ads for 4 FICTIONAL ${i?.plural ?? "businesses"} in different US/UK towns, each targeting a different kind of search (emergency, specific service, price-shopping, local). ${HONEST}`
    : `Page: "${e.h1}" (people search "${e.primaryQuery}"). This is about RUNNING Facebook ads as a ${i?.singular ?? "business"}: targeting radius, budget, goal (leads/calls/messages), lead forms, which ad to run first, seasonality. Samples: 4 Facebook ads for 4 FICTIONAL ${i?.plural ?? "businesses"} in different US/UK towns, each a different campaign goal.`,
};

/** Codex prompt for one page; `avoid` = a near-duplicate sibling's text to steer away from on a retry. */
export function galleryPagePrompt(page: GalleryPageDef, avoid?: string): { system: string; prompt: string } {
  const industry = page.industry ? INDUSTRIES.find((i) => i.slug === page.industry) : undefined;
  return {
    system: "You write practical ad guidance for small-business owners. Plain words, concrete, honest. Never claim guarantees, cures, rankings or awards, never invent statistics. Business names must be clearly fictional, ordinary small-business names (not real brands).",
    prompt: [
      TASK[page.kind](page.entry, industry, page),
      `The page already says (don't repeat these): ${page.entry.guidance.join(" | ")}`,
      `Write:\n- intro: 2 sentences specific to this page.\n- whatWorks: 4 tips (title + one-sentence detail), each specific to this page.\n- ${isSearchPage(page) ? SAMPLES_SEARCH : SAMPLES_DEFAULT}`,
      avoid ? `Your last draft was too close to a sibling page. Use different angles, wording, businesses and towns than this text: """${avoid.slice(0, 1500)}"""` : "",
    ].filter(Boolean).join("\n"),
  };
}

/** Related pages for internal links: other intents across kinds (stable, small). */
export function relatedGalleryPages(page: GalleryPageDef, limit = 6): GalleryPageDef[] {
  const others = GALLERY_PAGES.filter((p) => p.key !== page.key);
  const order: GalleryKind[] = page.kind === "combo" ? ["combo", "platform", "occasion", "format"] : page.kind === "platform" ? ["format", "occasion", "platform", "combo"] : page.kind === "format" ? ["platform", "format", "occasion", "combo"] : ["occasion", "platform", "format", "combo"];
  const out: GalleryPageDef[] = [];
  for (const k of order) for (const p of others.filter((x) => x.kind === k).slice(0, 2)) if (out.length < limit) out.push(p);
  return out;
}
