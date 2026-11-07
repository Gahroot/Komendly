import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({ suspended: z.boolean() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const res = await prisma.adsWorkspace.updateMany({ where: { id }, data: { suspendedAt: parsed.data.suspended ? new Date() : null } });
  if (res.count === 0) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
