import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { approvePartner, payPartner, setPartnerStatus } from "@/lib/ads/partner-admin";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), partnerId: z.string().min(1), note: z.string().max(1000).optional() }),
  z.object({ action: z.enum(["reject", "pause"]), partnerId: z.string().min(1), note: z.string().max(1000).optional() }),
  z.object({ action: z.literal("mark_paid"), partnerId: z.string().min(1), payoutRef: z.string().trim().min(2).max(200) }),
]);

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const b = parsed.data;
  try {
    const result =
      b.action === "approve" ? await approvePartner(b.partnerId, admin.user, b.note || null)
      : b.action === "mark_paid" ? await payPartner(b.partnerId, b.payoutRef, admin.user)
      : await setPartnerStatus(b.partnerId, b.action === "reject" ? "rejected" : "paused", admin.user, b.note || null);
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: 400 });
  } catch (err) {
    console.error("[admin/ads/partners]", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
