// Claim a Kly outbound gift for a workspace: mark AdsGift claimed and copy its ad(s) in. Never throws.
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { copyGiftToWorkspace } from "./gift-copy";

export async function claimOutboundGift(workspaceId: string, userId: string, stage: "signed_up" | "trial_started"): Promise<void> {
  try {
    const lead = await prisma.outboundLead.findFirst({ where: { workspaceId, giftId: { not: null } }, select: { id: true, giftId: true } });
    if (!lead?.giftId) return;
    const gift = await prisma.adsGift.findUnique({ where: { id: lead.giftId }, select: { id: true, source: true, runId: true, extraRunId: true, claimedWorkspaceId: true } });
    if (!gift || gift.source !== "outbound" || (gift.claimedWorkspaceId && gift.claimedWorkspaceId !== workspaceId)) return;
    const res = await prisma.adsGift.updateMany({ where: { id: gift.id, claimedAt: null }, data: { claimedAt: new Date(), claimedWorkspaceId: workspaceId } });
    if (res.count > 0) await trackAdsEvent("gift_claimed", { workspaceId, userId, props: { giftId: gift.id, stage, source: "outbound", klyLead: lead.id } });
    if (gift.runId) await copyGiftToWorkspace(prisma, { giftId: gift.id, sourceRunId: gift.runId, extraRunId: gift.extraRunId, workspaceId, userId });
  } catch (error) {
    console.error("[kly] outbound gift claim failed", error);
  }
}
