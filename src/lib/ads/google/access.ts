import type { AdsWorkspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPaidWorkspace, type PaidCheckWorkspace } from "@/lib/ads/billing-gates";
import { AdsHttpError } from "@/lib/ads/workspace";

export type GoogleAccess = "ok" | "not_paid" | "flag_off";

/** Pure gate: feature flag first (hidden module), then paid plan (same check as Meta). */
export function googleAccessFor(ws: PaidCheckWorkspace, flagEnabled: boolean): GoogleAccess {
  if (!flagEnabled) return "flag_off";
  return isPaidWorkspace(ws) ? "ok" : "not_paid";
}

/** Global key, plus `google_publish:<workspaceId>` to switch it on for one workspace. */
export function googlePublishFlagKeys(workspaceId: string): string[] {
  return ["google_publish", `google_publish:${workspaceId}`];
}

export async function googleAccess(ws: AdsWorkspace): Promise<GoogleAccess> {
  const n = await prisma.adsFeatureFlag.count({ where: { key: { in: googlePublishFlagKeys(ws.id) }, enabled: true } });
  return googleAccessFor(ws, n > 0);
}

export async function requireGoogleAccess(ws: AdsWorkspace): Promise<void> {
  const a = await googleAccess(ws);
  if (a === "flag_off") throw new AdsHttpError(404, "not_found", "Not found.");
  if (a === "not_paid") throw new AdsHttpError(402, "upgrade_required", "Running your ads on Google is part of the paid plans.");
}
