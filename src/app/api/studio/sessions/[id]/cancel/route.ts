import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse } from "@/lib/ads/workspace";
import { requireStudioSession } from "@/lib/studio/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Stop the current turn. Same DB signal as ads aborts: AdJob.status = canceled (the engine checks its job row and
 * aborts the agent). The assistant message is cancelled and an `error {code: cancelled}` event closes open streams.
 */
export async function POST(_request: NextRequest, { params }: Ctx) {
  try {
    const { session } = await requireStudioSession((await params).id);
    const active = await prisma.studioMessage.findFirst({
      where: { sessionId: session.id, role: "assistant", status: { in: ["queued", "streaming"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!active) {
      await prisma.studioSession.updateMany({ where: { id: session.id, status: { in: ["queued", "working"] } }, data: { status: "idle" } });
      return NextResponse.json({ ok: true, cancelled: false });
    }
    await prisma.$transaction(async (tx) => {
      if (active.jobId) {
        await tx.adJob.updateMany({ where: { id: active.jobId, status: { in: ["queued", "running"] } }, data: { status: "canceled", finishedAt: new Date(), lastError: "cancelled by user" } });
      }
      await tx.studioMessage.update({ where: { id: active.id }, data: { status: "cancelled" } });
      await tx.studioSession.update({ where: { id: session.id }, data: { status: "idle", lastActivityAt: new Date() } });
      await tx.studioEvent.create({ data: { sessionId: session.id, messageId: active.id, type: "error", data: { message: "Stopped.", code: "cancelled" } } });
    });
    return NextResponse.json({ ok: true, cancelled: true, messageId: active.id });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
