// Authorization request validation, shared by the consent page (GET) and the consent decision (POST).
import type { OAuthClient } from "@prisma/client";
import { isValidChallenge, mcpResource, redirectUriMatches, resourceOk } from "./core";
import { findClient } from "./store";

export type AuthorizeCheck =
  | { kind: "fatal"; message: string } // never redirect: client or redirect_uri can't be trusted
  | { kind: "redirect"; url: string } // error sent back to the (validated) client
  | { kind: "ok"; client: OAuthClient; redirectUri: string; codeChallenge: string; state: string; resource: string };

/** Redirect to the client's registered redirect_uri with params (state passthrough, RFC 9207 iss). */
export function clientRedirect(redirectUri: string, params: Record<string, string>, origin: string): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set("iss", origin);
  return url.toString();
}

export async function checkAuthorizeRequest(get: (k: string) => string | null, origin: string): Promise<AuthorizeCheck> {
  const client = await findClient(get("client_id"));
  if (!client) return { kind: "fatal", message: "This app isn't registered with Komendly. Try connecting again from the app." };
  const redirectUri = get("redirect_uri");
  if (!redirectUri || !redirectUriMatches(client.redirectUris, redirectUri)) return { kind: "fatal", message: "This app sent an unexpected return address, so we stopped here to keep your account safe." };
  const state = get("state") ?? "";
  const fail = (error: string, description: string): AuthorizeCheck => ({ kind: "redirect", url: clientRedirect(redirectUri, { error, error_description: description, state }, origin) });
  if (get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  const challenge = get("code_challenge");
  if (!challenge || get("code_challenge_method") !== "S256" || !isValidChallenge(challenge)) return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  const resource = get("resource");
  if (!resourceOk(resource, origin)) return fail("invalid_target", "Unknown resource.");
  return { kind: "ok", client, redirectUri, codeChallenge: challenge, state, resource: mcpResource(origin) };
}
