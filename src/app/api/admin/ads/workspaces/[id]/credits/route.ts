import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { adminAdjustCredits, InsufficientCreditsError } from "@/lib/ads/credits";

const Body = z.object({ delta: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0), note: z.string().min(3).max(300) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a non-zero amount and a note" }, { status: 400 });
  try {
    const res = await adminAdjustCredits(id, parsed.data.delta, admin.user.id, parsed.data.note, request.headers.get("idempotency-key") ?? randomUUID());
    return NextResponse.json({ ok: true, balance: res.balance });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
