import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AdsHttpError, adsErrorResponse } from "@/lib/ads/workspace";
import { loadStudioThread, requireStudioSession, sessionSummary } from "@/lib/studio/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { workspace, session } = await requireStudioSession((await params).id);
    return NextResponse.json(await loadStudioThread(session, workspace));
  } catch (error) {
    return adsErrorResponse(error);
  }
}

const Patch = z.object({ title: z.string().trim().min(1).max(80).optional(), archived: z.boolean().optional() });

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { session } = await requireStudioSession((await params).id);
    const parsed = Patch.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Invalid request.");
    const updated = await prisma.studioSession.update({
      where: { id: session.id },
      data: {
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.archived === undefined ? {} : { archivedAt: parsed.data.archived ? new Date() : null }),
      },
    });
    return NextResponse.json({ session: sessionSummary(updated) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
