"use client";
// Tiny JSON client for the Studio API: Result-style returns, never throws for HTTP errors.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; error: string; body: Record<string, unknown> };

export async function api<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, status: res.status, code: typeof body.code === "string" ? body.code : "error", error: typeof body.error === "string" ? body.error : "Something went wrong.", body };
    }
    return { ok: true, data: body as T };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { ok: false, status: 0, code: "aborted", error: "Cancelled.", body: {} };
    return { ok: false, status: 0, code: "network", error: "You seem to be offline. Check your connection.", body: {} };
  }
}

export function mediaUrl(o: { render?: string; key?: string; kind?: "poster" | "video"; download?: boolean }): string {
  const p = new URLSearchParams();
  if (o.render) p.set("render", o.render);
  if (o.key) p.set("key", o.key);
  if (o.kind) p.set("kind", o.kind);
  if (o.download) p.set("download", "1");
  return `/api/studio/media?${p.toString()}`;
}

/** Start a Stripe checkout via the existing ads billing endpoint. */
export async function startCheckout(body: Record<string, unknown>): Promise<string | null> {
  const r = await api<{ url?: string }>("/api/ads-billing/checkout", { body });
  if (r.ok && r.data.url) {
    window.location.href = r.data.url;
    return null;
  }
  return r.ok ? "Checkout isn't available right now." : r.error;
}
