// LLM structured extraction from crawled pages (site text treated as untrusted data).
import { z } from "zod";
import { AD_GOALS } from "../../../src/lib/ads/contracts";
import { structured } from "../../src/providers/structured";
import type { AIProvider, UsageMeter } from "../../src/providers/types";
import { UNTRUSTED_NOTE, untrusted } from "../../src/prompts/doctrine";
import type { CrawlResult } from "../../src/jobs/extract/crawl";

const Quoted = z.object({ text: z.string(), sourceUrl: z.string(), quote: z.string() });

export const LlmExtractionSchema = z.object({
  brandName: z.string(),
  audience: z.string(),
  mainOffer: z.string(),
  pains: z.array(Quoted).max(8),
  proof: z.array(Quoted.extend({ kind: z.enum(["testimonial", "stat", "logo", "award", "other"]) })),
  facts: z.array(z.object({ claim: z.string(), sourceUrl: z.string(), quote: z.string() })),
  landingPage: z.string(),
  suggestedGoal: z.enum(AD_GOALS.filter((g) => g !== "auto") as ["leads", "sales", "awareness", "traffic", "app_installs"]),
  voice: z.string(),
  colors: z.array(z.object({ hex: z.string(), role: z.enum(["primary", "secondary", "accent", "bg", "text"]) })),
  images: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["product", "screenshot", "photo", "illustration", "icon", "other"]),
      hasFace: z.boolean(),
    }),
  ),
});
export type LlmExtraction = z.infer<typeof LlmExtractionSchema>;

const StrategySchema = LlmExtractionSchema.omit({ facts: true });
const FactsSchema = LlmExtractionSchema.pick({ facts: true });

/** Drop boilerplate lines (nav/footer) repeated across pages, keep the homepage whole; cap chars. */
export function trimPages(pages: Array<{ url: string; text: string }>, homeCap = 7000, pageCap = 3500): Array<{ url: string; text: string }> {
  const seen = new Map<string, number>();
  for (const p of pages) for (const l of new Set(p.text.split("\n").map((x) => x.trim()).filter(Boolean))) seen.set(l, (seen.get(l) ?? 0) + 1);
  return pages.map((p, i) => {
    const lines = p.text.split("\n").map((x) => x.trim()).filter((l) => l && (i === 0 || (seen.get(l) ?? 0) < 2 || l.length > 120));
    return { url: p.url, text: lines.join("\n").slice(0, i === 0 ? homeCap : pageCap) };
  });
}

const SYSTEM = `You are a direct-response strategist extracting the raw material for ads from a company's website.
${UNTRUSTED_NOTE}
Rules:
- Extract only what the site actually says. Never invent audience details, pains, numbers, results, testimonials or guarantees.
- Every pain, proof item and fact needs sourceUrl (one of the crawled page URLs) and "quote": an EXACT verbatim excerpt (5-30 words) copied character-for-character from that page's text. Items without a verbatim quote will be discarded.
- pains: the buyer's frustrations/moments the site speaks to, phrased in the buyer's words (max 8, most vivid first).
- proof: testimonials, stats, customer logos, awards as stated on the site.
- facts: every claim an ad could safely make (offer, price, guarantee, feature, result) exactly as supported by the quote.
- audience: who buys, specific (role/situation), from the site's own language.
- mainOffer: the core thing sold and the main promise, plainly.
- landingPage: the best URL to send ad traffic to (from crawled URLs; usually pricing/signup/product page or the homepage).
- suggestedGoal: the most fitting ad goal for this business.
- colors: assign roles to the measured brand colors provided (use the exact hex values given; primary = the main brand/CTA color).
- images: classify each provided image id; hasFace=true if ANY human face (even partial, small or illustrated realistically) is visible.`;

export async function llmExtractV1(
  provider: AIProvider,
  crawl: CrawlResult,
  opts: { goal: string; correctionNote?: string; signal?: AbortSignal },
  usage: UsageMeter[],
): Promise<LlmExtraction> {
  const trimmed = trimPages(crawl.pages.map((p) => ({ url: p.url, text: p.text })));
  const pages = crawl.pages
    .map((p, i) => ({ ...p, text: trimmed[i]?.text ?? "" }))
    .map((p) =>
      untrusted(
        p.url,
        `URL: ${p.url}\nTITLE: ${p.title}\nDESCRIPTION: ${p.description}\nOG: ${JSON.stringify(p.og)}\nTEXT:\n${p.text}`,
      ),
    )
    .join("\n\n");
  const imgs = crawl.images.map((im, i) => `img${i}: ${im.width}x${im.height} alt="${im.alt.slice(0, 80)}" src=${im.sourceUrl}`);
  const prompt = `Requested ad goal: ${opts.goal}${opts.goal === "auto" ? " (pick the best suggestedGoal)" : ""}
Measured brand colors (hex, weight, where): ${JSON.stringify(crawl.colors.slice(0, 8))}
Fonts: ${JSON.stringify(crawl.fonts.map((f) => ({ family: f.family, role: f.role })))}
${opts.correctionNote ? `\nThe user reviewed a previous extraction and asked for this correction (follow it when the site supports it):\n"""${opts.correctionNote}"""\n` : ""}
Images attached after the homepage screenshot, in order: ${imgs.join("; ") || "none"}

Crawled pages:
${pages}`;
  const images = [
    ...(crawl.pages[0]?.screenshot ? [{ mediaType: "image/jpeg", base64: crawl.pages[0].screenshot.toString("base64") }] : []),
    ...crawl.images.map((im) => ({ mediaType: "image/jpeg", base64: im.thumb.toString("base64") })),
  ];
  // Two parallel calls: strategy (+vision on images) and the facts list (text only).
  const [strategy, facts] = await Promise.all([
    structured(
      provider,
      StrategySchema,
      { system: SYSTEM, prompt: `${prompt}\n\nReturn everything EXCEPT facts (another pass extracts facts).`, images, reasoning: "low", signal: opts.signal },
      usage,
    ),
    structured(
      provider,
      FactsSchema,
      { system: SYSTEM, prompt: `${prompt}\n\nReturn ONLY {"facts": [...]}: up to 30 most ad-useful facts, each with an exact verbatim quote.`, reasoning: "low", signal: opts.signal },
      usage,
    ),
  ]);
  return { ...strategy, facts: facts.facts };
}
