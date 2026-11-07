import { prisma } from "@/lib/prisma";
import { AdsHttpError } from "@/lib/ads/workspace";
import { decryptToken, encryptToken } from "./core/crypto";
import { createMetaPublisher } from "./core/factory";
import { META_MCP_TOKEN_ENDPOINT_FALLBACK, refreshMcpToken } from "./core/oauth";
import type { MetaPublisher, StoredMetaToken } from "./core/types";
import { graphVersion, metaTokenKey } from "./config";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function saveMetaToken(workspaceId: string, token: StoredMetaToken): Promise<void> {
  const encryptedToken = encryptToken(JSON.stringify(token), metaTokenKey());
  const tokenExpiresAt = token.expiresAt ? new Date(token.expiresAt) : null;
  await prisma.metaConnection.upsert({
    where: { workspaceId },
    create: { workspaceId, encryptedToken, tokenExpiresAt },
    update: { encryptedToken, tokenExpiresAt },
  });
}

/** Decrypted token for a workspace; refreshes MCP tokens close to expiry. */
export async function loadMetaToken(workspaceId: string): Promise<StoredMetaToken> {
  const conn = await prisma.metaConnection.findUnique({ where: { workspaceId } });
  if (!conn) throw new AdsHttpError(409, "meta_not_connected", "Connect your Meta account first.");
  let token = JSON.parse(decryptToken(conn.encryptedToken, metaTokenKey())) as StoredMetaToken;
  const now = Date.now();
  if (token.expiresAt && token.expiresAt - now < 5 * 60 * 1000) {
    if (token.mode !== "mcp" || !token.refreshToken || !process.env.META_APP_ID) {
      throw new AdsHttpError(409, "meta_expired", "Your Meta connection expired. Reconnect to continue.");
    }
    token = await refreshMcpToken(META_MCP_TOKEN_ENDPOINT_FALLBACK, process.env.META_APP_ID, token, now);
    await saveMetaToken(workspaceId, token);
  }
  return token;
}

export async function publisherForWorkspace(workspaceId: string): Promise<MetaPublisher> {
  const token = await loadMetaToken(workspaceId);
  return createMetaPublisher({ mode: token.mode, accessToken: token.accessToken, graphVersion: graphVersion() });
}

export async function disconnectMeta(workspaceId: string): Promise<void> {
  await prisma.metaConnection.deleteMany({ where: { workspaceId } });
  await prisma.metaOAuthState.deleteMany({ where: { workspaceId } });
}

export async function saveMetaSelection(workspaceId: string, sel: { adAccountId: string; pageId: string }): Promise<void> {
  const r = await prisma.metaConnection.updateMany({ where: { workspaceId }, data: sel });
  if (r.count === 0) throw new AdsHttpError(409, "meta_not_connected", "Connect your Meta account first.");
}
