import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ads/abuse";
import { consumeVerificationCode } from "@/lib/ads/verify";

const BodySchema = z.object({ code: z.string().max(20) });

const MESSAGES = {
  invalid: "That code didn't match. Check the latest email and try again.",
  expired: "That code has expired. Send a new email to get a fresh one.",
  too_many_attempts: "Too many tries. Send a new email to get a fresh code.",
} as const;

/** Verify the signed-in user's email with the 6-digit code (works inside in-app browsers). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthenticated", error: "Please sign in first." }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid", error: MESSAGES.invalid }, { status: 400 });
  const result = await consumeVerificationCode(user.id, parsed.data.code, rateLimit);
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, reason: result.reason, error: MESSAGES[result.reason] }, { status: result.reason === "too_many_attempts" ? 429 : 400 });
}
