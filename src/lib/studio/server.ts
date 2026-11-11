// Ozzy Studio server helpers: tenant guards, account summary and row -> view serialization.
import type { AdsWorkspace, StudioMessage, StudioRender, StudioSession, StudioUpload, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AdsHttpError, getOrCreateWorkspace, isPaidWorkspace, requireUser, requireWorkspaceMember } from "@/lib/ads/workspace";
import { isStudioLaunchOfferOpen, STUDIO_LAUNCH_OFFER } from "@/lib/hub/money-model";
import { getLaunchOfferState, type LaunchOfferState } from "@/lib/ads/launch-offer";
import { arbitrateStudioOffer } from "./bridge";
import type { MessageStatus, RenderView, StudioAccountView, ThreadEvent, ThreadMessage, UploadView } from "./thread";

export interface StudioAccess {
  user: User;
  workspace: AdsWorkspace;
}

/** Signed-in user + their primary workspace (created on first use). */
export async function studioAccess(): Promise<StudioAccess> {
  const user = await requireUser();
  return { user, workspace: await getOrCreateWorkspace(user) };
}

/** A session the caller may see (workspace member), else 404. Never trusts client ids. */
export async function requireStudioSession(sessionId: string): Promise<StudioAccess & { session: StudioSession }> {
  const session = await prisma.studioSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AdsHttpError(404, "not_found", "Not found.");
  const access = await requireWorkspaceMember({ workspaceId: session.workspaceId });
  return { user: access.user, workspace: access.workspace, session };
}

/** True when a key lives under one of the caller's workspaces' studio prefix. */
export async function workspaceOwnsKey(userId: string, key: string): Promise<boolean> {
  const m = /^studio\/([^/]+)\//.exec(key);
  if (!m?.[1] || key.includes("..")) return false;
  const member = await prisma.adsWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: m[1], userId } }, select: { userId: true } });
  return member !== null;
}

/**
 * Account + the ONE offer to show (bridge.ts arbitrateStudioOffer): an open Launch Quarter window replaces the
 * Studio launch offer. Pass `lq` from getLaunchOfferState (studioAccountFor does); without it no LQ is assumed.
 */
export function studioAccount(ws: AdsWorkspace, now: Date, lq: LaunchOfferState | null = null): StudioAccountView {
  const paid = isPaidWorkspace(ws);
  const choice = arbitrateStudioOffer({ paid, suspended: ws.suspendedAt !== null, launchQuarterOpen: lq?.open === true, studioLaunchOpen: isStudioLaunchOfferOpen(ws.studioOfferReadyAt, now) });
  const open = choice === "studio_launch";
  return {
    launchQuarter: { open: choice === "launch_quarter", endsAt: choice === "launch_quarter" && lq?.expiresAt ? lq.expiresAt.toISOString() : null },
    balance: ws.creditBalance,
    paid,
    plan: ws.adsPlan,
    freeVideosLeft: ws.studioFreeVideos,
    offer: {
      open,
      endsAt: open && ws.studioOfferReadyAt ? new Date(ws.studioOfferReadyAt.getTime() + STUDIO_LAUNCH_OFFER.windowHours * 3_600_000).toISOString() : null,
    },
  };
}

/** studioAccount with the workspace's Launch Quarter state read from the DB (server truth). */
export async function studioAccountFor(ws: AdsWorkspace, now: Date = new Date()): Promise<StudioAccountView> {
  const lq = isPaidWorkspace(ws) ? null : await getLaunchOfferState(ws.id, now);
  return studioAccount(ws, now, lq);
}

export const ACTIVE_SESSION_STATUSES = ["queued", "working"] as const;

function attachmentIds(json: unknown, field: string): string[] {
  if (!Array.isArray(json)) return [];
  const out: string[] = [];
  for (const a of json) {
    if (a && typeof a === "object" && typeof (a as Record<string, unknown>)[field] === "string") out.push((a as Record<string, string>)[field] as string);
  }
  return out;
}

const STATUSES: readonly string[] = ["queued", "streaming", "done", "error", "cancelled"];

export function messageView(m: StudioMessage): ThreadMessage {
  const status = (STATUSES.includes(m.status) ? m.status : "done") as MessageStatus;
  const final = status !== "queued" && status !== "streaming";
  return {
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    // In-flight assistant content is rebuilt from text deltas.
    content: final || m.role === "user" ? m.content : "",
    status,
    createdAt: m.createdAt.toISOString(),
    uploadIds: m.role === "user" ? attachmentIds(m.attachments, "uploadId") : [],
    steps: [],
    previews: [],
    question: null,
    renderIds: attachmentIds(m.attachments, "renderId"),
    phase: null,
    phaseLabel: null,
    error: m.error,
    final: final && m.role === "assistant",
  };
}

export function renderView(r: StudioRender): RenderView {
  return {
    id: r.id,
    version: r.version,
    ratio: r.ratio,
    seconds: r.seconds,
    watermarked: r.watermarked,
    free: r.free,
    messageId: r.messageId,
    posterKey: r.posterKey,
    shareToken: r.shareToken,
    createdAt: r.createdAt.toISOString(),
  };
}

export function uploadView(u: StudioUpload): UploadView {
  return { id: u.id, filename: u.filename, mime: u.mime, bytes: u.bytes, status: u.status, key: u.key, posterKey: u.posterKey, durationSec: u.durationSec };
}

export function eventView(e: { id: bigint; messageId: string | null; type: string; data: unknown }): ThreadEvent {
  const data = e.data && typeof e.data === "object" && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : {};
  return { id: e.id.toString(), messageId: e.messageId, type: e.type, data };
}

export function sessionSummary(s: StudioSession) {
  return { id: s.id, title: s.title, status: s.status, freeVideo: s.freeVideo, lastActivityAt: s.lastActivityAt.toISOString(), archived: s.archivedAt !== null };
}

/** Event ids are BigInt; parse a client cursor safely. */
export function parseCursor(raw: string | null | undefined): bigint {
  if (!raw || !/^\d{1,19}$/.test(raw)) return BigInt(0);
  return BigInt(raw);
}

/** Everything the chat needs to render a session: messages, renders, uploads, replayable events and the account. */
export async function loadStudioThread(session: StudioSession, workspace: AdsWorkspace) {
  const [messages, renders, uploads] = await Promise.all([
    prisma.studioMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" }, take: 500 }),
    prisma.studioRender.findMany({ where: { sessionId: session.id }, orderBy: { version: "asc" } }),
    prisma.studioUpload.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const active = messages.filter((m) => m.role === "assistant" && (m.status === "queued" || m.status === "streaming")).map((m) => m.id);
  // Finished messages: replay structure (steps, previews, questions, renders) but not text. Active ones: everything.
  const events = await prisma.studioEvent.findMany({
    where: { sessionId: session.id, OR: [{ type: { not: "text_delta" } }, { messageId: { in: active } }] },
    orderBy: { id: "asc" },
    take: 3000,
  });
  const last = await prisma.studioEvent.findFirst({ where: { sessionId: session.id }, orderBy: { id: "desc" }, select: { id: true } });
  return {
    session: sessionSummary(session),
    messages: messages.map(messageView),
    renders: renders.map(renderView),
    uploads: uploads.map(uploadView),
    events: events.map(eventView),
    lastEventId: last ? last.id.toString() : "0",
    account: await studioAccountFor(workspace),
  };
}
