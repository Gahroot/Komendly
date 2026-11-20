// Industry ad examples (growth system `industry_examples`, PRD #3). Pure TS + zod: imported by web and engine.
// The engine writes one IndustryExample row per industry (Codex Sol): "what works" tips + sample ads for FICTIONAL
// demo businesses, always labelled as samples on the page. Real customer ads (consented) come from src/lib/ads/gallery.ts.
import { z } from "zod";

export const SAMPLE_AD = z.object({
  business: z.string().min(2).max(60), // fictional demo business name
  city: z.string().min(2).max(40),
  headline: z.string().min(3).max(60),
  primaryText: z.string().min(20).max(400),
  hook: z.string().min(3).max(120),
  offer: z.string().min(3).max(120),
  cta: z.string().min(2).max(30),
  angle: z.string().min(3).max(160), // why this ad works
});

export const INDUSTRY_CONTENT = z.object({
  intro: z.string().min(40).max(500),
  whatWorks: z.array(z.object({ title: z.string().min(3).max(80), detail: z.string().min(20).max(300) })).min(3).max(6),
  samples: z.array(SAMPLE_AD).min(3).max(6),
});
export type IndustryContent = z.infer<typeof INDUSTRY_CONTENT>;
export type SampleAd = z.infer<typeof SAMPLE_AD>;

const BANNED = /\b(guarantee[ds]?|#1|number one|best in (the )?(world|country)|cure[sd]?|lorem ipsum)\b/i;

/** Validate engine/DB content: schema + honesty rules (no superlative/guarantee claims, distinct businesses). */
export function validateIndustryContent(v: unknown): { ok: true; content: IndustryContent } | { ok: false; error: string } {
  const r = INDUSTRY_CONTENT.safeParse(v);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "invalid" };
  const c = r.data;
  const names = new Set(c.samples.map((s) => s.business.toLowerCase()));
  if (names.size !== c.samples.length) return { ok: false, error: "duplicate sample business" };
  const all = [c.intro, ...c.whatWorks.flatMap((w) => [w.title, w.detail]), ...c.samples.flatMap((s) => [s.headline, s.primaryText, s.hook, s.offer])].join(" \n ");
  if (BANNED.test(all)) return { ok: false, error: "banned claim" };
  return { ok: true, content: c };
}

/** Lenient read for the web page: invalid/missing content renders nothing. */
export function readIndustryContent(v: unknown): IndustryContent | null {
  const r = validateIndustryContent(v);
  return r.ok ? r.content : null;
}

/** Pages with at least this many samples (or MIN_INDEXABLE_INDUSTRY_ADS real ads) are indexable. */
export const MIN_INDEXABLE_SAMPLES = 3;

/**
 * Pick industries for one engine cycle: never generated first (list order), then the stalest older than refreshDays.
 */
export function pickIndustriesForCycle(allSlugs: readonly string[], existing: ReadonlyArray<{ industry: string; generatedAt: Date }>, perCycle: number, now: Date, refreshDays = 30): string[] {
  const have = new Map(existing.map((e) => [e.industry, e.generatedAt]));
  const missing = allSlugs.filter((s) => !have.has(s));
  const stale = existing
    .filter((e) => allSlugs.includes(e.industry) && now.getTime() - e.generatedAt.getTime() > refreshDays * 86_400_000)
    .sort((a, b) => a.generatedAt.getTime() - b.generatedAt.getTime())
    .map((e) => e.industry);
  return [...missing, ...stale].slice(0, Math.max(0, perCycle));
}

export function industryPrompt(i: { singular: string; plural: string; offer: string }): { system: string; prompt: string } {
  return {
    system: "You write Facebook/Instagram ad guidance for small-business owners. Plain words, concrete, honest. Never claim guarantees, cures, rankings or awards. Business names must be clearly fictional, ordinary small-business names (not real brands).",
    prompt: `Industry: ${i.plural} (customers come for ${i.offer}).\nWrite:\n- intro: 2 sentences on what makes ${i.singular} ads work on Facebook and Instagram.\n- whatWorks: 4 tips (title + one-sentence detail) specific to ${i.plural}.\n- samples: 4 sample ads for 4 different FICTIONAL ${i.singular} businesses in different US towns, each with a different angle (offer, social proof, problem/solution, seasonal). Write them as templates for a US audience (US spelling, US holidays, dollar prices). Fields: business, city (a US city with state, e.g. "Tulsa, OK"), headline (<=40 chars), primaryText (2-4 sentences, ends with a call to action), hook, offer, cta (button text), angle (one sentence: why it works).`,
  };
}

/** Engine cycle cadence knobs (env INDUSTRY_EXAMPLES_PER_CYCLE default 3, INDUSTRY_EXAMPLES_REFRESH_DAYS default 30). */
export function industryCycleConfig(env: Record<string, string | undefined>): { perCycle: number; refreshDays: number } {
  const n = (k: string, d: number) => { const v = Number(env[k]); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d; };
  return { perCycle: n("INDUSTRY_EXAMPLES_PER_CYCLE", 3), refreshDays: n("INDUSTRY_EXAMPLES_REFRESH_DAYS", 30) || 30 };
}

/** IndexNow body for the site's key file (public/<key>.txt). */
export const INDEXNOW_KEY = "78c8478292a52ad65d0087edc113df99";
export function indexNowBody(siteUrl: string, urls: string[]): { host: string; key: string; keyLocation: string; urlList: string[] } {
  const host = new URL(siteUrl).host;
  return { host, key: INDEXNOW_KEY, keyLocation: `${siteUrl.replace(/\/$/, "")}/${INDEXNOW_KEY}.txt`, urlList: urls };
}
