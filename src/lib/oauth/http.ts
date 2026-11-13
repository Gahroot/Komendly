// Response helpers for the OAuth endpoints (CORS-open for browser-based MCP clients, never cached).
import { rateLimit } from "@/lib/ads/abuse";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...CORS, ...NO_STORE, ...extra } });
}

export function oauthError(error: string, description: string, status = 400, extra: Record<string, string> = {}): Response {
  return oauthJson({ error, error_description: description }, status, extra);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Per-IP fixed window via the shared Postgres limiter. */
export function ipLimit(request: Request, bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  return rateLimit(`oauth-${bucket}:${clientIp(request)}`, limit, windowSeconds);
}

/** Form body (application/x-www-form-urlencoded per spec; JSON tolerated). */
export async function readForm(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  const text = (await request.text()).slice(0, 20_000);
  if (type.includes("application/json")) {
    try {
      const obj: unknown = JSON.parse(text);
      const out = new URLSearchParams();
      if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) if (typeof v === "string") out.set(k, v);
      return out;
    } catch {
      return new URLSearchParams();
    }
  }
  return new URLSearchParams(text);
}

/** client_secret_basic (Authorization: Basic) or client_secret_post / public client_id in the body. */
export function clientCredentials(request: Request, form: URLSearchParams): { clientId: string | null; secret: string | null } {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  if (m?.[1]) {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i > 0) return { clientId: decodeURIComponent(decoded.slice(0, i)), secret: decodeURIComponent(decoded.slice(i + 1)) };
  }
  return { clientId: form.get("client_id"), secret: form.get("client_secret") };
}
