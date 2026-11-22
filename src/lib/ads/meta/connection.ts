import { prisma } from "@/lib/prisma";
import { AdsHttpError } from "@/lib/ads/workspace";
import { decryptToken, encryptToken } from "./core/crypto";
import { createMetaPublisher } from "./core/factory";
import { META_MCP_TOKEN_ENDPOINT_FALLBACK, refreshMcpToken, revokeGraphToken } from "./core/oauth";
import { scopeToSelection, systemTokenFor } from "./core/partner";
import type { MetaPublisher, StoredMetaToken } from "./core/types";
import { graphVersion, metaTokenKey } from "./config";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Stores the encrypted token. `viaPartner` = Komendly's own token on a partner-shared customer workspace (admin connect);
 * a normal connect clears it. A fresh partner token also renews every other partner connection (same founder login).
 */
export async function saveMetaToken(workspaceId: string, token: StoredMetaToken, opts: { viaPartner?: boolean } = {}): Promise<void> {
  const encryptedToken = encryptToken(JSON.stringify(token), metaTokenKey());
  const tokenExpiresAt = token.expiresAt ? new Date(token.expiresAt) : null;
  const viaPartner = !!opts.viaPartner;
  await prisma.metaConnection.upsert({
    where: { workspaceId },
    create: { workspaceId, encryptedToken, tokenExpiresAt, viaPartner },
    update: { encryptedToken, tokenExpiresAt, viaPartner },
  });
  if (viaPartner) await prisma.metaConnection.updateMany({ where: { viaPartner: true, workspaceId: { not: workspaceId } }, data: { encryptedToken, tokenExpiresAt } });
}

/** Decrypted token for a workspace; refreshes MCP tokens close to expiry. */
export async function loadMetaToken(workspaceId: string): Promise<StoredMetaToken> {
  const conn = await prisma.metaConnection.findUnique({ where: { workspaceId } });
  if (!conn) throw new AdsHttpError(409, "meta_not_connected", "Connect your Meta account first.");
  const system = systemTokenFor(conn);
  if (system) return system;
  let token = JSON.parse(decryptToken(conn.encryptedToken, metaTokenKey())) as StoredMetaToken;
  const now = Date.now();
  if (token.expiresAt && token.expiresAt - now < 5 * 60 * 1000) {
    if (conn.viaPartner) throw new AdsHttpError(409, "meta_expired", "Komendly's Meta connection for this account needs a refresh. We're reconnecting it; try again soon.");
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
  const publisher = createMetaPublisher({ mode: token.mode, accessToken: token.accessToken, graphVersion: graphVersion() });
  const conn = await prisma.metaConnection.findUnique({ where: { workspaceId }, select: { viaPartner: true, adAccountId: true, pageId: true } });
  if (!conn?.viaPartner) return publisher;
  // Komendly's partner token sees every partner customer's assets: this workspace only sees the ones picked for it.
  const listAdAccounts = publisher.listAdAccounts.bind(publisher);
  const listPages = publisher.listPages.bind(publisher);
  publisher.listAdAccounts = async (signal) => scopeToSelection(conn, await listAdAccounts(signal), []).adAccounts;
  publisher.listPages = async (signal) => scopeToSelection(conn, [], await listPages(signal)).pages;
  return publisher;
}

/**
 * Deletes the connection; revokes the app grant at Meta only for a customer's own token. Partner connections hold Komendly's
 * token (shared by every partner customer), and `revoke: false` (an admin disconnecting) keeps the founder's grant alive too:
 * revoking /me/permissions kills every token of that Facebook user, including all partner connections.
 */
export async function disconnectMeta(workspaceId: string, opts: { revoke?: boolean } = {}): Promise<void> {
  const conn = await prisma.metaConnection.findUnique({ where: { workspaceId } });
  if (conn && !conn.viaPartner && opts.revoke !== false) {
    try {
      const token = JSON.parse(decryptToken(conn.encryptedToken, metaTokenKey())) as StoredMetaToken;
      if (token.mode === "graph") await revokeGraphToken(token.accessToken, graphVersion());
    } catch {
      // Unreadable token: still delete it below.
    }
  }
  await prisma.metaConnection.deleteMany({ where: { workspaceId } });
  await prisma.metaOAuthState.deleteMany({ where: { workspaceId } });
}

export async function saveMetaSelection(workspaceId: string, sel: { adAccountId: string; pageId: string }): Promise<void> {
  const r = await prisma.metaConnection.updateMany({ where: { workspaceId }, data: sel });
  if (r.count === 0) throw new AdsHttpError(409, "meta_not_connected", "Connect your Meta account first.");
}
