// RFC 7009 token revocation (always 200 for unknown tokens).
import { authenticateClient, revokeToken } from "@/lib/oauth/store";
import { clientCredentials, ipLimit, oauthError, oauthJson, preflight, readForm } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await ipLimit(request, "revoke", 60, 60))) return oauthError("too_many_requests", "Too many requests. Try again in a minute.", 429);
  const form = await readForm(request);
  const { clientId, secret } = clientCredentials(request, form);
  const client = await authenticateClient(clientId, secret);
  if (!client) return oauthError("invalid_client", "Unknown client or bad client credentials.", 401);
  const token = form.get("token");
  if (!token) return oauthError("invalid_request", "token is required.");
  await revokeToken(client, token);
  return oauthJson({});
}

export function OPTIONS() {
  return preflight();
}
