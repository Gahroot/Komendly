// "Remix any ad": start a Studio chat from an ad the user saw (a link, or an uploaded screen recording/screenshot).
// Link: StudioUpload(pending) + studio_ingest job (the engine downloads the ad, then queues the studio_turn).
// Upload: the turn is queued directly. Either way the reference is attached with { reference: true } and the
// remix counts exactly like any Studio video (free first video, credits after).
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSafeTargetUrl, rateLimit } from "@/lib/ads/abuse";
import { getBalance } from "@/lib/ads/credits";
import { trackAdsEvent } from "@/lib/ads/events";
import { DEVICE_COOKIE, fingerprintFrom, PRIORITY } from "@/lib/ads/run";
import { AdsHttpError, adsErrorResponse, isPaidWorkspace } from "@/lib/ads/workspace";
import { concurrentLimit, isUnlimitedPlan, UNLIMITED_BUSY_MESSAGE } from "@/lib/ads/billing-config";
import { claimStudioFreeVideo, revokeStudioFreeVideos } from "@/lib/studio/abuse";
import {
  canStartStudioTurn,
  normalizeRemixUrl,
  remixMessage,
  STUDIO_INGEST_JOB_TYPE,
  STUDIO_TURN_JOB_TYPE,
  studioKeys,
  type StudioIngestPayload,
  type StudioReferenceAttachment,
  type StudioTurnPayload,
} from "@/lib/studio/contracts";
import { messageView, sessionSummary, studioAccess } from "@/lib/studio/server";

const Body = z
  .object({
    url: z.string().trim().max(2000).optional(),
    uploadId: z.string().min(1).max(64).optional(),
    notes: z.string().trim().max(2000).optional(),
    aspect: z.enum(["9:16", "1:1", "4:5", "16:9"]).optional(),
  })
  .refine((b) => b.url || b.uploadId, "url or uploadId required");

export async function POST(request: NextRequest) {
  try {
    const { user, workspace } = await studioAccess();
    if (workspace.suspendedAt) throw new AdsHttpError(403, "suspended", "This workspace is suspended.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Paste a link to the ad, or upload a recording of it.");
    const { uploadId: givenUpload, aspect } = parsed.data;
    let url: string | null = null;
    if (parsed.data.url) {
      url = normalizeRemixUrl(parsed.data.url);
      if (!url) throw new AdsHttpError(400, "invalid_url", "That doesn't look like a link. Paste the ad's address, or upload a recording of it.");
      try {
        await assertSafeTargetUrl(url);
      } catch {
        throw new AdsHttpError(400, "invalid_url", "I can't open that link. Paste a public link to the ad, or upload a recording of it.");
      }
    }
    if (givenUpload) {
      const up = await prisma.studioUpload.findFirst({ where: { id: givenUpload, workspaceId: workspace.id }, select: { status: true, mime: true } });
      if (!up) throw new AdsHttpError(404, "not_found", "Not found.");
      if (!["uploaded", "ready"].includes(up.status)) throw new AdsHttpError(400, "upload_not_ready", "Your file hasn't finished uploading yet.");
      if (!/^(video|image)\//.test(up.mime)) throw new AdsHttpError(415, "unsupported_type", "Upload a video or a screenshot of the ad.");
    }
    if (!(await rateLimit(`studio-sessions:${user.id}`, 40, 3600))) throw new AdsHttpError(429, "rate_limited", "Slow down a little: too many new chats this hour.");
    if (!(await rateLimit(`studio-turns:${user.id}`, 60, 3600))) throw new AdsHttpError(429, "rate_limited", "That's a lot of messages this hour. Give Ozzy a breather and try again soon.");

    // Same free-video guard as POST /api/studio/sessions (one free video per person).
    const paid = isPaidWorkspace(workspace);
    let freeVideo = !paid && workspace.studioFreeVideos > 0;
    const guard = freeVideo ? await claimStudioFreeVideo({ workspaceId: workspace.id, userId: user.id, email: user.email, fp: fingerprintFrom(request) }) : null;
    if (guard && !guard.ok) {
      freeVideo = false;
      await revokeStudioFreeVideos(workspace.id);
      await trackAdsEvent("studio_free_blocked", { workspaceId: workspace.id, userId: user.id, props: { reason: guard.reason } });
    }
    const fresh = await prisma.adsWorkspace.findUniqueOrThrow({ where: { id: workspace.id } });
    const unlimited = isUnlimitedPlan(fresh);
    if (unlimited && (await prisma.studioSession.count({ where: { workspaceId: fresh.id, status: { in: ["queued", "working"] } } })) >= concurrentLimit(fresh)) throw new AdsHttpError(409, "busy", UNLIMITED_BUSY_MESSAGE);
    const gate = canStartStudioTurn({ priorRenders: 0, sessionFree: freeVideo, freeVideosLeft: fresh.studioFreeVideos, balance: await getBalance(fresh.id), isPaidWorkspace: paid, unlimited });
    if (!gate.ok) {
      await trackAdsEvent("studio_paywall_shown", { workspaceId: fresh.id, userId: user.id, props: { code: gate.code, neededCredits: gate.neededCredits, remix: true } });
      return NextResponse.json({ error: "You need credits for this one.", code: gate.code, neededCredits: gate.neededCredits }, { status: 402 });
    }

    const notes = [parsed.data.notes ?? "", aspect ? `Make it ${aspect}.` : ""].filter(Boolean).join("\n");
    const content = remixMessage({ url, notes });
    const priority = paid ? PRIORITY.paid : PRIORITY.trial;
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.studioSession.create({
        data: { workspaceId: fresh.id, userId: user.id, title: "Ad remix", starterId: "remix", freeVideo, status: "queued", lastActivityAt: new Date() },
      });
      let uploadId = givenUpload ?? null;
      if (url) {
        uploadId = randomUUID().replace(/-/g, "");
        await tx.studioUpload.create({ data: { id: uploadId, workspaceId: fresh.id, userId: user.id, sessionId: session.id, key: studioKeys.upload(fresh.id, uploadId, "reference"), filename: "reference", mime: "video/mp4", bytes: 0, status: "pending" } });
      } else if (uploadId) {
        await tx.studioUpload.updateMany({ where: { id: uploadId, sessionId: null }, data: { sessionId: session.id } });
      }
      const ref: StudioReferenceAttachment = { uploadId: uploadId ?? "", reference: true, ...(url ? { sourceUrl: url } : {}) };
      const userMessage = await tx.studioMessage.create({ data: { sessionId: session.id, role: "user", content, attachments: [{ ...ref }], status: "done" } });
      let assistant = await tx.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
      const turn: StudioTurnPayload = { sessionId: session.id, userMessageId: userMessage.id, assistantMessageId: assistant.id };
      if (url && uploadId) {
        const ingest: StudioIngestPayload = { ...turn, uploadId, url };
        // The ingest job id sits on the assistant message until the engine swaps in the turn job.
        const job = await tx.adJob.create({ data: { type: STUDIO_INGEST_JOB_TYPE, workspaceId: fresh.id, payload: { ...ingest }, priority, maxAttempts: 2 } });
        assistant = await tx.studioMessage.update({ where: { id: assistant.id }, data: { jobId: job.id } });
      } else {
        const job = await tx.adJob.create({ data: { type: STUDIO_TURN_JOB_TYPE, workspaceId: fresh.id, payload: { ...turn }, priority, maxAttempts: 2 } });
        assistant = await tx.studioMessage.update({ where: { id: assistant.id }, data: { jobId: job.id } });
      }
      return { session, userMessage, assistant };
    });

    await trackAdsEvent("studio_session_started", { workspaceId: fresh.id, userId: user.id, props: { starterId: "remix", free: freeVideo } });
    await trackAdsEvent("studio_remix_started", { workspaceId: fresh.id, userId: user.id, props: { sessionId: result.session.id, source: url ? "link" : "upload", host: url ? new URL(url).hostname : null, free: freeVideo } });
    await trackAdsEvent("studio_message_sent", { workspaceId: fresh.id, userId: user.id, props: { turn: 1, uploads: 1, sessionId: result.session.id, remix: true } });
    const res = NextResponse.json(
      { session: sessionSummary(result.session), userMessage: messageView(result.userMessage), assistantMessage: messageView(result.assistant), url: `/studio/${result.session.id}` },
      { status: 201 },
    );
    if (!request.cookies.get(DEVICE_COOKIE)) res.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (error) {
    return adsErrorResponse(error);
  }
}
