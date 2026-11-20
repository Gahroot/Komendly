// MCP Server Card (SEP-1649) for directories and agents that can't sign in: built from the live probe's initialize +
// tools/list, so it always matches what the server really exposes.
import { handleMcp } from "./mcp-handler";
import { PROBE_CLIENT } from "./assistant";

async function probe(origin: string, id: number, method: string, params?: unknown): Promise<Record<string, unknown>> {
  const res = await handleMcp(
    new Request(`${origin}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-komendly-client": PROBE_CLIENT },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
    }),
    null,
  );
  const body = (await res.json()) as { result?: Record<string, unknown> };
  return body.result ?? {};
}

export async function buildServerCard(origin: string) {
  const init = await probe(origin, 1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "server-card", version: "1" } });
  const list = await probe(origin, 2, "tools/list");
  const url = `${origin}/api/mcp`;
  return {
    serverInfo: init.serverInfo,
    description: "Make Facebook and Instagram ad creatives from any website, and promo videos with Ozzy. 3 free ads, no card. OAuth sign-in.",
    websiteUrl: `${origin}/agents`,
    documentationUrl: `${origin}/agents`,
    iconUrl: `${origin}/brand/komendly-mark-256.png`,
    transport: { type: "streamable-http", url },
    remotes: [{ type: "streamable-http", url }],
    authentication: { required: true, schemes: ["oauth2"], protectedResourceMetadata: `${origin}/.well-known/oauth-protected-resource/api/mcp` },
    capabilities: init.capabilities ?? {},
    instructions: init.instructions,
    tools: list.tools ?? [],
  };
}
