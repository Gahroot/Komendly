import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { canCreateAccounts } from "@/lib/ads/google/config";
import { disconnectGoogle, forgetReadiness, googleHttpError, loadGoogleConnection } from "@/lib/ads/google/connection";
import { billingUrl, createClientAccount } from "@/lib/ads/google/core/ops";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({
  email: z.string().email().max(200),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  timeZone: z.string().max(60).optional(),
  name: z.string().max(80).optional(),
});

/** New Google Ads account under Komendly's manager; the owner gets an admin invite and adds their card in Google. */
export async function POST(request: Request) {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    await requireGoogleAccess(workspace);
    if (!canCreateAccounts()) throw new AdsHttpError(409, "create_unavailable", "Komendly can't create Google Ads accounts right now. Create your free account at ads.google.com, then connect it here.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Enter a valid email address.");
    if (!(await rateLimit(`google_create:${workspace.id}`, 3, 86_400))) throw new AdsHttpError(429, "rate_limited", "You already created accounts today. Write to nolan@komendly.com if you need another.");
    const existing = await loadGoogleConnection(workspace.id);
    if (existing?.mode === "manager" && existing.customerId) throw new AdsHttpError(409, "already_connected", "You already have a Google Ads account connected. Disconnect it first.");
    const currency = parsed.data.currency?.toUpperCase();
    let r;
    try { r = await createClientAccount({ ...parsed.data, currency, name: parsed.data.name ?? workspace.name }); } catch (e) { throw googleHttpError(e, "We couldn't create your Google Ads account. Please try again."); }
    if (existing?.mode === "oauth") await disconnectGoogle(workspace.id);
    const data = { mode: "manager", encryptedToken: null, email: parsed.data.email, customerId: r.customerId, loginCustomerId: null, accountName: parsed.data.name ?? workspace.name,
      currency: currency ?? "USD", timeZone: parsed.data.timeZone ?? null, managerLinkResource: null, managerLinkStatus: "pending" };
    await prisma.googleAdsConnection.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, ...data }, update: data });
    forgetReadiness(workspace.id);
    return NextResponse.json({ customerId: r.customerId, inviteSent: r.inviteSent, billingUrl: billingUrl(r.customerId) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
