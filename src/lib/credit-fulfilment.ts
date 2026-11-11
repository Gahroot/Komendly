// Fulfil a one-time minutes purchase (credit pack or first-video offer). Shared by the Stripe webhook and the
// checkout-success sync, so both paths stay idempotent.
//
// Idempotency comes from CreditPurchase.stripePaymentId @unique: the create runs BEFORE the increment inside one
// transaction, so a replay throws P2002 and nothing is incremented. Never turn this into an upsert.

export interface CreditPurchaseInput {
  userId: string;
  /** The PaymentIntent id (same value from the webhook and the success sync). */
  stripePaymentId: string;
  minutes: number;
  amountPaid: number;
}

export type FulfilResult = { status: "fulfilled" } | { status: "duplicate" } | { status: "invalid" };

interface Tx {
  creditPurchase: { create(args: { data: CreditPurchaseInput }): Promise<unknown> };
  user: {
    update(args: {
      where: { id: string };
      data: { bonusMinutes: { increment: number }; minutesLimit: { increment: number } };
    }): Promise<unknown>;
  };
}

export interface CreditDb {
  $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}

export async function fulfilCreditPurchase(db: CreditDb, input: CreditPurchaseInput): Promise<FulfilResult> {
  if (!input.userId || !input.stripePaymentId || !Number.isInteger(input.minutes) || input.minutes <= 0) {
    return { status: "invalid" };
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.creditPurchase.create({ data: input });
      await tx.user.update({
        where: { id: input.userId },
        data: { bonusMinutes: { increment: input.minutes }, minutesLimit: { increment: input.minutes } },
      });
    });
    return { status: "fulfilled" };
  } catch (err) {
    if (isUniqueViolation(err)) return { status: "duplicate" };
    throw err;
  }
}
