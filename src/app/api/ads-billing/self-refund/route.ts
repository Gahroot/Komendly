// 30-day guarantee: POST = refund my first payment (self-serve, once per customer). See src/lib/ads/self-refund.ts.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/ads/abuse";
import { runSelfRefund } from "@/lib/ads/self-refund";
import { SELF_REFUND_REASONS } from "@/lib/ads/self-refund-rules";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ reason: z.enum(SELF_REFUND_REASONS.map((r) => r.key) as [string, ...string[]]).nullable().optional() });

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
    if (!(await rateLimit(`self-refund:${user.id}`, 3, 3600))) return NextResponse.json({ error: "Please wait a little and try again.", code: "rate_limited" }, { status: 429 });
    const ws = await getOrCreateWorkspace(user);
    const reason = SELF_REFUND_REASONS.find((r) => r.key === parsed.data.reason)?.key ?? null;
    const res = await runSelfRefund(ws, user, reason);
    if (!res.ok) return NextResponse.json({ error: res.error, code: "not_refundable" }, { status: 409 });
    return NextResponse.json({ ok: true, amountCents: res.amountCents });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
