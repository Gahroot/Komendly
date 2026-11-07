import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({ action: z.enum(["retry", "cancel"]) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const data =
    parsed.data.action === "retry"
      ? { status: "queued" as const, attempts: 0, runAt: new Date(), lockedBy: null, lockedAt: null, finishedAt: null }
      : { status: "canceled" as const, finishedAt: new Date(), lockedBy: null, lockedAt: null };
  // Only failed/dead/queued jobs can be touched: never yank a running job from a worker.
  const res = await prisma.adJob.updateMany({ where: { id, status: { in: ["failed", "dead", "queued"] } }, data });
  if (res.count === 0) return NextResponse.json({ error: "Job not found or currently running" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
