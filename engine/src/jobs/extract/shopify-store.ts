// Shopify storefronts behind the password page (every dev store, unlaunched shops): the crawl only sees the gate,
// so the page text and product photos come from the Admin API data the web app attached to the job.
// The gate page still carries the theme's colours, fonts and logo, so those are kept from the crawl.
import { isPasswordGateUrl, ShopifyStoreDataSchema, storePages, type ShopifyStoreData } from "../../../../src/lib/shopify/store-data";
import { DEFAULT_LIMITS, downloadImages, hasReadableContent, type CrawlResult, type CrawledImage } from "./crawl";

export function shopifyStoreFrom(payload: unknown): ShopifyStoreData | null {
  const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>).shopifyStore : undefined;
  if (!p) return null;
  const r = ShopifyStoreDataSchema.safeParse(p);
  return r.success ? r.data : null;
}

/** Use the store data only when the crawl was blocked (password gate, nothing readable, or no crawl at all). */
export function needsStoreData(crawl: CrawlResult | null): boolean {
  return !crawl || isPasswordGateUrl(crawl.finalUrl) || !hasReadableContent(crawl);
}

export async function withStoreData(
  crawl: CrawlResult | null,
  store: ShopifyStoreData,
  runUrl: string,
  signal?: AbortSignal,
  download: typeof downloadImages = downloadImages,
): Promise<CrawlResult> {
  const focus = store.products.some((p) => p.url === runUrl) ? runUrl : undefined;
  const pages = storePages(store, focus).map((p) => ({ ...p, og: {} as Record<string, string> }));
  const candidates = store.products.filter((p) => p.imageUrl).map((p) => ({ src: p.imageUrl!, w: 0, h: 0, alt: p.imageAlt || p.title }));
  const images: CrawledImage[] = candidates.length ? await download(candidates, DEFAULT_LIMITS, Date.now() + 20_000, signal).catch(() => []) : [];
  return {
    finalUrl: focus ?? store.storeUrl,
    pages,
    colors: crawl?.colors ?? [],
    fonts: crawl?.fonts ?? [],
    logo: crawl?.logo ?? null,
    images: images.length ? images : (crawl?.images ?? []),
  };
}
