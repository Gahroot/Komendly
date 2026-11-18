// Web read side of engine-written GalleryPage content + real consented ads per intent page (cached 1h, tag "ad-examples").
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadGalleryAds, type GalleryAd } from "@/lib/ads/gallery";
import { GALLERY_PAGES, galleryPage, matchAds, pageSubstance, type GalleryPageDef } from "@/lib/growth/ad-pages";
import { readIndustryContent, type IndustryContent } from "@/lib/growth/industry-examples";

type Row = { key: string; content: IndustryContent; updatedAt: string };

async function loadAll(): Promise<Row[]> {
  const rows = await prisma.galleryPage.findMany({ select: { key: true, content: true, updatedAt: true } });
  return rows.flatMap((r) => {
    const content = readIndustryContent(r.content);
    return content ? [{ key: r.key, content, updatedAt: r.updatedAt.toISOString() }] : [];
  });
}
const cached = unstable_cache(loadAll, ["gallery-pages-v1"], { revalidate: 3600, tags: ["ad-examples"] });

/** Never throws (missing table / DB outage = no content, pages stay noindex). */
export async function loadGalleryPageContents(): Promise<Row[]> {
  try {
    return await cached();
  } catch (err) {
    console.error("[gallery-pages] load failed", err);
    return [];
  }
}

export interface GalleryPageData {
  page: GalleryPageDef;
  ads: GalleryAd[];
  content: IndustryContent | null;
  updatedAt?: string;
  indexable: boolean;
}

function build(page: GalleryPageDef, all: GalleryAd[], rows: Row[]): GalleryPageData {
  const row = rows.find((r) => r.key === page.key);
  const ads = matchAds(page, all);
  const content = row?.content ?? null;
  const { indexable } = pageSubstance({ realAds: ads.length, samples: content?.samples.length ?? 0, tips: content?.whatWorks.length ?? 0 });
  return { page, ads, content, updatedAt: row?.updatedAt, indexable };
}

export async function loadGalleryPageData(key: string): Promise<GalleryPageData | null> {
  const page = galleryPage(key);
  if (!page) return null;
  const [all, rows] = await Promise.all([loadGalleryAds(), loadGalleryPageContents()]);
  return build(page, all, rows);
}

/** All intent pages with their index state (sitemap, hub, related links). */
export async function loadAllGalleryPageStates(): Promise<GalleryPageData[]> {
  const [all, rows] = await Promise.all([loadGalleryAds(), loadGalleryPageContents()]);
  return GALLERY_PAGES.map((p) => build(p, all, rows));
}
