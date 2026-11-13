// HTTP entry for the hosted Ozzy MCP server (POST /api/mcp, /api/mcp/k/<key>). Stateless: one server per request.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { runAsAgent } from "./context";
import { buildOzzyServer } from "./mcp-server";
import { CLIENT_HEADER, parseBearer, UPGRADE_URL } from "./policy";
import { RATE_LIMIT_MESSAGE, resolveApiKey } from "./resolve";

function rpcError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ jsonrpc: "2.0", error: { code: -32001, message, data: extra }, id: null }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Public origin for view URLs (proxy-aware; never trusts anything but host/proto). */
function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function handleMcp(request: Request, pathKey: string | null): Promise<Response> {
  const raw = pathKey ?? parseBearer(request.headers.get("authorization"));
  if (!raw) {
    return rpcError(401, "Missing API key. Create one at https://www.komendly.com/dashboard/api and send it as `Authorization: Bearer kmd_...`.");
  }
  // The komendly CLI stdio bridge says so (X-Komendly-Client: cli); every other MCP client counts as "mcp".
  const via = request.headers.get(CLIENT_HEADER) === "cli" ? "cli" : "mcp";
  const resolved = await resolveApiKey(raw, { via });
  if (!resolved.ok) {
    if (resolved.reason === "rate_limited") return rpcError(429, RATE_LIMIT_MESSAGE, { upgrade_url: UPGRADE_URL });
    return rpcError(401, "This API key isn't valid or was revoked. Create a new one at https://www.komendly.com/dashboard/api.");
  }
  const info = { origin: originOf(request), headers: request.headers };
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
