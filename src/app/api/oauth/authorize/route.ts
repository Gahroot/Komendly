// Consent decision (form POST from /oauth/authorize). CSRF: SameSite=Lax session cookie + an HMAC form token keyed by that
// session and bound to every authorization parameter + user, plus a same-origin Origin check.
import { getSessionToken, validateSession } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { originOf, verifyConsent } from "@/lib/oauth/core";
import { checkAuthorizeRequest, clientRedirect } from "@/lib/oauth/authorize";
import { createAuthCode } from "@/lib/oauth/store";
import { trackAdsEvent } from "@/lib/ads/events";
import { prisma } from "@/lib/prisma";
import { assistantConnectionsOpen, CONNECTIONS_PAUSED_MESSAGE } from "@/lib/agent-keys/assistant";
import { ASSISTANT_SYSTEM } from "@/lib/oauth/assistant-touch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(message: string, status = 400): Response {
  return new Response(`<!doctype html><meta charset="utf-8"><title>Komendly</title><p style="font-family:sans-serif;padding:2rem">${message}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const origin = originOf(request);
  const sentOrigin = request.headers.get("origin");
  if (sentOrigin && sentOrigin !== origin) return page("This request didn't come from Komendly.", 403);
  const sessionToken = await getSessionToken();
  const session = sessionToken ? await validateSession(sessionToken) : null;
  if (!sessionToken || !session?.user) return page("Your session ended. Go back to the app and connect again.", 401);
  const form = await request.formData().catch(() => null);
  const token = form?.get("consent");
  const payload = typeof token === "string" ? verifyConsent(sessionToken, token, Date.now()) : null;
  if (!payload || payload.user_id !== session.user.id) return page("This page expired. Go back to the app and connect again.");
  const check = await checkAuthorizeRequest((k) => payload[k] ?? null, origin);
  if (check.kind === "fatal") return page(check.message);
  if (check.kind === "redirect") return Response.redirect(check.url, 303);
  if (form?.get("decision") !== "allow") {
    return Response.redirect(clientRedirect(check.redirectUri, { error: "access_denied", error_description: "The user declined.", state: check.state }, origin), 303);
  }
  const existing = await prisma.oAuthGrant.count({ where: { userId: session.user.id, clientId: check.client.id, revokedAt: null } });
  if (!existing && !(await assistantConnectionsOpen())) return page(CONNECTIONS_PAUSED_MESSAGE, 503);
  const workspace = await getOrCreateWorkspace(session.user);
  if (!existing) {
    const newUser = Date.now() - new Date(session.user.createdAt).getTime() < 3_600_000;
    await trackAdsEvent("assistant_connected", { userId: session.user.id, workspaceId: workspace.id, props: { system: ASSISTANT_SYSTEM, client: check.client.name, newUser } });
  }
  const code = await createAuthCode({ clientId: check.client.id, userId: session.user.id, workspaceId: workspace.id, redirectUri: check.redirectUri, codeChallenge: check.codeChallenge, resource: check.resource });
  return Response.redirect(clientRedirect(check.redirectUri, { code, state: check.state }, origin), 303);
}
