// Growth system "chrome_ext": the free "Komendly: Remake this ad" Chrome extension (packages/komendly-extension). Pure.

/** Chrome Web Store listing. Empty until the listing is live: the page then says "coming soon" and offers no download. */
export const CHROME_EXTENSION_URL: string = "";

export const CHROME_EXTENSION_PATH = "/tools/chrome-extension";
export const CHROME_EXTENSION_NAME = "Komendly: Remake this ad";

/** What the extension's "Remake for my business" button sends to /remix (see packages/komendly-extension/src/links.ts). */
export interface RemixPrefill {
  adUrl: string | null;
  headline: string | null;
  text: string | null;
  image: string | null;
  page: string | null;
  website: string | null;
}

const MAX = { text: 1000, headline: 200, page: 120, url: 1500 } as const;

const clean = (v: string | null, n: number): string | null => {
  const t = (v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, n);
  return t || null;
};

const httpsUrl = (v: string | null): string | null => {
  const t = (v ?? "").trim();
  if (!t || t.length > MAX.url) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
};

/** "acme.com" / "https://acme.com/x" -> absolute URL; non-web or Facebook/Instagram addresses -> null. */
export function prefillWebsite(raw: string | null): string | null {
  const t = (raw ?? "").trim();
  if (!t || t.length > 300 || /\s/.test(t)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/^https?:$/.test(u.protocol) || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname)) return null;
    if (/(^|\.)(facebook|instagram|fb)\.com$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Reads the extension's /remix params. Null when none of the ad fields are present (normal /remix visit). */
export function parseRemixPrefill(params: URLSearchParams): RemixPrefill | null {
  const p: RemixPrefill = {
    adUrl: httpsUrl(params.get("ad_url")),
    headline: clean(params.get("ad_headline"), MAX.headline),
    text: clean(params.get("ad_text"), MAX.text),
    image: httpsUrl(params.get("ad_image")),
    page: clean(params.get("ad_page"), MAX.page),
    website: prefillWebsite(params.get("website")),
  };
  return p.adUrl || p.headline || p.text || p.image || p.page ? p : null;
}

/** Free ad pack from the user's own site, keeping the extension attribution. */
export function freeAdsFromWebsiteHref(website: string): string {
  const q = new URLSearchParams({ url: website, utm_source: "chrome_ext", utm_medium: "extension", utm_campaign: "remix_website" });
  return `/free-ads?${q.toString()}`;
}
