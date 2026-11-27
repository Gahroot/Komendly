// Browser client for the Google Ads publishing routes (/api/ads/google/*). Types mirror the shared contract
// (goals/paying-custys/google/contract.md). Client-safe: no Next, Prisma or Node imports.

export type GoogleMatch = "PHRASE" | "EXACT";
export type GoogleKeyword = { text: string; match: GoogleMatch };
export type GoogleCampaignKind = "search" | "demand_gen";

export type GeoPick =
  | { kind: "location"; id: string; name: string; type: string; countryCode: string }
  | { kind: "radius"; lat: number; lng: number; miles: number; label: string };

export type GoogleReadiness = {
  billing: "ok" | "missing" | "unknown";
  account: "ok" | "suspended" | "canceled" | "unknown";
  managerLink: "none" | "pending" | "active" | "rejected";
  canPublish: boolean;
  blockers: string[];
};

export type GoogleConnection = {
  mode: "oauth" | "manager";
  email?: string;
  customerId?: string;
  accountName?: string;
  currency?: string;
  timeZone?: string;
  readiness: GoogleReadiness;
};

export type GoogleMetrics = { impressions: number; clicks: number; cost: number; conversions: number; currency: string; since: string };

export type GooglePublishView = {
  id: string;
  kind: GoogleCampaignKind;
  status: "pending" | "published" | "failed";
  campaignId?: string;
  campaignName?: string;
  adCount: number;
  serving: "paused" | "enabled" | "removed" | "unknown";
  policy: "approved" | "under_review" | "disapproved" | "limited" | "unknown";
  policyIssues: string[];
  metrics?: GoogleMetrics;
  googleAdsUrl: string;
  error?: string;
  updatedAt: string;
};

export type GoogleJob = { type: string; status: "queued" | "running" | "succeeded" | "failed"; error?: string };

export type GoogleStatus = {
  available: boolean;
  locked?: "not_paid" | "flag_off";
  /** Komendly may create a Google Ads account for the owner (off until Google allows it). */
  canCreateAccounts?: boolean;
  /** "Sign in with Google" is verified by Google (no "unverified app" warning). */
  oauthVerified?: boolean;
  connection: GoogleConnection | null;
  publishes: GooglePublishView[];
  job?: GoogleJob;
};

export type GoogleAccount = {
  customerId: string;
  name: string;
  currency: string;
  timeZone: string;
  manager: boolean;
  status: string;
  test: boolean;
  loginCustomerId?: string;
};

export type GoogleSearchText = { headlines: string[]; descriptions: string[]; path1: string; path2: string };

export type GoogleDraft = {
  finalUrl: string;
  businessName: string;
  search: GoogleSearchText;
  keywords: GoogleKeyword[];
  geo: { suggested: GeoPick | null };
  /** The business address, when we know it: enables "within X miles of my business". */
  businessLocation?: { lat: number; lng: number; label: string } | null;
  budget: { suggestedDaily: number; currency: string; min: number };
  images: Array<{ adId: string; ratio: string; previewUrl: string }>;
  limits: { headline: number; description: number; path: number; headlinesMax: number; descriptionsMax: number };
};

export type GooglePublishInput = {
  runId: string;
  adIds: string[];
  customerId: string;
  campaigns: GoogleCampaignKind[];
  dailyBudget: number;
  geo: GeoPick[];
  keywords: GoogleKeyword[];
  search: GoogleSearchText;
  finalUrl: string;
  youtubeVideoUrl?: string;
};

/** A failed call. `message` is always safe to show: the server's sentence when it is plain, else our fallback. */
export class GoogleApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "GoogleApiError";
  }
}

/** Server error text, but only when it reads like a sentence for people (no JSON, stack or codes). */
export function plainServerError(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (s.length < 8 || s.length > 220) return fallback;
  if (/[{}[\]<>]|\n|\bat\s+\S+\s*\(|Error:|stack|undefined|null|GoogleAds|gRPC|INVALID_|PERMISSION_|_ERROR\b/.test(s)) return fallback;
  if (!/\s/.test(s)) return fallback; // a bare code like "not_connected"
  return s;
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal }, fallback: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    throw new GoogleApiError("We couldn't reach Komendly. Check your internet and try again.", 0, "network");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: unknown; code?: unknown }) | null;
  if (!res.ok || body === null) {
    const code = body && typeof body.code === "string" ? body.code : undefined;
    throw new GoogleApiError(plainServerError(body?.error, fallback), res.status, code);
  }
  return body;
}

const post = <T>(path: string, body: unknown, fallback: string) => call<T>(path, { method: "POST", body }, fallback);

export const googleApi = {
  status: (runId: string, signal?: AbortSignal) =>
    call<GoogleStatus>(`/api/ads/google/status?runId=${encodeURIComponent(runId)}`, { signal }, "We couldn't load your Google Ads details."),
  connect: (returnTo: string) => post<{ url: string }>("/api/ads/google/connect", { returnTo }, "We couldn't start Google sign-in."),
  accounts: (signal?: AbortSignal) =>
    call<{ accounts: GoogleAccount[] }>("/api/ads/google/accounts", { signal }, "We couldn't load your Google Ads accounts."),
  select: (customerId: string, loginCustomerId?: string) =>
    post<{ ok: true; readiness: GoogleReadiness }>("/api/ads/google/selection", { customerId, loginCustomerId }, "We couldn't pick that account."),
  managerLink: (customerId: string) =>
    post<{ status: "pending" | "active"; acceptUrl: string }>("/api/ads/google/manager-link", { customerId }, "We couldn't send the access request to that account."),
  createAccount: (input: { email: string; currency?: string; timeZone?: string; name?: string }) =>
    post<{ customerId: string; inviteSent: boolean; billingUrl: string }>("/api/ads/google/create-account", input, "We couldn't create your Google Ads account."),
  draft: (runId: string, adIds: string[]) =>
    post<GoogleDraft>("/api/ads/google/draft", { runId, adIds }, "We couldn't prepare your Google ad."),
  geoSearch: (q: string) => post<{ results: GeoPick[] }>("/api/ads/google/geo-search", { q }, "We couldn't search places right now."),
  publish: (input: GooglePublishInput) => post<{ jobId: string }>("/api/ads/google/publish", input, "We couldn't send your ads to Google."),
  activate: (publishId: string, action: "enable" | "pause") =>
    post<{ jobId: string }>("/api/ads/google/activate", { publishId, action }, action === "enable" ? "We couldn't start your ads." : "We couldn't pause your ads."),
  disconnect: () => post<{ ok: true }>("/api/ads/google/disconnect", {}, "We couldn't disconnect Google Ads."),
};
