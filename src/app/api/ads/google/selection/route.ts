import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { authFor, forgetReadiness, googleHttpError, readinessFor, requireGoogleConnection } from "@/lib/ads/google/connection";
import { listAccounts } from "@/lib/ads/google/core/ops";
import { normalizeCustomerId } from "@/lib/ads/google/core/types";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ customerId: z.string().max(20), loginCustomerId: z.string().max(20).optional() });

/** Picks the account (oauth mode). It must be one this Google login can reach. */
export async function POST(request: Request) {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    await requireGoogleAccess(workspace);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    const cid = parsed.success ? normalizeCustomerId(parsed.data.customerId) : null;
    if (!parsed.success || !cid) throw new AdsHttpError(400, "invalid", "Pick a Google Ads account.");
    const conn = await requireGoogleConnection(workspace.id);
    if (conn.mode !== "oauth") throw new AdsHttpError(409, "manager_mode", "Komendly already uses the account you gave us.");
    let accounts;
    try { accounts = await listAccounts(authFor(conn)); } catch (e) { throw googleHttpError(e, "We couldn't reach Google. Please try again."); }
    const login = normalizeCustomerId(parsed.data.loginCustomerId) ?? undefined;
    const acc = accounts.find((a) => a.customerId === cid && !a.manager && (login === undefined || a.loginCustomerId === login)) ?? accounts.find((a) => a.customerId === cid && !a.manager);
    if (!acc) throw new AdsHttpError(404, "not_found", "This Google login can't reach that account. Pick another one.");
    const updated = await prisma.googleAdsConnection.update({
      where: { workspaceId: workspace.id },
      data: { customerId: acc.customerId, loginCustomerId: acc.loginCustomerId ?? null, accountName: acc.name, currency: acc.currency, timeZone: acc.timeZone },
    });
    forgetReadiness(workspace.id);
    return NextResponse.json({ ok: true, readiness: await readinessFor(updated, { fresh: true }) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
