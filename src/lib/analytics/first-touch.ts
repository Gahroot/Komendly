/**
 * First-touch attribution: the UTM params (and landing path) of the visit that first brought someone here.
 * Set once by middleware in a first-party cookie, read at ads sign-up and stored in AdsEvent.props.
 * Pure helpers: safe in edge middleware and route handlers.
 */
export const FIRST_TOUCH_COOKIE = "kmd_ft";
export const FIRST_TOUCH_MAX_AGE = 60 * 60 * 24 * 90;

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
type UtmKey = (typeof KEYS)[number];

export type FirstTouch = Partial<Record<UtmKey, string>> & { landing?: string; at?: string };

const clean = (v: string | null | undefined, max = 100): string | undefined => {
  const s = v?.trim().slice(0, max).replace(/[^\w.\-~:/ ]/g, "");
  return s ? s : undefined;
};

/** UTM params from a landing URL, or null when the visit carries no utm_source/utm_campaign. */
export function firstTouchFromUrl(url: URL, now: Date): FirstTouch | null {
  const out: FirstTouch = {};
  for (const k of KEYS) {
    const v = clean(url.searchParams.get(k));
    if (v) out[k] = v;
  }
  if (!out.utm_source && !out.utm_campaign) return null;
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
    const out: FirstTouch = {};
    for (const k of KEYS) {
      const v = typeof rec[k] === "string" ? clean(rec[k] as string) : undefined;
      if (v) out[k] = v;
    }
    if (!out.utm_source && !out.utm_campaign) return null;
    if (typeof rec.landing === "string") out.landing = clean(rec.landing, 200);
    if (typeof rec.at === "string" && !Number.isNaN(Date.parse(rec.at))) out.at = new Date(rec.at).toISOString();
    return out;
  } catch {
    return null;
  }
}
