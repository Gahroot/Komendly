import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { issueAdsRefund } from "@/lib/ads/billing-admin";

const Body = z.object({
  workspaceId: z.string().min(1),
  amountCents: z.number().int().min(0).max(1_000_000),
  credits: z.number().int().min(0).max(100_000),
  reason: z.string().max(500).optional(),
  viaStripe: z.boolean(),
  chargeId: z.string().max(100).optional(),
});

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid refund request" }, { status: 400 });
  if (parsed.data.amountCents === 0 && parsed.data.credits === 0) return NextResponse.json({ error: "Nothing to refund" }, { status: 400 });
  try {
    const result = await issueAdsRefund({ ...parsed.data, actorId: admin.user.id });
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: 400 });
  } catch (err) {
    console.error("[admin/ads/refunds]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Refund failed" }, { status: 500 });
  }
}
