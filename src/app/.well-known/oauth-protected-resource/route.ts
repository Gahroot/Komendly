// RFC 9728 Protected Resource Metadata for the hosted Ozzy MCP server.
import { originOf, protectedResourceMetadata } from "@/lib/oauth/core";
import { oauthJson, preflight } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return oauthJson(protectedResourceMetadata(originOf(request)));
}

export function OPTIONS() {
  return preflight();
}
