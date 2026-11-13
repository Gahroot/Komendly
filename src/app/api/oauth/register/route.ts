// RFC 7591 Dynamic Client Registration (public, rate-limited per IP).
import { registerClient } from "@/lib/oauth/store";
import { ipLimit, oauthError, oauthJson, preflight } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await ipLimit(request, "register", 20, 3600))) return oauthError("too_many_requests", "Too many registrations. Try again later.", 429, { "Retry-After": "3600" });
  const body: unknown = await request.json().catch(() => null);
  const result = await registerClient(body);
  if (!result.ok) return oauthError(result.error, result.description, 400);
  return oauthJson(result.body, 201);
}

export function OPTIONS() {
  return preflight();
}
