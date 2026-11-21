import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCookieUser } from "@/lib/auth";
import { fingerprintFrom } from "@/lib/ads/run";
import { startRun } from "@/lib/ads/run-start";
import { AdsHttpError, getOrCreateWorkspace } from "@/lib/ads/workspace";
import { recordSystemRun } from "@/lib/growth/systems";
import { connectPath, JOBBER_SYSTEM, jobberEnv, verifyConnectToken } from "@/lib/integrations/jobber/core";
import { linkConnection, steerWeeklyDrop } from "@/lib/integrations/jobber/server";

export const dynamic = "force-dynamic";

/** Form POST from /ads/jobber: link the Jobber connection to this account and start the free pack from the website. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const c = String(form?.get("c") ?? "");
  const url = String(form?.get("url") ?? "").trim();
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  const env = jobberEnv();
  const id = env ? verifyConnectToken(c, env.clientSecret) : null;
  if (!env || !id) return to("/integrations/jobber?error=expired");
  const user = await getCookieUser();
  if (!user) return to(`/ads/signup?next=${encodeURIComponent(connectPath(c))}`);
  try {
    const workspace = await getOrCreateWorkspace(user);
    const linked = await linkConnection(prisma, id, { workspaceId: workspace.id, userId: user.id, website: url || null });
    if (!linked) return to("/integrations/jobber?error=expired");
    if (linked === "taken") return to(connectPath(c, { error: "This Jobber account is already connected to another Komendly account." }));
    await steerWeeklyDrop(prisma, linked).catch(() => undefined); // jobs finished before linking
    if (!url) return to(connectPath(c, { error: "Enter your business website so Ozzy can make your ads." }));
    const { runId } = await startRun({ url }, { user, workspace, fp: fingerprintFrom(request) });
    await recordSystemRun(prisma, JOBBER_SYSTEM, { ok: true, outputs: 1 });
    return to(`/ads/runs/${runId}`);
  } catch (e) {
    if (e instanceof AdsHttpError) return to(connectPath(c, { error: e.message }));
    console.error("[jobber] link failed", e);
    return to(connectPath(c, { error: "Something went wrong. Please try again." }));
  }
}
