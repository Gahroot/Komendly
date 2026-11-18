import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Poll one free-tool job (id is an unguessable cuid; no PII in the response). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.freeToolJob.findUnique({ where: { id }, select: { status: true, result: true, error: true, tool: true } }).catch(() => null);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ status: job.status, tool: job.tool, result: job.status === "done" ? job.result : null, error: job.status === "failed" ? "We couldn't finish this one. Please try again." : null });
}
