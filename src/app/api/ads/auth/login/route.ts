import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, getUserByEmail, setSessionCookie, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/ads/abuse";
import { adsErrorResponse, AdsHttpError } from "@/lib/ads/workspace";

const BodySchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });

/** /ads sign-in: unlike /api/auth/login it doesn't require a video plan. */
export async function POST(request: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Enter your email and password.");
    if (!(await rateLimit(`ads-login:${parsed.data.email.toLowerCase()}`, 10, 600))) {
      throw new AdsHttpError(429, "rate_limited", "Too many attempts. Try again in a few minutes.");
    }
    const user = await getUserByEmail(parsed.data.email);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      throw new AdsHttpError(401, "invalid_credentials", "Wrong email or password.");
    }
    await setSessionCookie(await createSession(user.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
