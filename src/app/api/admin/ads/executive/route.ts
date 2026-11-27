// Owner one-click decisions from /admin/ads/executive. Admin only. Every call writes an audit-bearing AdsEvent:
//   approve / reject on an owner item -> exec_approval {itemId, decision, by}
//   approve / reject on a proposed objective -> markObjective (owner_approved / owner_rejected) + exec_approval
//   reject on an objective also writes exec_override {kind:"veto"}; redirect writes exec_override {kind:"redirect", priority}
// This route can never change spend, caps, flags or governance: it only records the owner's decision.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { EXEC_EVENTS } from "@/lib/exec/governance";
import { markObjective } from "@/lib/exec/objectives";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  decision: z.enum(["approve", "reject", "redirect"]),
  itemId: z.string().max(80).optional(),
  objectiveId: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
}).refine((b) => b.itemId || b.objectiveId || b.decision === "redirect", { message: "itemId or objectiveId required" });

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { decision, itemId, objectiveId, note } = parsed.data;
  const by = admin.user.email ?? admin.user.id;
  if (decision === "redirect") {
    if (!note?.trim()) return NextResponse.json({ error: "Say what to focus on instead" }, { status: 400 });
    await prisma.adsEvent.create({ data: { name: EXEC_EVENTS.override, props: { kind: "redirect", priority: note.trim().slice(0, 300), itemId: itemId ?? null, by, at: new Date().toISOString(), via: "admin/ads/executive" } } });
  } else {
    if (objectiveId) {
      if (decision === "approve") await markObjective(prisma, objectiveId, "approved", { by, via: "admin/ads/executive", note }, "owner_approved");
      else {
        await markObjective(prisma, objectiveId, "abandoned", { by, via: "admin/ads/executive", note }, "owner_rejected");
        await prisma.adsEvent.create({ data: { name: EXEC_EVENTS.override, props: { kind: "veto", objectiveId, by, at: new Date().toISOString(), via: "admin/ads/executive" } } });
      }
    }
    await prisma.adsEvent.create({ data: { name: "exec_approval", props: { itemId: itemId ?? null, objectiveId: objectiveId ?? null, decision, note: note ?? null, by, at: new Date().toISOString() } } });
  }
  return NextResponse.json({ ok: true });
}
