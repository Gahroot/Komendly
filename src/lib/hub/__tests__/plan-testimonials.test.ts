import { describe, expect, it } from "vitest";
import { evaluateEntitlement } from "@/lib/testimonial/contracts";
import { expiringPlanMinutes, grantPlanTestimonials, planTestimonialsFor, type PlanTestimonialDb } from "../plan-testimonials";
import { isStudioLaunchOfferOpen, planAppsSummary, STUDIO_LAUNCH_OFFER, TESTIMONIALS_PER_MONTH } from "../money-model";

interface Row { userId: string; stripePaymentId: string; minutes: number; createdAt: Date }

function fakeDb(user: { minutesLimit: number; minutesUsed: number; bonusMinutes: number; subscriptionStatus: string }) {
  const rows: Row[] = [];
  const videos: Array<{ createdAt: Date; minutesReserved: number; minutesState: string }> = [];
  let clock = 0;
  const db: PlanTestimonialDb = {
    async $transaction(fn) {
      const snapshot = { ...user };
      const before = rows.length;
      try {
        return await fn({
          creditPurchase: {
            async create({ data }) {
              if (rows.some((r) => r.stripePaymentId === data.stripePaymentId)) throw Object.assign(new Error("unique"), { code: "P2002" });
              rows.push({ ...data, createdAt: new Date(++clock * 1000) });
            },
            async findFirst({ where }) {
              const r = rows.filter((x) => x.userId === where.userId && x.stripePaymentId.startsWith(where.stripePaymentId.startsWith) && x.stripePaymentId !== where.stripePaymentId.not).at(-1);
              return r ? { minutes: r.minutes, createdAt: r.createdAt } : null;
            },
          },
          falCompositeVideo: {
            async aggregate({ where }) {
              const v = videos.filter((x) => x.createdAt >= where.createdAt.gte && where.minutesState.in.includes(x.minutesState));
              return { _sum: { minutesReserved: v.length ? v.reduce((a, x) => a + x.minutesReserved, 0) : null } };
            },
          },
          user: {
            async findUnique() { return { ...user }; },
            async update({ data }) {
              user.bonusMinutes += data.bonusMinutes.increment;
              user.minutesLimit += data.minutesLimit.increment;
            },
          },
        });
      } catch (e) {
        Object.assign(user, snapshot);
        rows.length = before;
        throw e;
      }
    },
  };
  const spend = (n: number) => {
    user.minutesUsed += n;
    videos.push({ createdAt: new Date(++clock * 1000), minutesReserved: n, minutesState: "charged" });
  };
  return { db, user, rows, spend };
}

describe("money model", () => {
  it("only Scale and Agency include testimonials (never the unlimited Ad Department)", () => {
    expect(TESTIMONIALS_PER_MONTH).toEqual({ starter: 0, ad_department: 0, growth: 0, scale: 1, agency: 3 });
    expect(planAppsSummary("ad_department").join(" ")).toMatch(/Unlimited ads and Studio videos for your business/);
    expect(planTestimonialsFor("agency", true)).toBe(36);
    expect(planAppsSummary("growth").join(" ")).toMatch(/Scale and Agency only/);
  });
  it("studio launch window is 72h from the first free video", () => {
    const t = new Date("2026-11-10T00:00:00Z");
    expect(isStudioLaunchOfferOpen(null, t)).toBe(false);
    expect(isStudioLaunchOfferOpen(t, new Date(t.getTime() + 71 * 3_600_000))).toBe(true);
    expect(isStudioLaunchOfferOpen(t, new Date(t.getTime() + STUDIO_LAUNCH_OFFER.windowHours * 3_600_000))).toBe(false);
  });
});

describe("plan testimonials", () => {
  it("grants usable minutes to a user without a testimonial subscription, once per invoice", async () => {
    const f = fakeDb({ minutesLimit: 0, minutesUsed: 0, bonusMinutes: 0, subscriptionStatus: "none" });
    expect(await grantPlanTestimonials(f.db, "u1", "in_1", 3)).toEqual({ status: "granted", granted: 3, expired: 0 });
    expect(await grantPlanTestimonials(f.db, "u1", "in_1", 3)).toEqual({ status: "duplicate" });
    expect(f.user).toMatchObject({ minutesLimit: 3, bonusMinutes: 3 });
    expect(evaluateEntitlement(f.user, 1)).toMatchObject({ allowed: true, remainingMinutes: 3, via: "credits" });
  });

  it("expires unused plan minutes at the next grant (no rollover), never pack minutes", async () => {
    const f = fakeDb({ minutesLimit: 5, minutesUsed: 0, bonusMinutes: 5, subscriptionStatus: "none" }); // 5-pack bought earlier
    await grantPlanTestimonials(f.db, "u1", "in_1", 3);
    f.spend(1); // plan minutes are spent first
    expect(await grantPlanTestimonials(f.db, "u1", "in_2", 3)).toEqual({ status: "granted", granted: 3, expired: 2 });
    expect(evaluateEntitlement(f.user, 1).remainingMinutes).toBe(8); // 5 pack + 3 new
    f.spend(5);
    expect(await grantPlanTestimonials(f.db, "u1", "in_3", 3)).toMatchObject({ expired: 0 });
    expect(evaluateEntitlement(f.user, 1).remainingMinutes).toBe(6); // 3 pack left + 3 new
  });

  it("caps the expiry by what is actually left", () => {
    expect(expiringPlanMinutes({ previousGrant: 3, usedSincePrevious: 0, minutesLimit: 4, minutesUsed: 3, bonusMinutes: 4 })).toBe(1);
    expect(expiringPlanMinutes({ previousGrant: 1, usedSincePrevious: 2, minutesLimit: 9, minutesUsed: 0, bonusMinutes: 9 })).toBe(0);
  });

  it("skips zero grants", async () => {
    const f = fakeDb({ minutesLimit: 0, minutesUsed: 0, bonusMinutes: 0, subscriptionStatus: "none" });
    expect(await grantPlanTestimonials(f.db, "u1", "in_1", 0)).toEqual({ status: "skipped" });
  });
});
