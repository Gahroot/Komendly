// RFC 7591 Dynamic Client Registration (public, rate-limited per IP).
import { registerClient } from "@/lib/oauth/store";
import { ipLimit, oauthError, oauthJson, preflight } from "@/lib/oauth/http";
import { assistantConnectionsOpen, CONNECTIONS_PAUSED_MESSAGE } from "@/lib/agent-keys/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Kill switch sys_ai_assistant: no new app registrations (existing clients, grants and API keys keep working).
  if (!(await assistantConnectionsOpen())) return oauthError("temporarily_unavailable", CONNECTIONS_PAUSED_MESSAGE, 503, { "Retry-After": "3600" });
  if (!(await ipLimit(request, "register", 20, 3600))) return oauthError("too_many_requests", "Too many registrations. Try again later.", 429, { "Retry-After": "3600" });
  const body: unknown = await request.json().catch(() => null);
  const result = await registerClient(body);
  if (!result.ok) return oauthError(result.error, result.description, 400);
  return oauthJson(result.body, 201);
}

export function OPTIONS() {
  return preflight();
}
