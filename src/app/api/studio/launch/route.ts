// "Make a launch video for what we just shipped": Ozzy records the real product, then cuts a launch video.
// Public URL: studio_capture job (the engine records the site, stores the clips, then queues the launch studio_turn).
// uploadIds (the CLI recorded a local/staging app itself): the launch turn is queued directly with those clips.
// Counts exactly like any Studio video (free first video, credits after).
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
  launchMessage,
  launchTitle,
  normalizeLaunchUrl,
  STUDIO_CAPTURE_JOB_TYPE,
  STUDIO_LAUNCH_ASPECTS,
  STUDIO_TURN_JOB_TYPE,
  type StudioCapturePayload,
  type StudioLaunchInfo,
  type StudioTurnPayload,
} from "@/lib/studio/contracts";
import { messageView, sessionSummary, studioAccess } from "@/lib/studio/server";

const Body = z.object({
  url: z.string().trim().min(1).max(2000),
  notes: z.string().trim().max(4000).optional(),
  aspect: z.enum(STUDIO_LAUNCH_ASPECTS).optional(),
  uploadIds: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
  /** What each uploaded clip shows (from the CLI recorder), by upload filename. */
  footage: z.array(z.object({ filename: z.string().max(200), shows: z.string().max(300) })).max(20).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user, workspace } = await studioAccess();
    if (workspace.suspendedAt) throw new AdsHttpError(403, "suspended", "This workspace is suspended.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Give me the address of what you shipped, e.g. https://yourapp.com.");
    const { uploadIds, aspect = "16:9" } = parsed.data;
    const notes = parsed.data.notes || undefined;
    const url = normalizeLaunchUrl(parsed.data.url, { local: Boolean(uploadIds) });
    if (!url) throw new AdsHttpError(400, "invalid_url", "That doesn't look like a web address. Try something like https://yourapp.com.");
    if (!uploadIds) {
      try {
        await assertSafeTargetUrl(url);
      } catch {
        throw new AdsHttpError(400, "invalid_url", "I can't open that address from here. For a local or staging app, run `npx komendly launch <url>` on your machine.");
      }
    } else {
      const ups = await prisma.studioUpload.findMany({ where: { id: { in: uploadIds }, workspaceId: workspace.id }, select: { id: true, status: true, mime: true, filename: true } });
      if (ups.length !== new Set(uploadIds).size) throw new AdsHttpError(404, "not_found", "Not found.");
      if (ups.some((u) => !["uploaded", "ready"].includes(u.status))) throw new AdsHttpError(400, "upload_not_ready", "Your recording hasn't finished uploading yet.");
      if (ups.some((u) => !/^(video|image)\//.test(u.mime))) throw new AdsHttpError(415, "unsupported_type", "Upload videos or screenshots of your product.");
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
      await trackAdsEvent("studio_paywall_shown", { workspaceId: fresh.id, userId: user.id, props: { code: gate.code, neededCredits: gate.neededCredits, launch: true } });
      return NextResponse.json({ error: "You need credits for this one.", code: gate.code, neededCredits: gate.neededCredits }, { status: 402 });
    }

    const content = launchMessage({ url, notes: [notes ?? "", aspect !== "16:9" ? `Make it ${aspect}.` : ""].filter(Boolean).join("\n") || null });
    const priority = paid ? PRIORITY.paid : PRIORITY.trial;
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.studioSession.create({
        data: { workspaceId: fresh.id, userId: user.id, title: launchTitle(url), starterId: "launch", freeVideo, status: "queued", lastActivityAt: new Date() },
      });
      if (uploadIds) await tx.studioUpload.updateMany({ where: { id: { in: uploadIds }, workspaceId: fresh.id, sessionId: null }, data: { sessionId: session.id } });
      const attachments = (uploadIds ?? []).map((uploadId) => ({ uploadId }));
      const userMessage = await tx.studioMessage.create({ data: { sessionId: session.id, role: "user", content, attachments, status: "done" } });
      let assistant = await tx.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
      const ids = { sessionId: session.id, userMessageId: userMessage.id, assistantMessageId: assistant.id };
      let job;
      if (uploadIds) {
        const launch: StudioLaunchInfo = { url, aspect, footage: parsed.data.footage ?? [], ...(notes ? { notes } : {}) };
        const turn: StudioTurnPayload = { ...ids, launch };
        job = await tx.adJob.create({ data: { type: STUDIO_TURN_JOB_TYPE, workspaceId: fresh.id, payload: { ...turn }, priority, maxAttempts: 2 } });
      } else {
        // The capture job id sits on the assistant message until the engine swaps in the turn job.
        const capture: StudioCapturePayload = { ...ids, url, aspect, ...(notes ? { notes } : {}) };
        job = await tx.adJob.create({ data: { type: STUDIO_CAPTURE_JOB_TYPE, workspaceId: fresh.id, payload: { ...capture }, priority, maxAttempts: 2 } });
      }
      assistant = await tx.studioMessage.update({ where: { id: assistant.id }, data: { jobId: job.id } });
      return { session, userMessage, assistant };
    });

    await trackAdsEvent("studio_session_started", { workspaceId: fresh.id, userId: user.id, props: { starterId: "launch", free: freeVideo } });
    await trackAdsEvent("studio_launch_started", { workspaceId: fresh.id, userId: user.id, props: { sessionId: result.session.id, source: uploadIds ? "local" : "capture", host: new URL(url).hostname, aspect, free: freeVideo } });
    await trackAdsEvent("studio_message_sent", { workspaceId: fresh.id, userId: user.id, props: { turn: 1, uploads: uploadIds?.length ?? 0, sessionId: result.session.id, launch: true } });
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
