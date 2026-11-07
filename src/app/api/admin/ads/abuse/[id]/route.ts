import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({ action: z.enum(["dismiss", "action", "suspend", "unsuspend"]) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const flag = await prisma.abuseFlag.findUnique({ where: { id } });
  if (!flag) return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  const { action } = parsed.data;
  if ((action === "suspend" || action === "unsuspend") && !flag.workspaceId) {
    return NextResponse.json({ error: "Flag has no workspace" }, { status: 400 });
  }
  const resolved = { resolvedBy: admin.user.id, resolvedAt: new Date() };
  await prisma.$transaction([
    ...(action === "suspend" && flag.workspaceId ? [prisma.adsWorkspace.update({ where: { id: flag.workspaceId }, data: { suspendedAt: new Date() } })] : []),
    ...(action === "unsuspend" && flag.workspaceId ? [prisma.adsWorkspace.update({ where: { id: flag.workspaceId }, data: { suspendedAt: null } })] : []),
    prisma.abuseFlag.update({
      where: { id },
      data: action === "unsuspend" ? { status: "dismissed", ...resolved } : { status: action === "dismiss" ? "dismissed" : "actioned", ...resolved },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
