// Server half of the BFCM offer: what this workspace may buy right now (server clock, real deadline).
import { BFCM_ANNUAL_PRICES, priceIdFor, UNLOCK_PACK, UNLOCK_PACK_NOTE } from "./billing-config";
import { BFCM_ENDS_AT, isBfcmActive, type BfcmState } from "./bfcm";
import { foundingSpotsLeft } from "./founding-spots";
import { prisma } from "@/lib/prisma";


/** null = the offer isn't running (after the deadline, or a suspended workspace). */
export async function getBfcmState(ws: { id: string; suspendedAt?: Date | null; stripeSubscriptionId?: string | null; subscriptionStatus: string }, now: Date = new Date()): Promise<BfcmState | null> {
  if (!isBfcmActive(now) || ws.suspendedAt) return null;
  const unlockBought = Boolean(await prisma.creditLedger.findFirst({ where: { workspaceId: ws.id, reason: "topup", note: UNLOCK_PACK_NOTE, delta: { gt: 0 } }, select: { id: true } }));
  const subscribed = Boolean(ws.stripeSubscriptionId) && ["active", "trialing", "past_due"].includes(ws.subscriptionStatus);
  const spotsLeft = await foundingSpotsLeft(prisma).catch(() => null);
  // The $9 unlocks a finished free pack: no pack yet, nothing to unlock.
  const pack = unlockBought || subscribed ? null : await prisma.adRun.findFirst({ where: { workspaceId: ws.id, isTrial: true, status: { in: ["completed", "partial"] } }, select: { id: true } });
  const annual = subscribed ? [] : BFCM_ANNUAL_PRICES.filter((b) => Boolean(process.env[b.priceEnv]) && (b.plan !== "autopilot" || spotsLeft !== 0)).map((b) => b.plan);
  return { endsAt: BFCM_ENDS_AT.toISOString(), serverNow: now.toISOString(), unlockBought, unlockAvailable: Boolean(pack) && Boolean(priceIdFor(UNLOCK_PACK)), annual, spotsLeft };
}
