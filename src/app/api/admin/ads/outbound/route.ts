// Admin outbound actions: pause/resume a mailbox, queue a lead run, flip the kill switch, suppress an address/domain.
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { OutboundActionSchema, applyOutboundAction } from "@/lib/ads/outbound/server";

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = OutboundActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json(await applyOutboundAction(parsed.data, admin.user.id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
