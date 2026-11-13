export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const USER_AGENT = "komendly-cli/0.1.0";

export function upgradeUrl(baseUrl: string): string {
  return `${baseUrl}/pricing?utm_source=cli`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly upgradeUrl: string | undefined;
  constructor(message: string, status: number, code?: string, upgradeUrl?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.upgradeUrl = upgradeUrl;
  }
}

function field(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const v = (body as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Turn an HTTP error into one plain sentence a human (or the agent relaying it) can act on. */
export function friendlyError(status: number, body: unknown, baseUrl: string, retryAfter?: string | null): ApiError {
  const msg = field(body, "error");
  const code = field(body, "code");
  if (status === 401) {
    return new ApiError(`Your Komendly API key is missing, invalid or revoked. Create one at ${baseUrl}/dashboard/api, then run \`komendly login\`.`, status, code);
  }
  if (status === 402) {
    const url = field(body, "upgrade_url") ?? field(body, "upgradeUrl") ?? upgradeUrl(baseUrl);
    return new ApiError(`${msg ?? "You need more credits for this."} Upgrade or top up here: ${url}`, status, code, url);
  }
  if (status === 409) return new ApiError(msg ?? "Ozzy is still busy with an earlier request. Wait for it to finish, then try again.", status, code);
  if (status === 429) {
    const wait = retryAfter && /^\d+$/.test(retryAfter) ? ` (try again in ${retryAfter}s)` : "";
    return new ApiError(`${msg ?? "Too many requests right now. Wait a minute and try again."}${wait}`, status, code);
  }
  if (status === 404) return new ApiError(msg ?? "Not found.", status, code);
  return new ApiError(msg ?? `Komendly returned an error (HTTP ${status}). Please try again.`, status, code);
}

export interface ApiOptions {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
}

export class Api {
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  private readonly apiKey: string;

  constructor(opts: ApiOptions) {
    this.baseUrl = opts.baseUrl;
    this.apiKey = opts.apiKey;
    this.fetch = opts.fetch;
  }

  headers(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, "User-Agent": USER_AGENT, "X-Komendly-Client": "cli", ...extra };
  }

  /** Raw authenticated request (no status handling). */
  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = this.headers((init.headers as Record<string, string> | undefined) ?? {});
    try {
      return await this.fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (error) {
      throw new ApiError(`Couldn't reach ${this.baseUrl} (${error instanceof Error ? error.message : "network error"}). Check your connection and try again.`, 0, "network");
    }
  }

  async errorFrom(res: Response): Promise<ApiError> {
    const text = await res.text().catch(() => "");
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return friendlyError(res.status, body, this.baseUrl, res.headers.get("retry-after"));
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    });
    if (!res.ok) throw await this.errorFrom(res);
    return (await res.json()) as T;
  }
}
