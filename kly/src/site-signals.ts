// "New business / new site" signals from FREE public sources, for a lead's own domain:
//   RDAP (rdap.org bootstrap; registration date)      -> new_website
//   /products.json (public Shopify storefront feed)   -> new_shopify_store
//   homepage text ("grand opening", "now open", ...)  -> grand_opening / new_location
//   sitemap.xml <lastmod> burst                        -> site_refresh
// Parsers are pure (unit-tested on fixtures). The fetch layer is injected, checks robots.txt, and is one polite request
// per host at a time; nothing here runs in the hot sending path. Certificate Transparency (crt.sh) is already the
// new_business system (src/new-business.ts); Google Business "new listing" has no free source in this repo, see docs.
import type { LeadSignal } from "./signals";

export const NEW_DOMAIN_DAYS = 120;
export const NEW_SHOPIFY_DAYS = 90;
export const UA = "KomendlyBot/1.0 (+https://www.komendly.com)";
const DAY = 86_400_000;
const mk = (kind: LeadSignal["kind"], evidence: string, source: string, opener: string | null, now: Date): LeadSignal => ({ kind, evidence, source, opener, detectedAt: now.toISOString() });
const monthYear = (d: Date) => d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** RDAP JSON -> registration date (event "registration"), null if absent. */
export function rdapRegistration(json: unknown): Date | null {
  const ev = (json as { events?: { eventAction?: string; eventDate?: string }[] } | null)?.events;
  const r = ev?.find((e) => e.eventAction === "registration")?.eventDate;
  const d = r ? new Date(r) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

export function detectNewDomain(registered: Date | null, now: Date): LeadSignal | null {
  if (!registered || registered > now) return null;
  const age = Math.floor((now.getTime() - registered.getTime()) / DAY);
  if (age > NEW_DOMAIN_DAYS) return null;
  return mk("new_website", `domain registered ${registered.toISOString().slice(0, 10)} (${age} days ago, RDAP)`, "rdap", `I noticed your website is new (the domain was registered in ${monthYear(registered)}).`, now);
}

interface ShopifyProduct { created_at?: string; published_at?: string; updated_at?: string }

/** Shopify /products.json: store exists, and when its OLDEST product was created (a lower bound on store age). */
export function detectNewShopify(json: unknown, now: Date): LeadSignal | null {
  const products = (json as { products?: ShopifyProduct[] } | null)?.products;
  if (!Array.isArray(products) || !products.length) return null;
  const dates = products.map((p) => new Date(p.created_at ?? p.published_at ?? "")).filter((d) => Number.isFinite(d.getTime()));
  if (!dates.length) return null;
  const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
  const age = Math.floor((now.getTime() - oldest.getTime()) / DAY);
  // /products.json is paginated newest-first by default (<= 30 items): only trust "new" when the page is not full.
  if (age > NEW_SHOPIFY_DAYS || products.length >= 30) return null;
  return mk("new_shopify_store", `Shopify store; its ${products.length} products were all created within ${age} days (oldest ${oldest.toISOString().slice(0, 10)})`, "shopify_products_json", `I noticed your Shopify store is new (your first products were added in ${monthYear(oldest)}).`, now);
}

const OPENING_RE = /\b(grand opening|now open|we(?:'| a)?re (?:now )?open|just opened|opening soon|recently opened|newly opened)\b/i;
const LOCATION_RE = /\b(new location|second location|now (?:open )?in [A-Z][a-z]+|we(?:'| ha)?ve moved|our newest location|now serving)\b/i;
const NEWSITE_RE = /\b(new website|website (?:is )?(?:coming soon|under construction)|just launched)\b/i;

/** Homepage visible text -> opening / new-location phrases. Quotes the matched phrase, never more. */
export function detectHomepageNews(text: string, now: Date): LeadSignal[] {
  const out: LeadSignal[] = [];
  const o = OPENING_RE.exec(text);
  if (o) out.push(mk("grand_opening", `homepage says "${o[0]}"`, "site_homepage", `I saw "${o[0]}" on your website.`, now));
  const l = LOCATION_RE.exec(text);
  if (l && !o) out.push(mk("new_location", `homepage says "${l[0]}"`, "site_homepage", `I saw "${l[0]}" on your website.`, now));
  const n = NEWSITE_RE.exec(text);
  if (n && !o && !l) out.push(mk("site_refresh", `homepage says "${n[0]}"`, "site_homepage", null, now));
  return out;
}

/** sitemap.xml -> a burst of recent <lastmod> dates (>= 5 pages in the last 21 days, and >= half of dated pages). */
export function detectSitemapRefresh(xml: string, now: Date): LeadSignal | null {
  const dates = [...xml.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)].map((m) => new Date(m[1] as string)).filter((d) => Number.isFinite(d.getTime()));
  if (dates.length < 5) return null;
  const recent = dates.filter((d) => now.getTime() - d.getTime() <= 21 * DAY && d <= now);
  if (recent.length < 5 || recent.length < dates.length / 2) return null;
  const newest = new Date(Math.max(...recent.map((d) => d.getTime())));
  return mk("site_refresh", `${recent.length} of ${dates.length} sitemap pages modified in the last 21 days (newest ${newest.toISOString().slice(0, 10)})`, "sitemap_lastmod", "I noticed your website was recently updated.", now);
}

/** robots.txt (for `*` and KomendlyBot): may `path` be fetched? No robots / unreadable = allowed. Simple prefix rules. */
export function robotsAllows(robots: string | null, path: string): boolean {
  if (!robots) return true;
  let applies = false;
  let best: { len: number; allow: boolean } | null = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = (m[1] as string).toLowerCase();
    const v = (m[2] as string).trim();
    if (k === "user-agent") { applies = v === "*" || /komendly/i.test(v); continue; }
    if (!applies || (k !== "allow" && k !== "disallow") || !v) continue;
    if (path.startsWith(v) && (!best || v.length >= best.len)) best = { len: v.length, allow: k === "allow" };
  }
  return best ? best.allow : true;
}

export type SiteFetch = (url: string) => Promise<{ status: number; text: string }>;

/**
 * Run every free check for one domain. `fetch` is injected (tests use fixtures; the default is a plain GET with our UA).
 * Each check is isolated: a failure yields no signal for that check. Own-site paths obey robots.txt; RDAP is a public API.
 */
export async function detectSiteSignals(domain: string, fetch: SiteFetch, now: Date, homeText?: string): Promise<LeadSignal[]> {
  const base = `https://${domain}`;
  const out: LeadSignal[] = [];
  const safe = async <T>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
  const robots = await safe(async () => { const r = await fetch(`${base}/robots.txt`); return r.status === 200 ? r.text : null; });
  const allowed = (p: string) => robotsAllows(robots, p);
  const rdap = await safe(async () => { const r = await fetch(`https://rdap.org/domain/${domain}`); return r.status === 200 ? JSON.parse(r.text) as unknown : null; });
  const nd = detectNewDomain(rdapRegistration(rdap), now);
  if (nd) out.push(nd);
  if (allowed("/products.json")) {
    const p = await safe(async () => { const r = await fetch(`${base}/products.json?limit=30`); return r.status === 200 ? JSON.parse(r.text) as unknown : null; });
    const s = detectNewShopify(p, now);
    if (s) out.push(s);
  }
  const text = homeText ?? (allowed("/") ? await safe(async () => { const r = await fetch(`${base}/`); return r.status === 200 ? r.text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : ""; }) : "");
  if (text) out.push(...detectHomepageNews(text, now));
  if (allowed("/sitemap.xml")) {
    const x = await safe(async () => { const r = await fetch(`${base}/sitemap.xml`); return r.status === 200 ? r.text : null; });
    const s = x ? detectSitemapRefresh(x, now) : null;
    if (s) out.push(s);
  }
  return out;
}
