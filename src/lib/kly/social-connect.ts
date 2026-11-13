// Admin-only "Connect Komendly Page": the same Meta app as Website2ads, with Page/IG publishing scopes, run once by the
// owner. Code -> long-lived user token (exchangeGraphCode) -> /me/accounts -> non-expiring Page token, sealed with
// ADS_TOKEN_KEY into KlySocialConnection. State + PKCE verifier ride in a short-lived sealed httpOnly cookie.
import { prisma } from "@/lib/prisma";
import { metaAppConfig, metaTokenKey } from "@/lib/ads/meta/config";
import { decryptToken, encryptToken } from "@/lib/ads/meta/core/crypto";
import { exchangeGraphCode, pkceChallenge, randomToken, type MetaAppConfig } from "@/lib/ads/meta/core/oauth";
import { SOCIAL_SCOPES, choosePage, listPages } from "./social-core";

export const SOCIAL_STATE_COOKIE = "kly_social_oauth";
const STATE_TTL_MS = 10 * 60_000;

export function socialAppConfig(): MetaAppConfig {
  const c = metaAppConfig();
  return { ...c, redirectUri: process.env.KLY_SOCIAL_REDIRECT_URI || new URL("/api/admin/ads/social/callback", c.redirectUri).toString() };
}

/** Authorize URL + the sealed cookie value to set. */
export function startSocialConnect(userId: string): { url: string; cookie: string } {
  const c = socialAppConfig();
  const state = randomToken();
  const verifier = randomToken(48);
  const u = new URL(`https://www.facebook.com/${c.graphVersion}/dialog/oauth`);
  u.searchParams.set("client_id", c.appId);
  u.searchParams.set("redirect_uri", c.redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("code_challenge", pkceChallenge(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  const configId = process.env.KLY_SOCIAL_LOGIN_CONFIG_ID;
  if (configId) u.searchParams.set("config_id", configId);
  else u.searchParams.set("scope", SOCIAL_SCOPES.join(","));
  const cookie = encryptToken(JSON.stringify({ state, verifier, userId, exp: Date.now() + STATE_TTL_MS }), metaTokenKey());
  return { url: u.toString(), cookie };
}

export type ConnectResult = { ok: true; pageName: string; igUsername: string | null } | { ok: false; error: string };

export async function finishSocialConnect(o: { cookie: string | undefined; state: string; code: string; userId: string }): Promise<ConnectResult> {
  let saved: { state?: string; verifier?: string; userId?: string; exp?: number } = {};
  try {
    saved = o.cookie ? (JSON.parse(decryptToken(o.cookie, metaTokenKey())) as typeof saved) : {};
  } catch {
    saved = {};
  }
  if (!saved.verifier || saved.state !== o.state || saved.userId !== o.userId || (saved.exp ?? 0) < Date.now()) return { ok: false, error: "This sign-in link expired. Please try again." };
  const c = socialAppConfig();
  const user = await exchangeGraphCode(c, o.code, saved.verifier, Date.now());
  const pages = await listPages(fetch, c.graphVersion, user.accessToken, AbortSignal.timeout(20_000));
  const page = choosePage(pages, process.env.KLY_SOCIAL_PAGE_ID || undefined);
  if (typeof page === "string") return { ok: false, error: page };
  const data = { pageId: page.id, pageName: page.name, pageTokenEnc: encryptToken(page.accessToken, metaTokenKey()), igUserId: page.igUserId, igUsername: page.igUsername, connectedBy: o.userId };
  await prisma.klySocialConnection.upsert({ where: { id: "komendly" }, create: { id: "komendly", ...data }, update: data });
  return { ok: true, pageName: page.name, igUsername: page.igUsername };
}

export async function loadSocialPanel() {
  const [settings, conn, posts] = await Promise.all([
    prisma.klySettings.findUnique({ where: { id: "kly" }, select: { socialEnabled: true, socialHourEt: true } }),
    prisma.klySocialConnection.findUnique({ where: { id: "komendly" }, select: { pageName: true, igUsername: true, updatedAt: true } }),
    prisma.klySocialPost.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, day: true, platform: true, sourceKind: true, caption: true, imageUrl: true, status: true, postId: true, error: true, createdAt: true } }),
  ]);
  return { enabled: settings?.socialEnabled ?? false, hourEt: settings?.socialHourEt ?? 10, connection: conn, posts };
}
