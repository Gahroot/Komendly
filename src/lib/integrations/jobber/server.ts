// Jobber connections without a schema change. Storage choice (see docs/integrations/jobber-listing.md):
// prisma/schema.prisma has no generic integration/token model (OAuth* models are Komendly's own OAuth server for MCP
// clients, MetaConnection is Meta-only), so each Jobber account is ONE mutable AdsEvent row (name "jobber_connection",
// workspaceId/userId set once linked) whose props hold the AES-256-GCM-sealed tokens (ADS_TOKEN_KEY, same sealing as
// Meta/Shopify) plus state. Writes are compare-and-swap on props.rev, so rotated refresh tokens are never lost to a race.
// Webhook deliveries are logged as "jobber_webhook" rows.
import type { PrismaClient } from "@prisma/client";
import { decryptToken, encryptToken, tokenKey } from "@/lib/ads/meta/core/crypto";
import { recordSystemRun, systemEnabled } from "@/lib/growth/systems";
import { accountKey, IDEA_TOPICS, JOBBER_SYSTEM, type JobberEnv, type JobberWebhook } from "./core";
import { fetchJobFor, JobberAuthError, refreshTokens, type JobberTokens } from "./graphql";
import { ideasToFocus, jobIdea, mayWriteFocus, mergeIdeas, type AdIdea } from "./mapping";

export type JobberDb = PrismaClient;
export const CONNECTION_EVENT = "jobber_connection";
export const WEBHOOK_EVENT = "jobber_webhook";

export interface ConnectionProps {
  system: typeof JOBBER_SYSTEM;
  accountKey: string;
  accountId: string;
  accountName: string | null;
  /** pending = Jobber connected, no Komendly workspace yet; linked; reconnect = refresh token rejected; disconnected. */
  status: "pending" | "linked" | "reconnect" | "disconnected";
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  expiresAt: string | null;
  refreshingUntil: string | null;
  rev: number;
  ideas: AdIdea[];
  lastFocus: string | null;
  website: string | null;
  connectedAt: string;
  linkedAt: string | null;
  disconnectedAt: string | null;
}
export interface Connection { id: string; workspaceId: string | null; userId: string | null; props: ConnectionProps }

const key = () => tokenKey(process.env.ADS_TOKEN_KEY);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toRow = (r: { id: string; workspaceId: string | null; userId: string | null; props: unknown }): Connection => ({ id: r.id, workspaceId: r.workspaceId, userId: r.userId, props: r.props as ConnectionProps });

export async function findConnection(db: JobberDb, accountId: string): Promise<Connection | null> {
  const r = await db.adsEvent.findFirst({ where: { name: CONNECTION_EVENT, props: { path: ["accountKey"], equals: accountKey(accountId) } }, orderBy: { createdAt: "asc" } });
  return r ? toRow(r) : null;
}
export async function getConnection(db: JobberDb, id: string): Promise<Connection | null> {
  const r = await db.adsEvent.findFirst({ where: { id, name: CONNECTION_EVENT } });
  return r ? toRow(r) : null;
}
export async function connectionForWorkspace(db: JobberDb, workspaceId: string): Promise<Connection | null> {
  const r = await db.adsEvent.findFirst({ where: { name: CONNECTION_EVENT, workspaceId, props: { path: ["status"], equals: "linked" } }, orderBy: { createdAt: "desc" } });
  return r ? toRow(r) : null;
}

/** Compare-and-swap on props.rev. fn returns the new props (or null = nothing to change). Retries on a lost race. */
export async function mutateConnection(db: JobberDb, id: string, fn: (p: ConnectionProps, row: Connection) => { props: ConnectionProps; workspaceId?: string; userId?: string } | null): Promise<Connection | null> {
  for (let i = 0; i < 5; i++) {
    const row = await getConnection(db, id);
    if (!row) return null;
    const next = fn(row.props, row);
    if (!next) return row;
    const props = { ...next.props, rev: row.props.rev + 1 };
    const data = { props: props as object, ...(next.workspaceId ? { workspaceId: next.workspaceId } : {}), ...(next.userId ? { userId: next.userId } : {}) };
    const r = await db.adsEvent.updateMany({ where: { id, props: { path: ["rev"], equals: row.props.rev } }, data });
    if (r.count === 1) return { ...row, ...data, props } as Connection;
  }
  throw new Error("jobber connection busy");
}

function sealed(t: JobberTokens) {
  const k = key();
  return { accessTokenEnc: encryptToken(t.accessToken, k), refreshTokenEnc: encryptToken(t.refreshToken, k), expiresAt: t.expiresAt.toISOString(), refreshingUntil: null };
}

/** OAuth callback: create or re-arm the connection for this Jobber account. */
export async function saveConnection(db: JobberDb, account: { id: string; name: string | null }, tokens: JobberTokens, now: Date = new Date()): Promise<{ connection: Connection; isNew: boolean }> {
  const existing = await findConnection(db, account.id);
  if (existing) {
    const connection = await mutateConnection(db, existing.id, (p, row) => ({
      props: { ...p, ...sealed(tokens), accountName: account.name ?? p.accountName, status: row.workspaceId ? "linked" : "pending", connectedAt: p.status === "disconnected" ? now.toISOString() : p.connectedAt, disconnectedAt: null },
    }));
    return { connection: connection!, isNew: false };
  }
  const props: ConnectionProps = {
    system: JOBBER_SYSTEM, accountKey: accountKey(account.id), accountId: account.id, accountName: account.name, status: "pending", ...sealed(tokens),
    rev: 0, ideas: [], lastFocus: null, website: null, connectedAt: now.toISOString(), linkedAt: null, disconnectedAt: null,
  };
  const r = await db.adsEvent.create({ data: { name: CONNECTION_EVENT, props: props as object } });
  return { connection: toRow(r), isNew: true };
}

/** Attach a pending connection to the signed-in member's workspace (never steals one linked to another workspace). */
export async function linkConnection(db: JobberDb, id: string, to: { workspaceId: string; userId: string; website: string | null }, now: Date = new Date()): Promise<Connection | "taken" | null> {
  const before = await getConnection(db, id);
  if (!before) return null;
  if (before.workspaceId && before.workspaceId !== to.workspaceId) return "taken";
  return mutateConnection(db, id, (p) => ({ props: { ...p, status: "linked", website: to.website ?? p.website, linkedAt: p.linkedAt ?? now.toISOString() }, workspaceId: to.workspaceId, userId: to.userId }));
}

/** A valid access token: the stored one while it has >2 min left, else one refresh (single writer via props.refreshingUntil). */
export async function accessToken(db: JobberDb, env: JobberEnv, id: string, deps: { fetch?: typeof fetch; now?: () => Date } = {}): Promise<string> {
  const now = deps.now ?? (() => new Date());
  for (let i = 0; i < 6; i++) {
    const row = await getConnection(db, id);
    const p = row?.props;
    if (!row || !p || p.status === "disconnected" || p.status === "reconnect" || !p.refreshTokenEnc) throw new JobberAuthError("jobber not connected");
    if (p.accessTokenEnc && p.expiresAt && new Date(p.expiresAt).getTime() - now().getTime() > 120_000) return decryptToken(p.accessTokenEnc, key());
    if (p.refreshingUntil && new Date(p.refreshingUntil).getTime() > now().getTime()) {
      await sleep(1000); // another request is refreshing: wait for its write
      continue;
    }
    const claimed = await db.adsEvent.updateMany({ where: { id, props: { path: ["rev"], equals: p.rev } }, data: { props: { ...p, rev: p.rev + 1, refreshingUntil: new Date(now().getTime() + 30_000).toISOString() } as object } });
    if (claimed.count !== 1) continue;
    let t: JobberTokens;
    try {
      t = await refreshTokens(env, decryptToken(p.refreshTokenEnc, key()), deps.fetch ?? fetch, now());
    } catch (e) {
      const status = e instanceof JobberAuthError ? "reconnect" : p.status;
      await db.adsEvent.updateMany({ where: { id, props: { path: ["rev"], equals: p.rev + 1 } }, data: { props: { ...p, rev: p.rev + 2, status, refreshingUntil: null } as object } });
      throw e;
    }
    // Rotation: store the new refresh token before using the new access token for anything.
    await db.adsEvent.updateMany({ where: { id, props: { path: ["rev"], equals: p.rev + 1 } }, data: { props: { ...p, ...sealed(t), rev: p.rev + 2 } as object } });
    return t.accessToken;
  }
  throw new Error("jobber token refresh busy");
}

/** Called from the webhook route: one fast insert (Jobber wants an answer within 1 second); processed after the response. */
export async function logWebhook(db: JobberDb, hook: JobberWebhook, connection: Connection | null): Promise<string> {
  const r = await db.adsEvent.create({ data: { name: WEBHOOK_EVENT, workspaceId: connection?.workspaceId ?? null, userId: connection?.userId ?? null, props: { system: JOBBER_SYSTEM, ...hook, accountKey: accountKey(hook.accountId) } } });
  return r.id;
}

export type WebhookResult = "disconnected" | "idea" | "duplicate" | "no_idea" | "ignored" | "no_connection" | "off" | "auth_failed";

/**
 * APP_DISCONNECT (required by Jobber's review): wipe tokens, mark disconnected; always processed, even with sys_jobber off.
 * JOB_CLOSED / VISIT_COMPLETE: fetch the job, keep it as an ad idea and steer the next Weekly Drop with it.
 */
export async function processWebhook(db: JobberDb, env: JobberEnv, hook: JobberWebhook, deps: { fetch?: typeof fetch; now?: () => Date } = {}): Promise<WebhookResult> {
  const now = deps.now ?? (() => new Date());
  const conn = await findConnection(db, hook.accountId);
  if (!conn) return "no_connection";
  if (hook.topic === "APP_DISCONNECT") {
    await mutateConnection(db, conn.id, (p) => (p.status === "disconnected" ? null : { props: { ...p, status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, expiresAt: null, refreshingUntil: null, disconnectedAt: now().toISOString() } }));
    return "disconnected";
  }
  if (!(IDEA_TOPICS as readonly string[]).includes(hook.topic) || !hook.itemId) return "ignored";
  if (conn.props.status !== "linked" && conn.props.status !== "pending") return "no_connection";
  if (!(await systemEnabled(db, JOBBER_SYSTEM))) return "off";
  let result: WebhookResult;
  try {
    const token = await accessToken(db, env, conn.id, deps);
    const job = await fetchJobFor(env, token, hook.topic, hook.itemId, deps.fetch ?? fetch);
    const idea = jobIdea(job, now());
    if (!idea) result = "no_idea";
    else if (conn.props.ideas.some((i) => i.jobId === idea.jobId)) result = "duplicate"; // VISIT_COMPLETE + JOB_CLOSED, redeliveries
    else {
      const updated = await mutateConnection(db, conn.id, (p) => ({ props: { ...p, ideas: mergeIdeas(p.ideas ?? [], idea) } }));
      if (updated?.workspaceId) await steerWeeklyDrop(db, updated, now());
      result = "idea";
    }
  } catch (e) {
    await recordSystemRun(db, JOBBER_SYSTEM, { ok: false, error: e instanceof Error ? e.message : String(e) }, now());
    if (e instanceof JobberAuthError) return "auth_failed";
    throw e;
  }
  await recordSystemRun(db, JOBBER_SYSTEM, { ok: true, outputs: result === "idea" ? 1 : 0 }, now());
  return result;
}

/** Latest Jobber ideas -> AdsAutopilot.focus, unless the member wrote their own focus. Returns the focus written (or null). */
export async function steerWeeklyDrop(db: JobberDb, conn: Connection, now: Date = new Date()): Promise<string | null> {
  if (!conn.workspaceId) return null;
  const focus = ideasToFocus(conn.props.ideas ?? []);
  if (!focus) return null;
  const ap = await db.adsAutopilot.findUnique({ where: { workspaceId: conn.workspaceId }, select: { focus: true } });
  if (!mayWriteFocus(ap?.focus, conn.props.lastFocus) || ap?.focus === focus) return null;
  await db.adsAutopilot.upsert({ where: { workspaceId: conn.workspaceId }, create: { workspaceId: conn.workspaceId, focus, focusUpdatedAt: now }, update: { focus, focusUpdatedAt: now } });
  await mutateConnection(db, conn.id, (p) => ({ props: { ...p, lastFocus: focus } }));
  return focus;
}
