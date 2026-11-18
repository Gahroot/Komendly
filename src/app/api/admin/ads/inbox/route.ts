import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/ads/billing-auth";

const Body = z.object({ emailId: z.string().min(1).max(200) });

/** Mark a founder-inbox reply handled (AdsEvent email_reply_handled; idempotent). */
export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { emailId } = parsed.data;
  const exists = await prisma.adsEvent.findFirst({ where: { name: "email_reply_handled", props: { path: ["emailId"], equals: emailId } }, select: { id: true } });
  if (!exists) await prisma.adsEvent.create({ data: { name: "email_reply_handled", userId: admin.user.id, props: { emailId, actorId: admin.user.id } } });
  return NextResponse.json({ ok: true });
}
