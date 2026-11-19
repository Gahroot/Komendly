// Store content read from the Shopify Admin API, attached to an extract job so ads can be made even when the
// storefront is password-protected (every dev store, and shops that haven't launched yet).
// Shared with the engine (engine/Dockerfile COPY): pure TS + zod only.
import { z } from "zod";

export const ShopifyStoreDataSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(2000).default(""),
  storeUrl: z.string().url().max(500),
  products: z
    .array(
      z.object({
        title: z.string().max(300),
        url: z.string().url().max(800),
        description: z.string().max(1500).default(""),
        price: z.string().max(60).nullable().default(null),
        productType: z.string().max(120).default(""),
        imageUrl: z.string().url().max(1500).nullable().default(null),
        imageAlt: z.string().max(300).default(""),
      }),
    )
    .max(12),
});
export type ShopifyStoreData = z.infer<typeof ShopifyStoreDataSchema>;

export const STORE_DATA_QUERY = `query($n: Int!) { shop { name description } products(first: $n, sortKey: UPDATED_AT, reverse: true, query: "status:active") { nodes { title handle description(truncateAt: 1200) productType onlineStoreUrl priceRangeV2 { minVariantPrice { amount currencyCode } } featuredMedia { preview { image { url altText } } } } } }`;
export interface StoreDataResponse {
  shop: { name: string; description: string | null };
  products: { nodes: Array<{ title: string; handle: string; description: string | null; productType: string | null; onlineStoreUrl: string | null; priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } } | null; featuredMedia: { preview: { image: { url: string; altText: string | null } | null } | null } | null }> };
}

/** Public product URL; password-protected stores return onlineStoreUrl null, so fall back to /products/<handle>. */
export function productUrl(p: { handle: string; onlineStoreUrl: string | null }, storeUrl: string): string {
  return p.onlineStoreUrl ?? `${storeUrl.replace(/\/+$/, "")}/products/${encodeURIComponent(p.handle)}`;
}

function money(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function storeDataFrom(d: StoreDataResponse, storeUrl: string, limit = 8): ShopifyStoreData {
  const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  return ShopifyStoreDataSchema.parse({
    name: clip(d.shop.name, 200) || new URL(storeUrl).hostname,
    description: clip(d.shop.description, 2000),
    storeUrl,
    products: d.products.nodes.slice(0, limit).map((p) => {
      const img = p.featuredMedia?.preview?.image ?? null;
      const m = p.priceRangeV2?.minVariantPrice;
      return {
        title: clip(p.title, 300),
        url: productUrl(p, storeUrl),
        description: clip(p.description, 1500),
        price: m ? money(m.amount, m.currencyCode) : null,
        productType: clip(p.productType, 120),
        imageUrl: img?.url ?? null,
        imageAlt: clip(img?.altText, 300),
      };
    }),
  });
}

/** Shopify storefront password gate ("Opening soon" / enter password). */
export function isPasswordGateUrl(url: string): boolean {
  try {
    return /^\/password\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Page texts (home + one per product) standing in for a crawl the password gate blocked. */
export function storePages(d: ShopifyStoreData, focusUrl?: string): Array<{ url: string; title: string; description: string; text: string }> {
  const focus = d.products.find((p) => p.url === focusUrl);
  const products = focus ? [focus, ...d.products.filter((p) => p !== focus)] : d.products;
  const line = (p: ShopifyStoreData["products"][number]) => `${p.title}${p.price ? ` (from ${p.price})` : ""}${p.productType ? ` - ${p.productType}` : ""}`;
  const home = {
    url: d.storeUrl,
    title: d.name,
    description: d.description,
    text: [d.name, d.description, products.length ? `Products:\n${products.map(line).join("\n")}` : ""].filter(Boolean).join("\n\n"),
  };
  const pages = products.slice(0, 6).map((p) => ({
    url: p.url,
    title: `${p.title} - ${d.name}`,
    description: p.description.slice(0, 300),
    text: [p.title, p.price ? `Price: from ${p.price}` : "", p.productType ? `Type: ${p.productType}` : "", p.description].filter(Boolean).join("\n"),
  }));
  return focus ? [pages[0]!, home, ...pages.slice(1)] : [home, ...pages];
}
