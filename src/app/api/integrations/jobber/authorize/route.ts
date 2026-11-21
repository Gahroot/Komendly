import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { systemEnabled } from "@/lib/growth/systems";
import { authorizeUrl, JOBBER_SYSTEM, jobberEnv, pkcePair, PKCE_COOKIE, signState, STATE_TTL_SEC } from "@/lib/integrations/jobber/core";

export const dynamic = "force-dynamic";

/** "Connect Jobber" from komendly.com: signed state + PKCE (S256), then Jobber's consent screen. Kill switch: sys_jobber. */
export async function GET(request: NextRequest) {
  const env = jobberEnv();
  if (!env || !(await systemEnabled(prisma, JOBBER_SYSTEM))) return NextResponse.redirect(new URL("/integrations/jobber?unavailable=1", request.url));
  const nonce = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const res = NextResponse.redirect(authorizeUrl(env, signState(nonce, env.clientSecret), challenge));
  res.cookies.set(PKCE_COOKIE, `${nonce}.${verifier}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/jobber", maxAge: STATE_TTL_SEC });
  return res;
}
