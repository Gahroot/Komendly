// Testimonial videos included in Ozzy plans (Scale 1/mo, Agency 3/mo), granted by the ads billing webhook.
//
// Representation: testimonial minutes on the workspace owner's User (1 video = 1 minute), added to BOTH
// bonusMinutes and minutesLimit exactly like a credit pack, so evaluateEntitlement lets users WITHOUT a
// testimonial subscription spend them (remaining = min(minutesLimit - minutesUsed, bonusMinutes)), and a
// legacy testimonial renewal (minutesLimit = base + bonusMinutes) keeps them.
// Idempotency: CreditPurchase.stripePaymentId @unique = "plan_testimonials:<invoiceId>", created FIRST in the
// transaction (a replay throws P2002 before any increment). amountPaid = 0 (not revenue).
// No rollover (scarcity): at each new grant, the unused part of the PREVIOUS plan grant expires. Plan minutes
// count as spent first: usage since the previous grant = minutes reserved/charged on testimonial videos created
// since then. The expiry is capped by what is actually left, so pack minutes are never taken.
import { TESTIMONIALS_PER_MONTH } from "./money-model";
import type { AdsPlanKey } from "../ads/billing-config";

export const PLAN_TESTIMONIALS_PREFIX = "plan_testimonials:";

/** Testimonial videos one paid period of a plan includes (annual prepay: 12 months up front, like credits). */
export function planTestimonialsFor(plan: AdsPlanKey, annual: boolean): number {
  return TESTIMONIALS_PER_MONTH[plan] * (annual ? 12 : 1);
}

export interface ExpiryInput {
  /** Minutes of the previous plan grant (0 if none). */
  previousGrant: number;
  /** Testimonial minutes used since the previous grant. */
  usedSincePrevious: number;
  minutesLimit: number;
  minutesUsed: number;
  bonusMinutes: number;
}

/** Pure: how many unused plan minutes from the previous grant expire now. */
export function expiringPlanMinutes(i: ExpiryInput): number {
  const unused = Math.max(0, i.previousGrant - Math.max(0, i.usedSincePrevious));
  const left = Math.max(0, i.minutesLimit - i.minutesUsed);
  return Math.max(0, Math.min(unused, left, Math.max(0, i.bonusMinutes)));
}

interface Tx {
  creditPurchase: {
    create(args: { data: { userId: string; stripePaymentId: string; minutes: number; amountPaid: number } }): Promise<unknown>;
    findFirst(args: {
      where: { userId: string; stripePaymentId: { startsWith: string; not: string } };
      orderBy: { createdAt: "desc" };
      select: { minutes: true; createdAt: true };
    }): Promise<{ minutes: number; createdAt: Date } | null>;
  };
  falCompositeVideo: {
    aggregate(args: {
      where: { userId: string; createdAt: { gte: Date }; minutesState: { in: string[] } };
      _sum: { minutesReserved: true };
    }): Promise<{ _sum: { minutesReserved: number | null } }>;
  };
  user: {
    findUnique(args: { where: { id: string }; select: { minutesLimit: true; minutesUsed: true; bonusMinutes: true } }): Promise<{ minutesLimit: number; minutesUsed: number; bonusMinutes: number } | null>;
    update(args: { where: { id: string }; data: { bonusMinutes: { increment: number }; minutesLimit: { increment: number } } }): Promise<unknown>;
  };
}

export interface PlanTestimonialDb {
  $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export type PlanTestimonialResult = { status: "granted"; granted: number; expired: number } | { status: "duplicate" } | { status: "skipped" };

const isUnique = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "P2002";

/** Grant `minutes` plan testimonials for one paid invoice; expires the previous grant's unused minutes. Idempotent. */
export async function grantPlanTestimonials(db: PlanTestimonialDb, userId: string, invoiceId: string, minutes: number): Promise<PlanTestimonialResult> {
  if (!userId || !invoiceId || !Number.isInteger(minutes) || minutes <= 0) return { status: "skipped" };
  const key = `${PLAN_TESTIMONIALS_PREFIX}${invoiceId}`;
  try {
    return await db.$transaction(async (tx) => {
      await tx.creditPurchase.create({ data: { userId, stripePaymentId: key, minutes, amountPaid: 0 } });
      const prev = await tx.creditPurchase.findFirst({
        where: { userId, stripePaymentId: { startsWith: PLAN_TESTIMONIALS_PREFIX, not: key } },
        orderBy: { createdAt: "desc" },
        select: { minutes: true, createdAt: true },
      });
      const user = await tx.user.findUnique({ where: { id: userId }, select: { minutesLimit: true, minutesUsed: true, bonusMinutes: true } });
      if (!user) throw new Error(`plan testimonials: user ${userId} not found`);
      let expired = 0;
      if (prev && prev.minutes > 0) {
        const used = await tx.falCompositeVideo.aggregate({
          where: { userId, createdAt: { gte: prev.createdAt }, minutesState: { in: ["reserved", "charged"] } },
          _sum: { minutesReserved: true },
        });
        const usedSince = used._sum.minutesReserved ?? 0; // released videos (refunded minutes) don't count
        expired = expiringPlanMinutes({ previousGrant: prev.minutes, usedSincePrevious: usedSince, ...user });
      }
      const net = minutes - expired;
      await tx.user.update({ where: { id: userId }, data: { bonusMinutes: { increment: net }, minutesLimit: { increment: net } } });
      return { status: "granted" as const, granted: minutes, expired };
    });
  } catch (e) {
    if (isUnique(e)) return { status: "duplicate" };
    throw e;
  }
}
