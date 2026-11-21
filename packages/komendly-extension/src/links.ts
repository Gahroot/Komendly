// Pure: the only URLs this extension opens. Every link carries utm_source=chrome_ext (growth system "chrome_ext").
import type { AdCardInfo } from "./parser";

export const KOMENDLY_ORIGIN = "https://www.komendly.com";
export const UTM_SOURCE = "chrome_ext";
const MAX = { text: 1000, headline: 200, page: 120, url: 1500 } as const;

const cut = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);
const httpsUrl = (s: string | null | undefined) => (s && /^https:\/\//i.test(s) && s.length <= MAX.url ? s : "");

/** "acme.com" / "https://acme.com/x" -> "https://acme.com/x"; anything that isn't a public web address -> null. */
export function normalizeWebsite(raw: string | null | undefined): string | null {
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

/** komendly.com/remix prefilled with the clicked ad + the user's saved website. */
export function buildRemixUrl(ad: AdCardInfo, website: string | null): string {
  const u = new URL("/remix", KOMENDLY_ORIGIN);
  const set = (k: string, v: string) => v && u.searchParams.set(k, v);
  set("ad_url", ad.libraryUrl);
  set("ad_headline", cut(ad.headline, MAX.headline));
  set("ad_text", cut(ad.text, MAX.text));
  set("ad_image", httpsUrl(ad.imageUrl));
  set("ad_page", cut(ad.pageName, MAX.page));
  set("website", normalizeWebsite(website) ?? "");
  u.searchParams.set("utm_source", UTM_SOURCE);
  u.searchParams.set("utm_medium", "extension");
  u.searchParams.set("utm_campaign", "remake_button");
  return u.toString();
}

/** Free Meta ad check for one advertiser (page id, vanity name or page URL). */
export function buildAdCheckUrl(page: string): string {
  const u = new URL("/tools/meta-ad-check", KOMENDLY_ORIGIN);
  u.searchParams.set("page", page.trim().slice(0, 300));
  u.searchParams.set("utm_source", UTM_SOURCE);
  u.searchParams.set("utm_medium", "extension");
  u.searchParams.set("utm_campaign", "popup_ad_check");
  return u.toString();
}

/** Page id from an Ad Library URL (?view_all_page_id=…), else null. */
export function pageIdFromLibraryUrl(url: string | null | undefined): string | null {
  try {
    const id = new URL(url ?? "").searchParams.get("view_all_page_id");
    return id && /^\d{3,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
