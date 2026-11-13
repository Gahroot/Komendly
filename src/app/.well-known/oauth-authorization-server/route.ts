// RFC 8414 Authorization Server Metadata (the issuer is the request origin, so dev and previews work).
import { authorizationServerMetadata, originOf } from "@/lib/oauth/core";
import { oauthJson, preflight } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return oauthJson(authorizationServerMetadata(originOf(request)));
}

export function OPTIONS() {
  return preflight();
}
