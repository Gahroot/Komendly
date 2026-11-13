import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { getBalance } from "@/lib/ads/credits";
import { PRIORITY } from "@/lib/ads/run";
import { AdsHttpError, adsErrorResponse, isPaidWorkspace } from "@/lib/ads/workspace";
import { canStartStudioTurn, STUDIO_TURN_JOB_TYPE, STUDIO_UPLOAD_LIMITS, type StudioTurnPayload } from "@/lib/studio/contracts";
import { messageView, requireStudioSession, sessionSummary } from "@/lib/studio/server";
import { trackAdsEvent } from "@/lib/ads/events";
import { concurrentLimit, isUnlimitedPlan, UNLIMITED_BUSY_MESSAGE } from "@/lib/ads/billing-config";
import { forwardStudioFirstRender } from "@/lib/studio/analytics";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  content: z.string().trim().min(1).max(8000),
  uploadIds: z.array(z.string().min(1).max(64)).max(STUDIO_UPLOAD_LIMITS.maxFilesPerMessage).default([]),
});

const TURNS_PER_HOUR = 60;

/** Send a chat message: gate, then ONE transaction for user msg + queued assistant msg + studio_turn job. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { user, workspace, session } = await requireStudioSession((await params).id);
    if (workspace.suspendedAt) throw new AdsHttpError(403, "suspended", "This workspace is suspended.");
    if (session.archivedAt) throw new AdsHttpError(409, "archived", "This chat is archived. Restore it to keep going.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Type a message for Ozzy first.");
    const uploadIds = [...new Set(parsed.data.uploadIds)];
    if (session.status === "queued" || session.status === "working") throw new AdsHttpError(409, "busy", "Ozzy is still working on the last message.");
    if (!(await rateLimit(`studio-turns:${user.id}`, TURNS_PER_HOUR, 3600))) throw new AdsHttpError(429, "rate_limited", "That's a lot of messages this hour. Give Ozzy a breather and try again soon.");

    if (uploadIds.length > 0) {
      const ok = await prisma.studioUpload.count({ where: { id: { in: uploadIds }, workspaceId: workspace.id, status: { in: ["uploaded", "ready"] } } });
      if (ok !== uploadIds.length) throw new AdsHttpError(400, "upload_not_ready", "One of your files hasn't finished uploading yet.");
    }

    const paid = isPaidWorkspace(workspace);
    // Unlimited plan: Studio costs 0 credits; fair use = one Studio turn in progress per workspace.
    const unlimited = isUnlimitedPlan(workspace);
    const busyElsewhere = { workspaceId: workspace.id, id: { not: session.id }, status: { in: ["queued", "working"] } };
    if (unlimited && (await prisma.studioSession.count({ where: busyElsewhere })) >= concurrentLimit(workspace)) throw new AdsHttpError(409, "busy", UNLIMITED_BUSY_MESSAGE);
    const [balance, priorRenders] = await Promise.all([getBalance(workspace.id), prisma.studioRender.count({ where: { sessionId: session.id } })]);
    const gate = canStartStudioTurn({ priorRenders, sessionFree: session.freeVideo, freeVideosLeft: workspace.studioFreeVideos, balance, isPaidWorkspace: paid, unlimited });
    if (!gate.ok) {
      await trackAdsEvent("studio_paywall_shown", { workspaceId: workspace.id, userId: user.id, props: { code: gate.code, sessionId: session.id, neededCredits: gate.neededCredits } });
      return NextResponse.json({ error: "You need credits for this one.", code: gate.code, neededCredits: gate.neededCredits }, { status: 402 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Claim the session for this turn (guards double-send races).
      const claimed = await tx.studioSession.updateMany({
        where: { id: session.id, status: { notIn: ["queued", "working"] } },
        data: { status: "queued", lastActivityAt: new Date() },
      });
      if (claimed.count !== 1) throw new AdsHttpError(409, "busy", "Ozzy is still working on the last message.");
      if (unlimited && (await tx.studioSession.count({ where: busyElsewhere })) >= concurrentLimit(workspace)) throw new AdsHttpError(409, "busy", UNLIMITED_BUSY_MESSAGE);
      const userMessage = await tx.studioMessage.create({
        data: { sessionId: session.id, role: "user", content: parsed.data.content, attachments: uploadIds.map((uploadId) => ({ uploadId })), status: "done" },
      });
      const assistant = await tx.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
      const payload: StudioTurnPayload = { sessionId: session.id, userMessageId: userMessage.id, assistantMessageId: assistant.id };
      const job = await tx.adJob.create({
        data: { type: STUDIO_TURN_JOB_TYPE, workspaceId: workspace.id, payload: { ...payload }, priority: paid ? PRIORITY.paid : PRIORITY.trial, maxAttempts: 2 },
      });
      const assistantWithJob = await tx.studioMessage.update({ where: { id: assistant.id }, data: { jobId: job.id } });
      if (uploadIds.length > 0) await tx.studioUpload.updateMany({ where: { id: { in: uploadIds }, sessionId: null }, data: { sessionId: session.id } });
      const s = await tx.studioSession.findUniqueOrThrow({ where: { id: session.id } });
      return { userMessage, assistant: assistantWithJob, session: s };
    });

    const turn = await prisma.studioMessage.count({ where: { sessionId: session.id, role: "user" } });
    await trackAdsEvent("studio_message_sent", { workspaceId: workspace.id, userId: user.id, props: { turn, uploads: uploadIds.length, sessionId: session.id } });
    await forwardStudioFirstRender(workspace.id, user.id);
    return NextResponse.json(
      { userMessage: messageView(result.userMessage), assistantMessage: messageView(result.assistant), session: sessionSummary(result.session) },
      { status: 201 },
    );
  } catch (error) {
    return adsErrorResponse(error);
  }
}
