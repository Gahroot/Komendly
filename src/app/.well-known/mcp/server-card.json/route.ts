// MCP Server Card (SEP-1649): public metadata + tool list for directories (Smithery, Glama, ...) and agents.
import { originOf } from "@/lib/oauth/core";
import { CORS, preflight } from "@/lib/oauth/http";
import { buildServerCard } from "@/lib/agent-keys/server-card";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Response.json(await buildServerCard(originOf(request)), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export function OPTIONS() {
  return preflight();
}
