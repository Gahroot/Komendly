import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { disconnectGoogle, forgetReadiness, googleHttpError, loadGoogleConnection } from "@/lib/ads/google/connection";
import { acceptInviteUrl, sendManagerInvite } from "@/lib/ads/google/core/ops";
import { normalizeCustomerId } from "@/lib/ads/google/core/types";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ customerId: z.string().max(30) });

/** Komendly's manager account invites the customer's account; they accept in Google Ads. */
export async function POST(request: Request) {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    await requireGoogleAccess(workspace);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    const cid = parsed.success ? normalizeCustomerId(parsed.data.customerId) : null;
    if (!cid) throw new AdsHttpError(400, "invalid_customer_id", "That account number should be 10 numbers, like 123-456-7890.");
    if (!(await rateLimit(`google_link:${workspace.id}`, 10, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many requests. Please wait a while and try again.");
    let r;
    try { r = await sendManagerInvite(cid); } catch (e) { throw googleHttpError(e, "We couldn't send the access request. Check the account number and try again."); }
    const existing = await loadGoogleConnection(workspace.id);
    if (existing?.mode === "oauth") await disconnectGoogle(workspace.id); // switching ways: revoke the old sign-in
    const data = { mode: "manager", encryptedToken: null, customerId: cid, loginCustomerId: null, managerLinkResource: r.linkResource, managerLinkStatus: r.status,
      ...(existing?.customerId === cid ? {} : { accountName: null, currency: null, timeZone: null, email: null }) };
    await prisma.googleAdsConnection.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, ...data }, update: data });
    forgetReadiness(workspace.id);
    return NextResponse.json({ status: r.status, acceptUrl: acceptInviteUrl(cid) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
