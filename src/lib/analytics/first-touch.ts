/**
 * Attribution: the UTM params, Meta click id (fbclid -> fbc), referrer and landing path of the visit that
 * first brought someone here (kmd_ft, written once) and of the latest attributed visit (kmd_lt, overwritten).
 * Set by middleware in first-party cookies, read at ads sign-up / checkout and stored in AdsEvent.props.
 * Pure helpers: safe in edge middleware and route handlers.
 */
export const FIRST_TOUCH_COOKIE = "kmd_ft";
export const LAST_TOUCH_COOKIE = "kmd_lt";
export const FIRST_TOUCH_MAX_AGE = 60 * 60 * 24 * 90;
/** Meta's own click cookie (fb.1.<ms>.<fbclid>), read by the pixel and by CAPI. */
export const FBC_COOKIE = "_fbc";
export const FBP_COOKIE = "_fbp";

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
type UtmKey = (typeof KEYS)[number];

export type FirstTouch = Partial<Record<UtmKey, string>> & { fbclid?: string; fbc?: string; referrer?: string; landing?: string; at?: string };

const clean = (v: string | null | undefined, max = 100): string | undefined => {
  const s = v?.trim().slice(0, max).replace(/[^\w.\-~:/ ]/g, "");
  return s ? s : undefined;
};

/** Meta's fbc format for a click id first seen at `now`. */
export function fbcFromFbclid(fbclid: string, now: Date): string {
  return `fb.1.${now.getTime()}.${fbclid}`;
}

/** Host of an external referrer (ignores our own host), or undefined. */
function externalReferrer(referrer: string | null | undefined, ownHost: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host && host !== ownHost.replace(/^www\./, "") ? clean(host) : undefined;
  } catch {
    return undefined;
  }
}

/** Attribution from a landing URL (+ Referer header), or null when the visit carries no UTM, fbclid or external referrer. */
export function firstTouchFromUrl(url: URL, now: Date, referrer?: string | null): FirstTouch | null {
  const out: FirstTouch = {};
  for (const k of KEYS) {
    const v = clean(url.searchParams.get(k));
    if (v) out[k] = v;
  }
  const fbclid = clean(url.searchParams.get("fbclid"), 500);
  if (fbclid) {
    out.fbclid = fbclid;
    out.fbc = fbcFromFbclid(fbclid, now);
  }
  const ref = externalReferrer(referrer, url.hostname);
  if (ref) out.referrer = ref;
  if (!out.utm_source && !out.utm_campaign && !out.fbclid && !out.referrer) return null;
  out.landing = clean(url.pathname, 200);
  out.at = now.toISOString();
  return out;
}

export function serializeFirstTouch(ft: FirstTouch): string {
  return encodeURIComponent(JSON.stringify(ft));
}

/** Parse the cookie defensively: it is user-controlled. Unknown keys are dropped, values re-sanitised. */
export function parseFirstTouch(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(decodeURIComponent(raw));
    if (!data || typeof data !== "object") return null;
    const rec = data as Record<string, unknown>;
    const str = (k: string, max = 100) => (typeof rec[k] === "string" ? clean(rec[k] as string, max) : undefined);
    const out: FirstTouch = {};
    for (const k of KEYS) {
      const v = str(k);
      if (v) out[k] = v;
    }
    const fbclid = str("fbclid", 500);
    const fbc = str("fbc", 600);
    const referrer = str("referrer");
    if (fbclid) out.fbclid = fbclid;
    if (fbc) out.fbc = fbc;
    if (referrer) out.referrer = referrer;
    if (!out.utm_source && !out.utm_campaign && !out.fbclid && !out.referrer) return null;
    const landing = str("landing", 200);
    if (landing) out.landing = landing;
    if (typeof rec.at === "string" && !Number.isNaN(Date.parse(rec.at))) out.at = new Date(rec.at).toISOString();
    return out;
  } catch {
    return null;
  }
}
