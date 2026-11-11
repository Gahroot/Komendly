// Server-side eligibility for the Launch Quarter offer. Single source of truth for the window: it opens when the
// trial run has LAUNCH_OFFER_MIN_READY ready ads (or finishes, if sooner) and stays open 72h. Derived, never stored.
import { prisma } from "@/lib/prisma";
import { isLaunchOfferOpen, LAUNCH_QUARTER, launchOfferExpiresAt, launchOfferReadyAt } from "./billing-config";
import { parseBonus, PREVIEW_RATIO } from "./bonus-access";

export interface LaunchOfferState {
  open: boolean;
  expiresAt: Date | null;
}

/** When the workspace's first trial run reached the offer threshold; null if not yet. */
export async function getLaunchOfferReadyAt(workspaceId: string): Promise<Date | null> {
  const trials = await prisma.adRun.findMany({
    where: { workspaceId, isTrial: true },
    orderBy: { createdAt: "asc" },
    select: {
      completedAt: true,
      ads: { where: { status: "ready" }, select: { visualBrief: true, assets: { where: { ratio: { not: PREVIEW_RATIO } }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } } } },
    },
  });
  let earliest: Date | null = null;
  for (const t of trials) {
    const times = t.ads.filter((a) => !parseBonus(a.visualBrief)).flatMap((a) => (a.assets[0] ? [a.assets[0].createdAt] : []));
    const at = launchOfferReadyAt(times, t.completedAt);
    if (at && (!earliest || at < earliest)) earliest = at;
  }
  return earliest;
}

export async function getLaunchOfferState(workspaceId: string, now: Date = new Date()): Promise<LaunchOfferState> {
  const readyAt = await getLaunchOfferReadyAt(workspaceId);
  return { open: isLaunchOfferOpen(readyAt, now, LAUNCH_QUARTER), expiresAt: launchOfferExpiresAt(readyAt, LAUNCH_QUARTER) };
}
