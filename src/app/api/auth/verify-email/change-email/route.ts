import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getUserByEmail } from "@/lib/auth";
import { isDisposableEmail, rateLimit } from "@/lib/ads/abuse";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/ads/verify";

const BodySchema = z.object({ email: z.string().trim().email().max(254) });

/** "Wrong email?": an unverified user fixes a typo; a new code + link goes to the new address. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ error: "Your email is already confirmed." }, { status: 409 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  if (isDisposableEmail(email)) return NextResponse.json({ error: "Please use a permanent email address." }, { status: 400 });
  if (!(await rateLimit(`change-email:${user.id}`, 3, 3600))) {
    return NextResponse.json({ error: "Too many changes. Try again later." }, { status: 429 });
  }
  if (email !== user.email) {
    if (await getUserByEmail(email)) return NextResponse.json({ error: "An account with this email already exists. Sign in with it instead." }, { status: 409 });
    await prisma.user.update({ where: { id: user.id }, data: { email } });
  }
  await sendVerificationEmail({ ...user, email }, request.nextUrl.origin);
  return NextResponse.json({ ok: true, email });
}
