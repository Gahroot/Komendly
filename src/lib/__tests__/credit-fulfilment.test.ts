import { describe, expect, it } from "vitest";
import { fulfilCreditPurchase, type CreditDb, type CreditPurchaseInput } from "../credit-fulfilment";

/** In-memory stand-in for Prisma: unique stripePaymentId, all-or-nothing transactions. */
function fakeDb() {
  const purchases = new Map<string, CreditPurchaseInput>();
  const users = new Map([["u1", { bonusMinutes: 0, minutesLimit: 0 }]]);
  const calls: string[] = [];
  const db: CreditDb = {
    async $transaction(fn) {
      return fn({
          creditPurchase: {
            async create({ data }) {
              calls.push("create");
              if (purchases.has(data.stripePaymentId)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
              purchases.set(data.stripePaymentId, data);
            },
          },
          user: {
            async update({ where, data }) {
              calls.push("increment");
              const u = users.get(where.id);
              if (!u) throw new Error("not found");
              u.bonusMinutes += data.bonusMinutes.increment;
              u.minutesLimit += data.minutesLimit.increment;
            },
          },
      });
    },
  };
  return { db, purchases, users, calls };
}

const input: CreditPurchaseInput = { userId: "u1", stripePaymentId: "pi_1", minutes: 1, amountPaid: 1900 };

describe("fulfilCreditPurchase", () => {
  it("records the purchase and raises bonusMinutes and minutesLimit", async () => {
    const { db, users, purchases, calls } = fakeDb();
    expect(await fulfilCreditPurchase(db, input)).toEqual({ status: "fulfilled" });
    expect(users.get("u1")).toEqual({ bonusMinutes: 1, minutesLimit: 1 });
    expect(purchases.size).toBe(1);
    expect(calls).toEqual(["create", "increment"]);
  });

  it("is idempotent across webhook + success-page sync (same payment id)", async () => {
    const { db, users, calls } = fakeDb();
    await fulfilCreditPurchase(db, input);
    expect(await fulfilCreditPurchase(db, input)).toEqual({ status: "duplicate" });
    expect(await fulfilCreditPurchase(db, input)).toEqual({ status: "duplicate" });
    expect(users.get("u1")).toEqual({ bonusMinutes: 1, minutesLimit: 1 });
    // the replay throws on create, before any increment
    expect(calls).toEqual(["create", "increment", "create", "create"]);
  });

  it("handles concurrent deliveries without double-crediting", async () => {
    const { db, users } = fakeDb();
    const results = await Promise.all([fulfilCreditPurchase(db, input), fulfilCreditPurchase(db, input)]);
    expect(results.map((r) => r.status).sort()).toEqual(["duplicate", "fulfilled"]);
    expect(users.get("u1")?.bonusMinutes).toBe(1);
  });

  it("credits distinct payments separately", async () => {
    const { db, users } = fakeDb();
    await fulfilCreditPurchase(db, input);
    await fulfilCreditPurchase(db, { ...input, stripePaymentId: "pi_2", minutes: 2 });
    expect(users.get("u1")).toEqual({ bonusMinutes: 3, minutesLimit: 3 });
  });

  it("rejects invalid input without touching the db", async () => {
    const { db, calls } = fakeDb();
    expect(await fulfilCreditPurchase(db, { ...input, minutes: 0 })).toEqual({ status: "invalid" });
    expect(await fulfilCreditPurchase(db, { ...input, stripePaymentId: "" })).toEqual({ status: "invalid" });
    expect(calls).toEqual([]);
  });

  it("rethrows unexpected errors", async () => {
    const db: CreditDb = { $transaction: async () => { throw new Error("db down"); } };
    await expect(fulfilCreditPurchase(db, input)).rejects.toThrow("db down");
  });
});
