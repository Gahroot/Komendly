// Minimal Google Ads REST client over fetch (googleads.googleapis.com/<version>). Framework-free.
// Headers: Authorization Bearer (refreshed from a refresh token), login-customer-id when acting through a manager,
// developer-token only when GOOGLE_ADS_DEVELOPER_TOKEN is set (Google retired developer tokens on 2026-09-09;
// API access now comes from the Cloud project).
import { GOOGLE_ADS_DEFAULT_VERSION, GoogleAdsApiError, type FetchLike } from "./types";

export interface AccessTokenSource { token(signal?: AbortSignal): Promise<string> }

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Refresh-token backed access tokens, cached until a minute before expiry. */
export function refreshTokenSource(o: { clientId: string; clientSecret: string; refreshToken: string; fetch?: FetchLike; now?: () => number }): AccessTokenSource {
  const f = o.fetch ?? fetch;
  const now = o.now ?? Date.now;
  let cached: { token: string; until: number } | null = null;
  return {
    async token(signal) {
      if (cached && cached.until > now()) return cached.token;
      const res = await f(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: o.refreshToken, client_id: o.clientId, client_secret: o.clientSecret }).toString(),
        signal,
      });
      const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
      if (!res.ok || !json.access_token) {
        const revoked = json.error === "invalid_grant";
        throw new GoogleAdsApiError(revoked ? "Google access was removed or expired. Reconnect Google Ads." : `Google sign-in refresh failed (${json.error ?? res.status})`, res.status, revoked ? ["invalid_grant"] : []);
      }
      cached = { token: json.access_token, until: now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000 };
      return cached.token;
    },
  };
}

export interface GoogleAdsClientOptions {
  auth: AccessTokenSource;
  version?: string;
  developerToken?: string;
  loginCustomerId?: string | null;
  fetch?: FetchLike;
  baseUrl?: string;
}

interface GoogleAdsErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ "@type"?: string; requestId?: string; errors?: Array<{ message?: string; errorCode?: Record<string, string>; trigger?: unknown }> }>;
  };
}

/** Readable message from a Google Ads REST error body (GoogleAdsFailure details first). */
export function parseApiError(status: number, body: unknown): GoogleAdsApiError {
  const e = (body as GoogleAdsErrorBody | null)?.error;
  const detail = e?.details?.find((d) => Array.isArray(d.errors));
  const errs = detail?.errors ?? [];
  const codes = errs.flatMap((x) => Object.entries(x.errorCode ?? {}).map(([k, v]) => `${k}.${v}`));
  const msgs = [...new Set(errs.map((x) => x.message).filter((m): m is string => !!m))];
  const message = (msgs.length ? msgs.join(" ") : e?.message || `Google Ads request failed (${status})`).slice(0, 600);
  return new GoogleAdsApiError(message, status, codes, detail?.requestId);
}

export type MutateOperation = Record<string, unknown>;
export interface MutateResult { [k: string]: { resourceName?: string } | undefined }

export class GoogleAdsClient {
  readonly version: string;
  private readonly f: FetchLike;
  private readonly base: string;
  constructor(private readonly o: GoogleAdsClientOptions) {
    this.version = o.version || GOOGLE_ADS_DEFAULT_VERSION;
    this.f = o.fetch ?? fetch;
    this.base = o.baseUrl ?? "https://googleads.googleapis.com";
  }

  get loginCustomerId(): string | null { return this.o.loginCustomerId ?? null; }

  /** Same credentials, another login-customer-id (null = none). */
  withLogin(loginCustomerId: string | null | undefined): GoogleAdsClient {
    return new GoogleAdsClient({ ...this.o, loginCustomerId: loginCustomerId ?? null });
  }

  async request<T>(method: "GET" | "POST", path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${await this.o.auth.token(signal)}`, accept: "application/json" };
    if (this.o.developerToken) headers["developer-token"] = this.o.developerToken;
    if (this.o.loginCustomerId) headers["login-customer-id"] = this.o.loginCustomerId.replace(/-/g, "");
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await this.f(`${this.base}/${this.version}/${path.replace(/^\//, "")}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ?? AbortSignal.timeout(60_000),
    });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) throw parseApiError(res.status, json);
    return json as T;
  }

  /** GAQL search with pagination; returns every row. */
  async search<T = Record<string, unknown>>(customerId: string, query: string, signal?: AbortSignal): Promise<T[]> {
    const rows: T[] = [];
    let pageToken: string | undefined;
    for (let i = 0; i < 50; i++) {
      const r = await this.request<{ results?: T[]; nextPageToken?: string }>("POST", `customers/${customerId}/googleAds:search`, { query, ...(pageToken ? { pageToken } : {}) }, signal);
      rows.push(...(r.results ?? []));
      if (!r.nextPageToken) break;
      pageToken = r.nextPageToken;
    }
    return rows;
  }

  /** GoogleAdsService.Mutate: atomic unless partialFailure. Returns one result per operation, in order. */
  async mutate(customerId: string, operations: MutateOperation[], o: { validateOnly?: boolean; signal?: AbortSignal } = {}): Promise<MutateResult[]> {
    const r = await this.request<{ mutateOperationResponses?: MutateResult[] }>(
      "POST", `customers/${customerId}/googleAds:mutate`, { mutateOperations: operations, ...(o.validateOnly ? { validateOnly: true } : {}) }, o.signal,
    );
    return r.mutateOperationResponses ?? [];
  }
}

/** First resourceName in one mutate response entry (e.g. { campaignResult: { resourceName } }). */
export function resultName(r: MutateResult | undefined): string | null {
  if (!r) return null;
  for (const v of Object.values(r)) if (v && typeof v.resourceName === "string") return v.resourceName;
  return null;
}
