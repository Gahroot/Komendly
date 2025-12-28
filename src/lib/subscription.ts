import { prisma } from "@/lib/prisma";
import { SUBSCRIPTION_PLANS } from "@/lib/stripe";

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

// Check if user can generate video (has minutes remaining)
export async function canGenerateVideo(userId: string, estimatedMinutes: number = 1): Promise<{
  allowed: boolean;
  reason?: string;
  remainingMinutes?: number;
}> {
  const subscription = await checkSubscription(userId);

  if (!subscription) {
    return { allowed: false, reason: "User not found" };
  }

  if (!subscription.isActive) {
    return {
      allowed: false,
      reason: "Active subscription required. Please subscribe to generate videos.",
    };
  }

  if (subscription.minutesRemaining < estimatedMinutes) {
    return {
      allowed: false,
      reason: `Insufficient minutes. You have ${subscription.minutesRemaining} minute(s) remaining but need ${estimatedMinutes}.`,
      remainingMinutes: subscription.minutesRemaining,
    };
  }

  return {
    allowed: true,
    remainingMinutes: subscription.minutesRemaining,
  };
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
