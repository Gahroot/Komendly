// Soft business qualification for free-pack sign-ups (Hormozi: aim the lead magnet at the exact buyer). Pure TS, safe in
// client components and route handlers. NOTHING here blocks anyone: the result is stored as AdsEvent props on
// `signed_up` so the scoreboard can separate real businesses from tire-kickers.

/** First-party cookie the free-ads form sets with the host of the website the visitor typed. */
export const SITE_COOKIE = "kmd_site";
/** Value of the trade cookie when the visitor picks "Other" in the trade picker. */
export const OTHER_TRADE = "other";

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com", "yandex.com", "comcast.net", "att.net", "verizon.net", "sbcglobal.net", "cox.net",
]);
// Hosts that are a profile, blog or site-builder subdomain rather than the business's own domain.
const NOT_OWN_DOMAIN = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "yelp.com", "google.com", "linktr.ee",
  "wordpress.com", "blogspot.com", "medium.com", "substack.com", "wixsite.com", "weebly.com", "square.site", "godaddysites.com", "github.io", "netlify.app", "vercel.app",
  "example.com", "localhost",
];

/** Lowercased registrable-ish host of an email or URL ("https://www.Acme-Roofing.com/x" -> "acme-roofing.com"), or null. */
export function hostOf(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  const afterAt = s.includes("@") && !s.includes("/") ? s.slice(s.lastIndexOf("@") + 1) : s;
  const host = afterAt.replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0]!.replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

export function isFreeMailDomain(host: string | null): boolean {
  return host !== null && FREE_MAIL.has(host);
}

/** True for a site on its own domain (not a social profile, builder subdomain or placeholder). */
export function isOwnBusinessDomain(host: string | null): boolean {
  if (!host) return false;
  if (isFreeMailDomain(host)) return false;
  return !NOT_OWN_DOMAIN.some((d) => host === d || host.endsWith(`.${d}`));
}

export interface BusinessSignals {
  /** Best guess: a real business (own-domain website, or at least a work email). */
  is_business: boolean;
  website_own_domain: boolean;
  work_email: boolean;
  /** The work-email domain matches the website domain. */
  email_matches_site: boolean;
  /** Visitor named a trade in the picker (any value, incl. "other"). */
  trade_picked: boolean;
  website_host: string | null;
}

export function businessSignals(input: { email: string; website?: string | null; tradePicked?: boolean }): BusinessSignals {
  const emailHost = hostOf(input.email);
  const siteHost = hostOf(input.website);
  const workEmail = emailHost !== null && isOwnBusinessDomain(emailHost);
  const siteOwn = isOwnBusinessDomain(siteHost);
  const sameRoot = (a: string | null, b: string | null) => !!a && !!b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));
  return {
    is_business: siteOwn || workEmail,
    website_own_domain: siteOwn,
    work_email: workEmail,
    email_matches_site: workEmail && siteOwn && sameRoot(emailHost, siteHost),
    trade_picked: Boolean(input.tradePicked),
    website_host: siteHost,
  };
}
