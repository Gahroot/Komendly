// Server-side paid status for unlocking trial bonus ads (see bonus-access.ts for the pure rules).
import type { AdsWorkspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPaidWorkspace } from "./billing-gates";
import { hasBonusAccess } from "./bonus-access";

type WorkspacePaidFields = Pick<AdsWorkspace, "id" | "adsPlan" | "subscriptionStatus" | "suspendedAt">;

/** Paid plan / Launch Quarter (adsPlan + active status) or any credit pack ever bought (CreditLedger reason topup). */
export async function isBonusUnlocked(ws: WorkspacePaidFields): Promise<boolean> {
  if (ws.suspendedAt) return false;
  if (isPaidWorkspace(ws)) return true;
  const topup = await prisma.creditLedger.findFirst({ where: { workspaceId: ws.id, reason: "topup", delta: { gt: 0 } }, select: { id: true } });
  return hasBonusAccess({ isPaid: false, hasPurchasedCredits: Boolean(topup) });
}

export async function isBonusUnlockedById(workspaceId: string): Promise<boolean> {
  const ws = await prisma.adsWorkspace.findUnique({ where: { id: workspaceId }, select: { id: true, adsPlan: true, subscriptionStatus: true, suspendedAt: true } });
  return ws ? isBonusUnlocked(ws) : false;
}

export function trialBonusEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ADS_TRIAL_BONUS;
  return v === "1" || v === "true" || v === "on";
}
