// HTTP entry for the hosted Ozzy MCP server (POST /api/mcp; /api/mcp/k/<key> is deprecated). Stateless: one server per request.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { runAsAgent } from "./context";
import { buildOzzyServer } from "./mcp-server";
import { CLIENT_HEADER, parseBearer, UPGRADE_URL } from "./policy";
import { RATE_LIMIT_MESSAGE, resolveApiKey } from "./resolve";
import { originOf, parseOAuthBearer, wwwAuthenticate } from "@/lib/oauth/core";
import { resolveAccessToken } from "@/lib/oauth/store";

function rpcError(status: number, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return Response.json({ jsonrpc: "2.0", error: { code: -32001, message, data: extra }, id: null }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Auth: an OAuth access token (`Bearer kmo_...`, from the sign-in + Allow flow) or a personal API key (`Bearer kmd_...`, CLI).
 * `pathKey` is the deprecated /api/mcp/k/<key> form: kept working for existing users, no longer documented anywhere.
 */
export async function handleMcp(request: Request, pathKey: string | null): Promise<Response> {
  const origin = originOf(request);
  const authHeader = request.headers.get("authorization");
  const oauthToken = pathKey ? null : parseOAuthBearer(authHeader);
  const raw = pathKey ?? parseBearer(authHeader);
  // The komendly CLI stdio bridge says so (X-Komendly-Client: cli); every other MCP client counts as "mcp".
  const via = request.headers.get(CLIENT_HEADER) === "cli" ? "cli" : "mcp";
  if (!oauthToken && !raw) {
    return rpcError(401, "Sign in to connect: add https://www.komendly.com/api/mcp as a connector in your app, then sign in to Komendly.", {}, { "WWW-Authenticate": wwwAuthenticate(origin) });
  }
  const resolved = oauthToken ? await resolveAccessToken(oauthToken, { via }) : await resolveApiKey(raw ?? "", { via });
  if (!resolved.ok) {
    if (resolved.reason === "rate_limited") return rpcError(429, RATE_LIMIT_MESSAGE, { upgrade_url: UPGRADE_URL });
    if (oauthToken) return rpcError(401, "Your sign-in expired or was disconnected. Reconnect Ozzy in your app.", {}, { "WWW-Authenticate": wwwAuthenticate(origin, "invalid_token") });
    return rpcError(401, "This API key isn't valid or was revoked. Create a new one at https://www.komendly.com/dashboard/api.", {}, { "WWW-Authenticate": wwwAuthenticate(origin, "invalid_token") });
  }
  const info = { origin, headers: request.headers };
  return runAsAgent({ user: resolved.user, keyId: resolved.keyId, via }, async () => {
    const server = buildOzzyServer(info);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      await server.close().catch(() => undefined);
    }
  });
}
