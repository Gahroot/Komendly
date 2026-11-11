// Browser-side helpers for /api/ads/* (no server imports).

export class AdsApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.error === "string" ? data.error : "Something went wrong. Please try again.";
    throw new AdsApiError(res.status, typeof data.code === "string" ? data.code : "error", message, data);
  }
  return data as T;
}

export async function adsFetcher<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { cache: "no-store" }));
}

export async function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST", signal?: AbortSignal): Promise<T> {
  return parse<T>(await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }));
}

export const PENDING_RUN_KEY = "komendly_ads_pending";

export interface PendingRun {
  url: string;
  goal?: string;
}

export function savePendingRun(p: PendingRun): void {
  window.localStorage.setItem(PENDING_RUN_KEY, JSON.stringify(p));
}

export function readPendingRun(): PendingRun | null {
  try {
    const raw = window.localStorage.getItem(PENDING_RUN_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : null;
    if (value && typeof value === "object" && "url" in value && typeof value.url === "string") {
      const goal = "goal" in value && typeof value.goal === "string" ? value.goal : undefined;
      return { url: value.url, goal };
    }
  } catch {
    // corrupted storage: ignore
  }
  return null;
}

export function clearPendingRun(): void {
  window.localStorage.removeItem(PENDING_RUN_KEY);
}

/** Only allow in-app redirects after auth (prevents open redirects). */
export function safeNext(next: string | null, fallback = "/ads/app"): string {
  return next && /^\/(ads|verify-email|partners)(\/|$|\?)/.test(next) ? next : fallback;
}
