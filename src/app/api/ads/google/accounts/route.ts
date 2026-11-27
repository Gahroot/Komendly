import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ads/abuse";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { authFor, googleHttpError, requireGoogleConnection } from "@/lib/ads/google/connection";
import { listAccounts } from "@/lib/ads/google/core/ops";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

export async function GET() {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    await requireGoogleAccess(workspace);
    const conn = await requireGoogleConnection(workspace.id);
    if (conn.mode !== "oauth") throw new AdsHttpError(409, "manager_mode", "Komendly already uses the account you gave us.");
    if (!(await rateLimit(`google_accounts:${workspace.id}`, 60, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many tries. Please wait a few minutes.");
    try {
      return NextResponse.json({ accounts: await listAccounts(authFor(conn)) });
    } catch (e) {
      throw googleHttpError(e, "We couldn't load your Google Ads accounts. Please try again.");
    }
  } catch (error) {
    return adsErrorResponse(error);
  }
}
