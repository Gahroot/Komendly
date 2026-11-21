import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordSystemRun, systemEnabled } from "@/lib/growth/systems";
import { connectPath, JOBBER_SYSTEM, jobberEnv, PKCE_COOKIE, signConnectToken, verifyState } from "@/lib/integrations/jobber/core";
import { disconnectApp, exchangeCode, fetchAccount } from "@/lib/integrations/jobber/graphql";
import { findConnection, saveConnection } from "@/lib/integrations/jobber/server";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect URI (register exactly: https://komendly.com/api/integrations/jobber/callback, or JOBBER_REDIRECT_URI).
 * Marketplace "Connect" sends only ?code; our own button also sends a signed ?state bound to the PKCE cookie.
 */
export async function GET(request: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/integrations/jobber?${q}`, request.url));
  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return back("denied=1");
  const env = jobberEnv();
  if (!env) return back("unavailable=1");
  const code = sp.get("code");
  if (!code) return back("error=missing_code");
  const state = sp.get("state");
  let verifier: string | null = null;
  if (state) {
    const ok = verifyState(state, request.cookies.get(PKCE_COOKIE)?.value, env.clientSecret);
    if (!ok) return back("error=expired");
    verifier = ok.verifier;
  }
  try {
    const tokens = await exchangeCode(env, code, verifier);
    const account = await fetchAccount(env, tokens.accessToken);
    // Kill switch: new accounts are refused (and disconnected on Jobber's side); existing connections keep working.
    if (!(await findConnection(prisma, account.id)) && !(await systemEnabled(prisma, JOBBER_SYSTEM))) {
      await disconnectApp(env, tokens.accessToken).catch(() => undefined);
      return back("unavailable=1");
    }
    const { connection, isNew } = await saveConnection(prisma, account, tokens);
    await recordSystemRun(prisma, JOBBER_SYSTEM, { ok: true, outputs: isNew ? 1 : 0 });
    const res = NextResponse.redirect(new URL(connectPath(signConnectToken(connection.id, env.clientSecret)), request.url));
    res.cookies.delete({ name: PKCE_COOKIE, path: "/api/integrations/jobber" });
    return res;
  } catch (e) {
    console.error("[jobber] callback failed", e);
    await recordSystemRun(prisma, JOBBER_SYSTEM, { ok: false, error: e instanceof Error ? e.message : String(e) });
    return back("error=connect_failed");
  }
}
