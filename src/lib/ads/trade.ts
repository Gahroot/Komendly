// Trade attribution (e.g. roofers): which trade landing page a workspace signed up from. Pure: safe in client
// components, middleware and route handlers. No schema field fits, so the trade lives on AdsEvents: props.trade on
// signed_up / checkout_started / offer events, and one workspace-scoped `trade_tagged` {trade} row read by
// workspaceTrade() (src/lib/ads/trade-server.ts).
import { getIndustry } from "./industries";

/** First-party cookie set by a trade landing page (/free-ads/roofers), read at sign-up and run start. */
export const TRADE_COOKIE = "kmd_trade";
export const TRADE_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
export const ROOFERS = "roofers";

/** A known industry slug (src/lib/ads/industries.ts), lowercased; anything else is null. The cookie is user-controlled. */
export function normalizeTrade(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase().slice(0, 40);
  return slug && getIndustry(slug) ? slug : null;
}

/** "/free-ads/roofers" -> "roofers"; null for any other path. */
export function tradeFromPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const m = /^\/free-ads\/([a-z-]+)\/?$/.exec(path.split("?")[0] ?? "");
  return m ? normalizeTrade(m[1]) : null;
}

/** The trade stored on an AdsEvent's props, or null. */
export function tradeFromEventProps(props: unknown): string | null {
  return props && typeof props === "object" ? normalizeTrade((props as Record<string, unknown>).trade) : null;
}
