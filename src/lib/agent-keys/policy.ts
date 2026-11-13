// Personal API keys for agents ("Komendly for agents"): format and per-route policy. Pure and edge-safe (middleware imports it).

export const API_KEY_PREFIX = "kmd_";
const KEY_RE = /^kmd_[0-9A-Za-z]{40}$/;

export const UPGRADE_URL = "https://www.komendly.com/pricing?utm_source=mcp";
/** Requests per key per minute, and job-creating calls per key per hour. */
export const API_KEY_LIMITS = { perMinute: 120, jobsPerHour: 30 } as const;
/** Set by middleware on bearer requests (overwrites anything the client sent): "<METHOD> <pathname>". */
export const ROUTE_HEADER = "x-kmd-route";
/** Optional client hint for analytics: "cli" | "mcp"; anything else counts as "api". */
export const CLIENT_HEADER = "x-komendly-client";

export type ApiVia = "mcp" | "cli" | "api";

export function isApiKeyFormat(raw: string): boolean {
  return KEY_RE.test(raw);
}

/** The kmd_ key from an Authorization header, or null (other schemes and malformed keys are ignored). */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  const key = m?.[1];
  return key && isApiKeyFormat(key) ? key : null;
}

export function viaFrom(header: string | null | undefined): ApiVia {
  return header === "cli" || header === "mcp" ? header : "api";
}

const REFUSED_PREFIXES = [
  "/api/account/api-keys", // key management is cookie-session only
  "/api/admin",
  "/api/auth/", // login/logout/register, profile + email changes, email verification
  "/api/ads/auth/",
];

/** Routes an API key may never be used on (the human must use the web app). */
export function isRefusedForApiKey(pathname: string): boolean {
  return REFUSED_PREFIXES.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}

const JOB_ROUTES = [
  /^\/api\/ads\/runs\/?$/,
  /^\/api\/ads\/runs\/[^/]+\/(retry|confirm)\/?$/,
  /^\/api\/studio\/sessions\/[^/]+\/messages\/?$/,
  /^\/api\/studio\/sessions\/from-ad\/?$/,
  /^\/api\/studio\/remix\/?$/,
  /^\/api\/studio\/launch\/?$/,
  /^\/api\/ads\/gifts\/?$/,
];

/** "<METHOD> <path>" that queues paid work (counts toward the per-key hourly job limit). */
export function isJobCreatingRoute(route: string | null | undefined): boolean {
  if (!route) return false;
  const [method, path] = route.split(" ");
  return method === "POST" && !!path && JOB_ROUTES.some((re) => re.test(path));
}
