// Emergency stop: POST { action: "stop" | "resume" }. Admin only. Turns OFF only sending/posting/outreach flags (EMERGENCY_FLAGS);
// billing, delivery, inbound handling and monitoring keep running. Resume restores exactly the flags the matching stop turned off.
// Every call writes an audit AdsEvent (ops_emergency_stop / ops_emergency_resume) and an ops_decision.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { prisma } from "@/lib/prisma";
import { EMERGENCY_EVENT, EMERGENCY_FLAGS, planResume, planStop } from "@/lib/ops/control/emergency";

const RESUME_EVENT = "ops_emergency_resume";
const Body = z.object({ action: z.enum(["stop", "resume"]) });

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const by = admin.user.email;

  if (parsed.data.action === "stop") {
    const rows = await prisma.adsFeatureFlag.findMany({ where: { key: { in: [...EMERGENCY_FLAGS] } }, select: { key: true, enabled: true } });
    const plan = planStop(Object.fromEntries(rows.map((r) => [r.key, r.enabled])));
    if (plan.turnOff.length) await prisma.adsFeatureFlag.updateMany({ where: { key: { in: plan.turnOff } }, data: { enabled: false } });
    await prisma.adsEvent.create({ data: { name: EMERGENCY_EVENT, userId: admin.user.id, props: { by, turnedOff: plan.turnOff } } });
    await prisma.adsEvent.create({ data: { name: "ops_decision", userId: admin.user.id, props: { decision: "Emergency stop: paused all outbound", why: `Owner pressed the kill switch (${plan.turnOff.length} flags turned off)`, area: "risk", by: "owner", date: new Date().toISOString().slice(0, 10) } } });
    return NextResponse.json({ ok: true, turnedOff: plan.turnOff });
  }

  const [stop, resume] = await Promise.all([
    prisma.adsEvent.findFirst({ where: { name: EMERGENCY_EVENT }, orderBy: { createdAt: "desc" }, select: { props: true, createdAt: true } }),
    prisma.adsEvent.findFirst({ where: { name: RESUME_EVENT }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  if (!stop || (resume && resume.createdAt > stop.createdAt)) return NextResponse.json({ error: "No active emergency stop to resume" }, { status: 409 });
  const restore = planResume(stop.props);
  if (restore.length) await prisma.adsFeatureFlag.updateMany({ where: { key: { in: restore } }, data: { enabled: true } });
  await prisma.adsEvent.create({ data: { name: RESUME_EVENT, userId: admin.user.id, props: { by, restored: restore } } });
  await prisma.adsEvent.create({ data: { name: "ops_decision", userId: admin.user.id, props: { decision: "Resumed outbound after emergency stop", why: `Owner pressed resume (${restore.length} flags restored)`, area: "risk", by: "owner", date: new Date().toISOString().slice(0, 10) } } });
  return NextResponse.json({ ok: true, restored: restore });
}
