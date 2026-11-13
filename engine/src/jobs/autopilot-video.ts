// Ozzy Autopilot weekly video: one Studio session per workspace per ISO week ("Your Monday video") with one queued
// studio_turn that makes a 15s 9:16 brand video from the focus, the brand and the latest uploads. Never charged
// (StudioSession.autopilotWeek -> engine/src/studio/charge.ts decideCharge autopilot path). Idempotent via the
// unique (workspaceId, autopilotWeek); queued at AUTOPILOT_VIDEO_PRIORITY so customer jobs always go first.
import { Prisma } from "@prisma/client";
import { AUTOPILOT_VIDEO_PRIORITY, AUTOPILOT_VIDEO_TITLE, AUTOPILOT_VIDEO_UPLOADS, autopilotVideoPrompt, upcomingMoments } from "../../../src/lib/ads/autopilot";
import { STUDIO_DEFAULT_MODEL, STUDIO_DEFAULT_THINKING, STUDIO_TURN_JOB_TYPE, type StudioTurnPayload } from "../../../src/lib/studio/contracts";
import type { Db } from "../db";

export type AutopilotVideoStart = { created: true; sessionId: string; jobId: string } | { created: false; reason: "already_this_week" | "no_brand" };

export async function startAutopilotVideo(db: Db, ws: { id: string; ownerId: string }, o: { week: string; focus: string | null; tz: string | null; now: Date }): Promise<AutopilotVideoStart> {
  const existing = await db.studioSession.findFirst({ where: { workspaceId: ws.id, autopilotWeek: o.week }, select: { id: true } });
  if (existing) return { created: false, reason: "already_this_week" };
  const bp = await db.brandProfile.findFirst({ where: { workspaceId: ws.id }, orderBy: { updatedAt: "desc" }, select: { name: true } });
  if (!bp) return { created: false, reason: "no_brand" };
  const uploads = await db.studioUpload.findMany({
    where: { workspaceId: ws.id, status: { in: ["uploaded", "ready"] }, OR: [{ mime: { startsWith: "image/" } }, { mime: { startsWith: "video/" } }] },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: AUTOPILOT_VIDEO_UPLOADS,
    select: { id: true },
  });
  const content = autopilotVideoPrompt({ focus: o.focus, brandName: bp.name, moments: upcomingMoments(o.now, o.tz), uploads: uploads.length });
  try {
    return await db.$transaction(async (tx) => {
      const session = await tx.studioSession.create({
        data: { workspaceId: ws.id, userId: ws.ownerId, title: AUTOPILOT_VIDEO_TITLE, status: "queued", model: STUDIO_DEFAULT_MODEL, thinking: STUDIO_DEFAULT_THINKING, autopilotWeek: o.week, lastActivityAt: o.now },
        select: { id: true },
      });
      const user = await tx.studioMessage.create({ data: { sessionId: session.id, role: "user", content, attachments: uploads.map((u) => ({ uploadId: u.id })), status: "done" }, select: { id: true } });
      const assistant = await tx.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" }, select: { id: true } });
      const payload: StudioTurnPayload = { sessionId: session.id, userMessageId: user.id, assistantMessageId: assistant.id };
      const job = await tx.adJob.create({ data: { type: STUDIO_TURN_JOB_TYPE, workspaceId: ws.id, payload: { ...payload, autopilot: true }, priority: AUTOPILOT_VIDEO_PRIORITY, maxAttempts: 2 }, select: { id: true } });
      await tx.studioMessage.update({ where: { id: assistant.id }, data: { jobId: job.id } });
      await tx.adsEvent.create({ data: { name: "autopilot_video_started", workspaceId: ws.id, userId: ws.ownerId, props: { week: o.week, sessionId: session.id, uploads: uploads.length, hasFocus: Boolean(o.focus) } } });
      return { created: true as const, sessionId: session.id, jobId: job.id };
    });
  } catch (e) {
    // Another tick/replica created this week's session first (unique workspaceId+autopilotWeek).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { created: false, reason: "already_this_week" };
    throw e;
  }
}
