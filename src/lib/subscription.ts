import { prisma } from "@/lib/prisma";
import { SUBSCRIPTION_PLANS } from "@/lib/stripe";
import type { Prisma } from "@prisma/client";
import { evaluateEntitlement } from "@/lib/testimonial/contracts";

export type SubscriptionStatusType = "active" | "past_due" | "trialing" | "incomplete" | "canceled" | "unpaid" | "paused" | "incomplete_expired";

export interface SubscriptionInfo {
  isActive: boolean;
  plan: string;
  status: SubscriptionStatusType;
  minutesUsed: number;
  minutesLimit: number;
  minutesRemaining: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

// Check if user has an active subscription
export async function checkSubscription(userId: string): Promise<SubscriptionInfo | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscriptionStatus: true,
      minutesUsed: true,
      minutesLimit: true,
      bonusMinutes: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });

  if (!user) {
    return null;
  }

  const activeStatuses: SubscriptionStatusType[] = ["active", "trialing"];
  const isActive = activeStatuses.includes(user.subscriptionStatus as SubscriptionStatusType);

  return {
    isActive,
    plan: user.plan,
    status: user.subscriptionStatus as SubscriptionStatusType,
    minutesUsed: user.minutesUsed,
    minutesLimit: user.minutesLimit,
    minutesRemaining: Math.max(0, user.minutesLimit - user.minutesUsed),
    currentPeriodEnd: user.currentPeriodEnd,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
  };
}

// Check if user can generate video: active subscription OR credit-pack minutes remaining.
export async function canGenerateVideo(userId: string, estimatedMinutes: number = 1): Promise<{
  allowed: boolean;
  reason?: string;
  remainingMinutes?: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true, minutesUsed: true, minutesLimit: true, bonusMinutes: true },
  });
  if (!user) {
    return { allowed: false, reason: "User not found" };
  }
  const e = evaluateEntitlement(user, estimatedMinutes);
  return e.allowed
    ? { allowed: true, remainingMinutes: e.remainingMinutes }
    : { allowed: false, reason: e.reason, remainingMinutes: e.remainingMinutes };
}

/**
 * Atomically reserve minutes (minutesUsed += minutes) only if the user is still entitled.
 * Same rule as evaluateEntitlement, enforced in SQL so concurrent starts can't overspend.
 */
export async function reserveGenerationMinutes(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  userId: string,
  minutes: number
): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "User" SET "minutesUsed" = "minutesUsed" + ${minutes}
    WHERE id = ${userId}
      AND "minutesLimit" - "minutesUsed" >= ${minutes}
      AND ("subscriptionStatus" IN ('active', 'trialing') OR "bonusMinutes" >= ${minutes})`;
  return n === 1;
}

// Deduct minutes from user's quota
export async function deductMinutes(userId: string, minutes: number): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        minutesUsed: { increment: minutes },
      },
    });
    return true;
  } catch (error) {
    console.error("Failed to deduct minutes:", error);
    return false;
  }
}

// Get plan details by name
export function getPlanDetails(planName: string) {
  if (planName === "pending") {
    return null;
  }
  return SUBSCRIPTION_PLANS[planName as keyof typeof SUBSCRIPTION_PLANS] || null;
}

// Check if user needs to subscribe (pending plan or no active subscription)
export async function needsSubscription(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscriptionStatus: true,
    },
  });

  if (!user) {
    return true;
  }

  if (user.plan === "pending") {
    return true;
  }

  const activeStatuses = ["active", "trialing"];
  return !activeStatuses.includes(user.subscriptionStatus);
}
