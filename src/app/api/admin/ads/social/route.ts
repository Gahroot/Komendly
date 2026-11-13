// Admin actions for Ozzy's daily post: switch on/off, posting hour (ET), disconnect the Page.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { prisma } from "@/lib/prisma";
import { KLY_SETTINGS_ID } from "@/lib/kly/settings";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable"), enabled: z.boolean() }),
  z.object({ action: z.literal("hour"), hourEt: z.coerce.number().int().min(0).max(23) }),
  z.object({ action: z.literal("disconnect") }),
]);

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const a = parsed.data;
  if (a.action === "disconnect") {
    await prisma.klySocialConnection.deleteMany({ where: { id: "komendly" } });
    await prisma.klySettings.updateMany({ where: { id: KLY_SETTINGS_ID }, data: { socialEnabled: false } });
    return NextResponse.json({ ok: true });
  }
  if (a.action === "enable" && a.enabled && !(await prisma.klySocialConnection.findUnique({ where: { id: "komendly" } }))) {
    return NextResponse.json({ error: "Connect the Komendly Page first" }, { status: 400 });
  }
  const data = a.action === "enable" ? { socialEnabled: a.enabled } : { socialHourEt: a.hourEt };
  await prisma.klySettings.upsert({ where: { id: KLY_SETTINGS_ID }, create: { id: KLY_SETTINGS_ID, ...data, updatedBy: admin.user.id }, update: { ...data, updatedBy: admin.user.id } });
  return NextResponse.json({ ok: true });
}
