import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { holdRun } from "@/lib/ads/run-confirm";
import { adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireWorkspaceMember({ runId: id });
    const run = await prisma.adRun.findUniqueOrThrow({ where: { id } });
    const deadline = await holdRun(run);
    return NextResponse.json({ confirmDeadline: deadline.toISOString() });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
