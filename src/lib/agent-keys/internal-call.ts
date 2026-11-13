// Calls an existing route handler in-process (same gates, same code path as the web app) for the hosted MCP server.
import { NextRequest } from "next/server";

export interface RouteResult {
  status: number;
  json: Record<string, unknown>;
  location: string | null;
}

type Handler<P> = (request: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;

const FORWARDED = ["x-forwarded-for", "x-real-ip", "user-agent"];

/** Invoke `handler` as if `method path` was requested by the same client (IP/UA forwarded for the abuse checks). */
export async function callRoute<P = Record<string, never>>(
  handler: Handler<P>,
  opts: { origin: string; incoming: Headers; method: string; path: string; body?: unknown; params?: P },
): Promise<RouteResult> {
  const headers = new Headers();
  for (const h of FORWARDED) {
    const v = opts.incoming.get(h);
    if (v) headers.set(h, v);
  }
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  const request = new NextRequest(new URL(opts.path, opts.origin), {
    method: opts.method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(request, { params: Promise.resolve((opts.params ?? {}) as P) });
  const location = res.headers.get("location");
  let json: Record<string, unknown> = {};
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    const parsed: unknown = await res.json().catch(() => ({}));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
  }
  return { status: res.status, json, location };
}
