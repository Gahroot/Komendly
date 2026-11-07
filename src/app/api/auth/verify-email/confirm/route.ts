import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeVerificationToken } from "@/lib/ads/verify";

const BodySchema = z.object({ token: z.string().min(20).max(200) });

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  const result = await consumeVerificationToken(parsed.data.token);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
