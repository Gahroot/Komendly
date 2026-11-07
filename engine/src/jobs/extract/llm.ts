// LLM structured extraction from crawled pages (site text treated as untrusted data).
// Three small parallel calls: strategy (text), facts (text), image classification (vision).
import { z } from "zod";
import { AD_GOALS } from "../../../../src/lib/ads/contracts";
import { structured } from "../../providers/structured";
import type { AIProvider, UsageMeter } from "../../providers/types";
import { UNTRUSTED_NOTE, untrusted } from "../../prompts/doctrine";
import type { CrawlResult } from "./crawl";

const Quoted = z.object({ text: z.string(), sourceUrl: z.string(), quote: z.string() });

export const LlmExtractionSchema = z.object({
  brandName: z.string(),
  audience: z.string(),
  mainOffer: z.string(),
  pains: z.array(Quoted).max(8),
  proof: z.array(Quoted.extend({ kind: z.enum(["testimonial", "stat", "logo", "award", "other"]), attribution: z.string().optional() })),
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

const StrategySchema = LlmExtractionSchema.omit({ facts: true, images: true, proof: true });
const ProofSchema = LlmExtractionSchema.pick({ proof: true });
const FactsSchema = LlmExtractionSchema.pick({ facts: true });
const ImagesSchema = LlmExtractionSchema.pick({ images: true });

/** Max images sent for classification (vision tokens dominate latency). */
export const MAX_VISION_IMAGES = 8;

/** Drop boilerplate lines (nav/footer) repeated across pages, keep the homepage whole; cap chars. */
export function trimPages(pages: Array<{ url: string; text: string }>, homeCap = 6000, pageCap = 2600): Array<{ url: string; text: string }> {
  const seen = new Map<string, number>();
  for (const p of pages) for (const l of new Set(p.text.split("\n").map((x) => x.trim()).filter(Boolean))) seen.set(l, (seen.get(l) ?? 0) + 1);
  return pages.map((p, i) => {
    const lines = p.text.split("\n").map((x) => x.trim()).filter((l) => l && (i === 0 || (seen.get(l) ?? 0) < 2 || l.length > 120));
    return { url: p.url, text: lines.join("\n").slice(0, i === 0 ? homeCap : pageCap) };
  });
}

const QUOTE_RULE = `Every item needs sourceUrl (a crawled URL) and "quote": an EXACT verbatim excerpt (5-30 words) copied character-for-character from that page. Items without one are discarded.`;

const STRATEGY_SYSTEM = `You extract ad raw material from a company's website. ${UNTRUSTED_NOTE}
Only what the site says; never invent. ${QUOTE_RULE}
- audience: who buys, specific role/situation, in the site's words; name EVERY buyer segment the site addresses (e.g. first-time buyers, investors). Plain prose only: no quotes or URLs.
- mainOffer: the core thing sold + main promise, plainly.
- pains: buyer frustrations the site speaks to, in buyer words (max 8, most vivid first).
- landingPage: best crawled URL for ad traffic (pricing/signup/product or homepage).
- suggestedGoal: best-fitting ad goal. voice: 1 line on tone.
- colors: give roles to the measured hex values (exact hex; primary = main brand/CTA color).`;

const PROOF_SYSTEM = `You list ALL social proof on a company's website: testimonials, stats, customer logos, awards (do not skip any). ${UNTRUSTED_NOTE}
Only what the site says. ${QUOTE_RULE} For testimonials, "quote" is ONLY the customer's own words; put the person's name/role in "attribution".`;

const FACTS_SYSTEM = `You list claims an ad could safely make (offer, price, guarantee, feature, result) from a company's website. ${UNTRUSTED_NOTE}
Only what the site says. ${QUOTE_RULE}`;

const IMAGES_SYSTEM = `Classify each image by id. hasFace=true if ANY human face is visible (even partial, small or realistic illustration).`;

function pagesList(crawl: CrawlResult): string[] {
  const trimmed = trimPages(crawl.pages.map((p) => ({ url: p.url, text: p.text })));
  return crawl.pages.map((p, i) => untrusted(p.url, `URL: ${p.url}\nTITLE: ${p.title}\nDESCRIPTION: ${p.description}\nTEXT:\n${trimmed[i]?.text ?? ""}`));
}

function pagesBlock(crawl: CrawlResult): string {
  return pagesList(crawl).join("\n\n");
}

/** Homepage alone vs. the other pages, ~20 facts total. */
function factGroups(crawl: CrawlResult): Array<{ pages: string; n: number }> {
  const all = pagesList(crawl);
  if (all.length < 2) return [{ pages: all.join("\n\n"), n: 20 }];
  return [
    { pages: all.slice(0, 1).join("\n\n"), n: 10 },
    { pages: all.slice(1).join("\n\n"), n: 10 },
  ];
}

export async function llmExtract(
  provider: AIProvider,
  crawl: CrawlResult,
  opts: { goal: string; correctionNote?: string; signal?: AbortSignal },
  usage: UsageMeter[],
): Promise<LlmExtraction> {
  const pages = pagesBlock(crawl);
  const note = opts.correctionNote ? `\nUser correction to a previous extraction (follow it when the site supports it):\n"""${opts.correctionNote}"""\n` : "";
  const strategyPrompt = `Requested ad goal: ${opts.goal}${opts.goal === "auto" ? " (pick the best suggestedGoal)" : ""}
Measured brand colors (hex, weight, where): ${JSON.stringify(crawl.colors.slice(0, 8))}
${note}
Crawled pages:
${pages}`;
  const vision = crawl.images.slice(0, MAX_VISION_IMAGES);
  const imgList = vision.map((im, i) => `img${i}: ${im.width}x${im.height} alt="${im.alt.slice(0, 60)}"`).join("\n");

  const [strategy, proof, facts, images] = await Promise.all([
    structured(provider, StrategySchema, { system: STRATEGY_SYSTEM, prompt: strategyPrompt, reasoning: "low", signal: opts.signal }, usage),
    structured(provider, ProofSchema, { system: PROOF_SYSTEM, prompt: `${note}Return {"proof": [...]}.\n\nCrawled pages:\n${pages}`, reasoning: "low", signal: opts.signal }, usage).catch(
      () => ({ proof: [] }),
    ),
    // Facts split by page group into 2 parallel calls (output size drives latency).
    Promise.all(
      factGroups(crawl).map((g) =>
        structured(
          provider,
          FactsSchema,
          { system: FACTS_SYSTEM, prompt: `${note}Return {"facts": [...]}: up to ${g.n} most ad-useful facts, quotes as short as possible.\n\nCrawled pages:\n${g.pages}`, reasoning: "low", signal: opts.signal },
          usage,
        ).catch(() => ({ facts: [] })),
      ),
    ).then((rs) => ({ facts: rs.flatMap((r) => r.facts) })),
    vision.length
      ? structured(
          provider,
          ImagesSchema,
          {
            system: IMAGES_SYSTEM,
            prompt: `Images attached in order:\n${imgList}\nReturn {"images": [{id, kind, hasFace}]} for every id.`,
            images: vision.map((im) => ({ mediaType: "image/jpeg", base64: im.thumb.toString("base64") })),
            reasoning: "low",
            signal: opts.signal,
          },
          usage,
        ).catch(() => ({ images: [] }))
      : Promise.resolve({ images: [] }),
  ]);
  return { ...strategy, proof: proof.proof, facts: facts.facts, images: images.images };
}
