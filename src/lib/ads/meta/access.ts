import type { AdsWorkspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canPublishToMeta, type PaidCheckWorkspace } from "@/lib/ads/billing-gates";
import { AdsHttpError } from "@/lib/ads/workspace";

export type MetaAccess = "ok" | "upgrade" | "disabled";

/** Pure gate: feature flag first (hidden module), then paid plan. */
export function metaAccessFor(ws: PaidCheckWorkspace, flagEnabled: boolean): MetaAccess {
  if (!flagEnabled) return "disabled";
  return canPublishToMeta(ws) ? "ok" : "upgrade";
}

export async function metaAccess(ws: AdsWorkspace): Promise<MetaAccess> {
  const flag = await prisma.adsFeatureFlag.findUnique({ where: { key: "meta_publish" } });
  return metaAccessFor(ws, flag?.enabled ?? false);
}

export async function requireMetaAccess(ws: AdsWorkspace): Promise<void> {
  const a = await metaAccess(ws);
  if (a === "disabled") throw new AdsHttpError(404, "not_found", "Not found.");
  if (a === "upgrade") throw new AdsHttpError(402, "upgrade_required", "Publishing to Meta is available on paid plans.");
}
