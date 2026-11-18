// Web read side of engine-written industry example content (cached 1h, tag "ad-examples").
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { readIndustryContent, type IndustryContent } from "@/lib/growth/industry-examples";

async function loadAll(): Promise<Array<{ industry: string; content: IndustryContent; updatedAt: string }>> {
  const rows = await prisma.industryExample.findMany({ select: { industry: true, content: true, updatedAt: true } });
  return rows.flatMap((r) => {
    const content = readIndustryContent(r.content);
    return content ? [{ industry: r.industry, content, updatedAt: r.updatedAt.toISOString() }] : [];
  });
}

const cached = unstable_cache(loadAll, ["industry-examples-v1"], { revalidate: 3600, tags: ["ad-examples"] });

/** All valid engine-written industry content. Never throws. */
export async function loadIndustryExamples(): Promise<Array<{ industry: string; content: IndustryContent; updatedAt: string }>> {
  try {
    return await cached();
  } catch (err) {
    console.error("[industry-examples] load failed", err);
    return [];
  }
}

export async function loadIndustryExample(slug: string): Promise<IndustryContent | null> {
  return (await loadIndustryExamples()).find((x) => x.industry === slug)?.content ?? null;
}

/** Indexable /ad-examples/<industry> pages: enough real consented ads OR enough engine samples (sitemap, llms.txt, hub). */
export async function loadIndexableIndustryLinks(): Promise<Array<{ slug: string; plural: string; count: number; samples: number; updatedAt?: string }>> {
  const { loadGalleryAds, summarizeIndustries } = await import("@/lib/ads/gallery");
  const { INDUSTRIES, MIN_INDEXABLE_INDUSTRY_ADS } = await import("@/lib/ads/industries");
  const { MIN_INDEXABLE_SAMPLES } = await import("@/lib/growth/industry-examples");
  const [ads, examples] = await Promise.all([loadGalleryAds(), loadIndustryExamples()]);
  const counts = new Map(summarizeIndustries(ads).map((x) => [x.industry.slug, x.count]));
  return INDUSTRIES.flatMap((i) => {
    const count = counts.get(i.slug) ?? 0;
    const ex = examples.find((e) => e.industry === i.slug);
    const samples = ex?.content.samples.length ?? 0;
    return count >= MIN_INDEXABLE_INDUSTRY_ADS || samples >= MIN_INDEXABLE_SAMPLES ? [{ slug: i.slug, plural: i.plural, count, samples, updatedAt: ex?.updatedAt }] : [];
  });
}
