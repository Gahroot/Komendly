// Production wiring for the first-video offer (Prisma + Stripe). Server only.
import { prisma } from "./prisma";
import { stripe } from "./stripe";
import { createFirstVideoCheckout, type OfferUser } from "./first-video-checkout";

const OFFER_USER_SELECT = {
  id: true,
  email: true,
  plan: true,
  subscriptionStatus: true,
  stripeSubscriptionId: true,
  stripeCustomerId: true,
} as const;

export async function findOfferUser(userId: string): Promise<OfferUser | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: OFFER_USER_SELECT });
}

export function startFirstVideoCheckout(user: OfferUser, origin: string, cancelPath: string) {
  return createFirstVideoCheckout(
    {
      countPurchases: (userId) => prisma.creditPurchase.count({ where: { userId } }),
      saveCustomerId: async (userId, customerId) => {
        await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
      },
      stripe,
      priceId: process.env.STRIPE_FIRST_VIDEO_PRICE_ID || undefined,
    },
    user,
    { origin, cancelPath },
  );
}
