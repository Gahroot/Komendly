// Meta Ad Library scanner (shared by growth systems ad_check and ad_watch). Parser + contract:
// src/lib/growth/adlib-scan.ts. Web never fetches the Ad Library: it queues AdJob `adlib_scan` rows that the engine fills.
//
// How it fetches: plain fetch() of the public Ad Library website (no browser, no login, no Graph API: the API returns
// no US commercial ads). Meta first answers with a tiny JS challenge page ("POST /__rd_verify_...; reload"); we POST
// it, keep the `rd_challenge` cookie and fetch again, then parse the server-rendered Relay JSON. One process-wide
// queue spaces requests >= 3 s apart (MIN_FETCH_INTERVAL_MS), including the challenge POST.
//
// Resolving: a page id is used as-is; a Facebook Page URL (slug) or a website is resolved with an Ad Library keyword
// search (q=<slug> or q=<domain>), keeping only results whose Page URL has that slug / whose ads land on that domain
// (a Page's public profile id often differs from its Ad Library page id, so the id is never guessed).
//
// Cache (no schema change): AdsEvent name "adlib_scan", props { target, pageId, scan, total }, reused for 24 h
// (CACHE_MS) and looked up by target key ("website:x.com", "facebook:slug", "page_id:123") or page id. A target that
// resolved to no page is cached 6 h as { target, pageId: null, scan: null }.
import {
  AD_LIBRARY_ORIGIN, adLibraryChallengePath, adLibraryPageUrl, adLibraryResultCount, adLibrarySearchUrl,
  parseAdLibraryPage, parseAdLibrarySearch, parseAdlibTarget, pickPageFromSearch, type AdlibPageScan, type AdlibTarget,
} from "../../../src/lib/growth/adlib-scan";
import { UA } from "../net/ssrf";

export const MIN_FETCH_INTERVAL_MS = 3000;
export const CACHE_MS = 24 * 3_600_000;
export const MISS_CACHE_MS = 6 * 3_600_000;
export const ADLIB_EVENT = "adlib_scan";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface AdlibFetcher {
  /** GET an Ad Library / facebook.com URL as HTML, clearing Meta's JS challenge when shown. Throws on failure. */
  html(url: string, opts?: { headers?: Record<string, string> }): Promise<string>;
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Sec-CH-UA-Mobile": "?0",
  "Sec-CH-UA-Platform": '"macOS"',
};

/** Rate-limited, cookie-keeping fetcher. Tests inject fetch/sleep/now. */
export function createAdlibFetcher(opts: { fetch?: FetchFn; sleep?: (ms: number) => Promise<void>; now?: () => number; minIntervalMs?: number; timeoutMs?: number } = {}): AdlibFetcher {
  const f = opts.fetch ?? ((u, i) => fetch(u, i));
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const gap = opts.minIntervalMs ?? MIN_FETCH_INTERVAL_MS;
  const cookies = new Map<string, string>();
  let nextAt = 0;
  let chain: Promise<void> = Promise.resolve();

  /** Serialize all requests and keep them >= gap apart. */
  const slot = () => {
    const p = chain.then(async () => {
      const wait = nextAt - now();
      if (wait > 0) await sleep(wait);
      nextAt = now() + gap;
    });
    chain = p.catch(() => undefined);
    return p;
  };

  const request = async (url: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
    await slot();
    const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await f(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000), headers: { ...BROWSER_HEADERS, ...(init.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) } });
    const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const m = /^([^=;\s]+)=([^;]*)/.exec(c);
      if (m?.[1]) cookies.set(m[1], m[2] ?? "");
    }
    return res;
  };

  return {
    async html(url, o = {}) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await request(url, { headers: o.headers });
        const body = await res.text();
        const challenge = adLibraryChallengePath(body);
        if (challenge) {
          await request(`${AD_LIBRARY_ORIGIN}${challenge}`, { method: "POST" });
          continue;
        }
        if (!res.ok) throw new Error(`ad library HTTP ${res.status}`);
        return body;
      }
      throw new Error("ad library challenge not cleared");
    },
  };
}

let shared: AdlibFetcher | null = null;
/** Process-wide fetcher (one rate limit for every caller in the engine). */
export const defaultAdlibFetcher = () => (shared ??= createAdlibFetcher());

/** Minimal Prisma surface (engine client satisfies it). */
export interface AdlibDb {
  adsEvent: {
    findFirst(a: { where: object; orderBy: object; select: { props: true } }): Promise<{ props: unknown } | null>;
    create(a: { data: { name: string; props: object } }): Promise<unknown>;
  };
}

export interface AdlibScanResult { scan: AdlibPageScan; /** Meta's active-ad count (may exceed scan.liveAds.length). */ total: number; cached: boolean }

/** Facebook Page HTML -> its display name (og:title minus " | City ST"), for the fallback search. */
export function pageNameFromFacebookHtml(html: string): string | null {
  const m = /<meta property="og:title" content="([^"]+)"/.exec(html);
  if (!m?.[1]) return null;
  const name = m[1].replace(/&amp;/g, "&").replace(/&#039;|&#x27;/g, "'").replace(/&quot;/g, '"').split(" | ")[0]?.trim();
  return name && !/^(facebook|log in|error)/i.test(name) ? name : null;
}

/** Target -> Ad Library page id, or null when no active ad points to it (never a guess). */
export async function resolvePageId(fetcher: AdlibFetcher, target: AdlibTarget): Promise<string | null> {
  if (target.kind === "page_id") return target.value;
  const search = async (q: string) => pickPageFromSearch(parseAdLibrarySearch(await fetcher.html(adLibrarySearchUrl(q))), target);
  if (target.kind === "website") {
    const label = target.value.split(".").slice(0, -1).join(" ").replace(/-/g, " ");
    return (await search(target.value)) ?? (label && label !== target.value ? await search(label) : null);
  }
  // Facebook: numeric profile ids are sometimes the Ad Library page id; slugs are found via search on the slug.
  if (/^\d+$/.test(target.value)) {
    const html = await fetcher.html(adLibraryPageUrl(target.value));
    if ((adLibraryResultCount(html) ?? 0) > 0) return target.value;
  }
  const bySlug = await search(target.value);
  if (bySlug) return bySlug;
  const page = await fetcher.html(`https://www.facebook.com/${encodeURIComponent(target.value)}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Komendly/1.0; +https://www.komendly.com)", "Sec-Fetch-Site": "none" } }).catch(() => "");
  const name = pageNameFromFacebookHtml(page);
  return name ? search(name) : null;
}

async function cached(db: AdlibDb, where: object, sinceMs: number, now: Date): Promise<Record<string, unknown> | null> {
  const row = await db.adsEvent.findFirst({ where: { name: ADLIB_EVENT, createdAt: { gte: new Date(now.getTime() - sinceMs) }, ...where }, orderBy: { createdAt: "desc" }, select: { props: true } });
  return row?.props && typeof row.props === "object" ? (row.props as Record<string, unknown>) : null;
}

/** Scan one page (by id, Facebook Page URL or website) with the 24 h cache. null = no active ads/page found. Throws when the Ad Library can't be read. */
export async function scanPageDetailed(db: AdlibDb, pageIdOrUrl: string, opts: { fetcher?: AdlibFetcher; now?: Date } = {}): Promise<AdlibScanResult | null> {
  const target = parseAdlibTarget(pageIdOrUrl);
  if (!target) return null;
  const now = opts.now ?? new Date();
  const byTarget = await cached(db, { props: { path: ["target"], equals: target.key } }, CACHE_MS, now);
  if (byTarget) {
    if (byTarget.scan) return { scan: byTarget.scan as AdlibPageScan, total: Number(byTarget.total) || 0, cached: true };
    if (byTarget.pageId === null && (await cached(db, { props: { path: ["target"], equals: target.key } }, MISS_CACHE_MS, now))) return null;
  }
  const fetcher = opts.fetcher ?? defaultAdlibFetcher();
  const pageId = await resolvePageId(fetcher, target);
  if (!pageId) {
    await db.adsEvent.create({ data: { name: ADLIB_EVENT, props: { target: target.key, pageId: null, scan: null } } });
    return null;
  }
  if (target.kind !== "page_id") {
    const byPage = await cached(db, { props: { path: ["pageId"], equals: pageId } }, CACHE_MS, now);
    if (byPage?.scan) {
      await db.adsEvent.create({ data: { name: ADLIB_EVENT, props: { target: target.key, pageId, scan: byPage.scan as object, total: Number(byPage.total) || 0 } } });
      return { scan: byPage.scan as AdlibPageScan, total: Number(byPage.total) || 0, cached: true };
    }
  }
  const html = await fetcher.html(adLibraryPageUrl(pageId));
  const total = adLibraryResultCount(html);
  if (total === null) throw new Error("ad library returned no results payload");
  const scan = parseAdLibraryPage(html, pageId, now);
  await db.adsEvent.create({ data: { name: ADLIB_EVENT, props: { target: target.key, pageId, scan: scan as unknown as object, total } } });
  return { scan, total, cached: false };
}

/** Shared scanner entry point (feature #1 ad_check, feature #2 ad_watch). See scanPageDetailed. */
export async function scanPage(db: AdlibDb, pageIdOrUrl: string): Promise<AdlibPageScan | null> {
  return (await scanPageDetailed(db, pageIdOrUrl))?.scan ?? null;
}
