import { describe, expect, it } from "vitest";
import { ADS_PLANS, ADS_TOPUPS, annualCredits, annualPriceCents } from "../billing-config";

// Every plan is a credit plan (owner decision 2026-11-13: no unlimited plans). Starter and the "Nx Starter" plans are
// sized for the Codex subscription (cost per credit ~ compute only); legacy Growth/Scale and top-ups keep the
// original >= 70% margin at p90 API list cost.
const CREDIT_PLANS = ADS_PLANS;
const LEGACY_PLANS = ADS_PLANS.filter((p) => p.hiddenForNewBuyers);
import { CODEX_PER_CREDIT, marginAt, P90_PER_CREDIT } from "../../../../scripts/ads-pricing-sim";

describe("ads pricing margins", () => {
  it("uses a p90 API cost per credit in the expected band", () => {
    expect(P90_PER_CREDIT).toBeGreaterThan(0.4);
    expect(P90_PER_CREDIT).toBeLessThan(0.7);
  });

  it.each(CREDIT_PLANS.map((p) => [p.name, p.priceCents, p.monthlyCredits] as const))("plan %s keeps >= 90%% margin on the Codex subscription with every credit used", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, CODEX_PER_CREDIT)).toBeGreaterThanOrEqual(0.9);
  });

  it.each(LEGACY_PLANS.map((p) => [p.name, p.priceCents, p.monthlyCredits] as const))("legacy plan %s keeps >= 70%% margin at p90 API cost", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
  });

  it.each(ADS_TOPUPS.map((t) => [t.name, t.priceCents, t.credits] as const))("top-up %s keeps >= 70%% margin at p90 API cost", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
  });

  it("prices top-ups per credit above every plan", () => {
    const planMax = Math.max(...CREDIT_PLANS.map((p) => p.priceCents / p.monthlyCredits));
    for (const t of ADS_TOPUPS) expect(t.priceCents / t.credits).toBeGreaterThan(planMax);
  });

  it.each(CREDIT_PLANS.map((p) => [p.name, annualPriceCents(p), annualCredits(p)] as const))("annual %s keeps >= 85%% margin on the Codex subscription", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, CODEX_PER_CREDIT)).toBeGreaterThanOrEqual(0.85);
  });
});

describe("no unlimited plans; Nx Starter usage", () => {
  const starter = ADS_PLANS.find((p) => p.key === "starter")!;
  const hero = ADS_PLANS.find((p) => p.key === "ad_department")!;
  const agency = ADS_PLANS.find((p) => p.key === "agency")!;
  it("no plan is unlimited and every plan grants credits", () => {
    for (const p of ADS_PLANS) {
      expect(p.unlimited).toBeFalsy();
      expect(p.monthlyCredits).toBeGreaterThan(0);
    }
  });
  it("Starter is 60 credits; Ad Department is exactly 20x and Agency 50x of it", () => {
    expect(starter.monthlyCredits).toBe(60);
    expect(hero.usageMultiple).toBe(20);
    expect(hero.monthlyCredits).toBe(20 * starter.monthlyCredits);
    expect(agency.usageMultiple).toBe(50);
    expect(agency.monthlyCredits).toBe(50 * starter.monthlyCredits);
    expect(agency.priceCents).toBeGreaterThan(hero.priceCents);
  });
  it("sales copy never promises unlimited and never shows the multiple plans' credit counts", async () => {
    const cfg = await import("../billing-config");
    const copy = [cfg.PLAN_USAGE_NOTE, cfg.FOUNDING_TERMS, ...cfg.AD_DEPARTMENT_STACK.map((i) => `${i.label} ${i.detail}`), ...ADS_PLANS.flatMap((p) => p.highlights)].join(" ");
    expect(copy).not.toMatch(/unlimited/i);
    for (const p of [hero, agency]) {
      expect(copy).not.toContain(String(p.monthlyCredits));
      expect(cfg.planUsageLine(p)).toBe(`${p.usageMultiple}x Starter usage for ads and Studio videos`);
    }
    expect(cfg.planUsageLine(starter)).toBe("60 credits / month");
  });
});

describe("annual prepay and agency price ids", () => {
  const env = { STRIPE_ADS_AGENCY_PRICE_ID: "price_ag_m", STRIPE_ADS_AGENCY_ANNUAL_PRICE_ID: "price_ag_y", STRIPE_ADS_STARTER_ANNUAL_PRICE_ID: "price_st_y" };
  it("maps annual and monthly price ids to the plan and interval", async () => {
    const { intervalFromPriceId, planFromPriceId } = await import("../billing-config");
    expect(intervalFromPriceId("price_ag_m", env)).toBe("month");
    expect(intervalFromPriceId("price_ag_y", env)).toBe("year");
    expect(intervalFromPriceId("price_x", env)).toBeNull();
    expect(planFromPriceId("price_ag_y", env)?.key).toBe("agency");
    expect(planFromPriceId("price_st_y", env)?.key).toBe("starter");
  });
  it("prices annual at 10 months and grants 12 months of credits", () => {
    const starter = ADS_PLANS.find((p) => p.key === "starter");
    if (!starter) throw new Error("no starter");
    expect(annualPriceCents(starter)).toBe(49000);
    expect(annualCredits(starter)).toBe(720);
  });
});

describe("upgrade top-up", () => {
  it("adds the difference to the new plan's period credits, never negative", async () => {
    const { upgradeTopUpCredits } = await import("../credits");
    expect(upgradeTopUpCredits(255, 20)).toBe(235);
    expect(upgradeTopUpCredits(240, 20)).toBe(220);
    expect(upgradeTopUpCredits(20, 55)).toBe(0);
    expect(upgradeTopUpCredits(55, -3)).toBe(55);
  });
});

describe("unlock_pack tripwire", () => {
  it("is $9 for 3 credits, resolvable as a topup but not listed with the credit packs", async () => {
    const { getTopup, UNLOCK_PACK, unlockPackCouponId } = await import("../billing-config");
    expect(UNLOCK_PACK).toMatchObject({ key: "unlock_pack", priceCents: 900, credits: 3, priceEnv: "STRIPE_ADS_UNLOCK_PACK_PRICE_ID" });
    expect(getTopup("unlock_pack")).toBe(UNLOCK_PACK);
    expect(ADS_TOPUPS.some((t) => t.key === "unlock_pack")).toBe(false);
    expect(unlockPackCouponId({ STRIPE_ADS_UNLOCK_PACK_COUPON_ID: "c1" })).toBe("c1");
    expect(unlockPackCouponId({})).toBeNull();
  });
  it("keeps >= 70% margin at p90 API cost and costs more per credit than any plan", async () => {
    const { UNLOCK_PACK } = await import("../billing-config");
    expect(marginAt(UNLOCK_PACK.priceCents / 100, UNLOCK_PACK.credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
    const planMax = Math.max(...CREDIT_PLANS.map((p) => p.priceCents / p.monthlyCredits));
    expect(UNLOCK_PACK.priceCents / UNLOCK_PACK.credits).toBeGreaterThan(planMax);
  });
});

import { brandAllowed, hasAdDepartment, isUnlimitedPlan, unlimitedBrandLimit } from "@/lib/ads/billing-config";

describe("Ad Department features without unlimited", () => {
  const ws = (adsPlan: string, subscriptionStatus = "active") => ({ adsPlan, subscriptionStatus });
  it("Ad Department and Agency keep their features but are not unlimited or brand-capped", () => {
    for (const k of ["ad_department", "agency", "starter"]) {
      expect(isUnlimitedPlan(ws(k))).toBe(false);
      expect(unlimitedBrandLimit(ws(k))).toBeNull();
    }
    expect(hasAdDepartment(ws("agency"))).toBe(true);
    expect(hasAdDepartment(ws("ad_department"))).toBe(true);
    expect(hasAdDepartment(ws("starter"))).toBe(false);
  });
  it("brand rule helper still works for a cap", () => {
    expect(brandAllowed("acme.com", ["acme.com"], 1)).toBe(true);
    expect(brandAllowed("other.com", ["acme.com"], 1)).toBe(false);
    expect(brandAllowed("x.com", ["a.com", "b.com"], null)).toBe(true);
  });
});

describe("admin parallel Studio chats", () => {
  it("admins get many at once, everyone else keeps the plan limit", async () => {
    const { concurrentLimit, ADMIN_CONCURRENT } = await import("../billing-config");
    const w = { adsPlan: "ad_department" } as Parameters<typeof concurrentLimit>[0];
    expect(concurrentLimit(w, { isAdmin: true })).toBe(ADMIN_CONCURRENT);
    expect(concurrentLimit(w, { isAdmin: false })).toBe(1);
    expect(concurrentLimit(w, null)).toBe(1);
  });
});

describe("usage bar for Nx Starter plans", () => {
  it("shows a percent (never the count) on 20x/50x plans and the count elsewhere", async () => {
    const { usageMeter } = await import("../billing-config");
    expect(usageMeter("ad_department", 1200)).toEqual({ percentLeft: 100, label: "100% of this month's usage left" });
    expect(usageMeter("ad_department", 600)?.percentLeft).toBe(50);
    expect(usageMeter("ad_department", 2000)?.percentLeft).toBe(100);
    expect(usageMeter("ad_department", 1)?.percentLeft).toBe(1);
    expect(usageMeter("ad_department", 0)).toEqual({ percentLeft: 0, label: "This month's usage is used up" });
    expect(usageMeter("agency", 1500)?.percentLeft).toBe(50);
    expect(usageMeter("starter", 30)).toBeNull();
    expect(usageMeter("trial", 10)).toBeNull();
  });
});

describe("Unlimited week pass (one-time add-on, never a plan)", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  const day = 86_400_000;
  it("is a $49 one-time 0-credit pack, resolvable as a topup but not listed with credit packs", async () => {
    const { getTopup, UNLIMITED_WEEK, UNLIMITED_WEEK_DAYS } = await import("../billing-config");
    expect(UNLIMITED_WEEK).toMatchObject({ key: "unlimited_week", priceCents: 4900, credits: 0 });
    expect(UNLIMITED_WEEK_DAYS).toBe(7);
    expect(getTopup("unlimited_week")).toBe(UNLIMITED_WEEK);
    expect(ADS_TOPUPS.some((t) => t.key === "unlimited_week")).toBe(false);
  });
  it("makes a paid workspace unlimited until it ends, never while suspended", async () => {
    const { isUnlimitedPlan, unlimitedBrandLimit } = await import("../billing-config");
    const ws = { adsPlan: "ad_department", subscriptionStatus: "active", unlimitedUntil: new Date(now.getTime() + day) };
    expect(isUnlimitedPlan(ws, now)).toBe(true);
    expect(unlimitedBrandLimit(ws, now)).toBe(1);
    expect(unlimitedBrandLimit({ ...ws, adsPlan: "agency" }, now)).toBe(10);
    expect(isUnlimitedPlan(ws, new Date(now.getTime() + 2 * day))).toBe(false);
    expect(isUnlimitedPlan({ ...ws, suspendedAt: now }, now)).toBe(false);
    // A week already bought runs to its end even if the plan is cancelled meanwhile.
    expect(isUnlimitedPlan({ ...ws, subscriptionStatus: "canceled" }, now)).toBe(true);
    expect(isUnlimitedPlan({ ...ws, unlimitedUntil: null }, now)).toBe(false);
  });
  it("stacks a second week on a running pass, starts fresh after one ended", async () => {
    const { extendUnlimitedUntil } = await import("../billing-config");
    expect(extendUnlimitedUntil(null, now).getTime()).toBe(now.getTime() + 7 * day);
    expect(extendUnlimitedUntil(new Date(now.getTime() + 2 * day), now).getTime()).toBe(now.getTime() + 9 * day);
    expect(extendUnlimitedUntil(new Date(now.getTime() - day), now).getTime()).toBe(now.getTime() + 7 * day);
  });
  it("only active paid plans may buy it", async () => {
    const { canBuyUnlimitedWeek } = await import("../billing-config");
    expect(canBuyUnlimitedWeek({ adsPlan: "starter", subscriptionStatus: "active" })).toBe(true);
    expect(canBuyUnlimitedWeek({ adsPlan: "trial", subscriptionStatus: "none" })).toBe(false);
    expect(canBuyUnlimitedWeek({ adsPlan: "starter", subscriptionStatus: "canceled" })).toBe(false);
    expect(canBuyUnlimitedWeek({ adsPlan: "starter", subscriptionStatus: "active", suspendedAt: new Date() })).toBe(false);
  });
});

describe("Growth Autopilot split (2026-11-22)", () => {
  it("adds the autopilot tier: $297 founding, Ad Department credits, weekly drop, monthly only, maps its price id", async () => {
    const cfg = await import("@/lib/ads/billing-config");
    const ap = cfg.getPlan("autopilot")!;
    expect(ap.name).toBe(cfg.AUTOPILOT_PLAN_NAME);
    expect(ap.priceCents).toBe(cfg.AUTOPILOT_PRICE_CENTS);
    expect(ap.priceCents).toBe(29700);
    expect(ap.monthlyCredits).toBe(cfg.getPlan("ad_department")!.monthlyCredits);
    expect(ap.weeklyDrop).toBe(true);
    expect(ap.annualPriceEnv).toBeUndefined();
    expect(cfg.isPlanForSale("autopilot")).toBe(true);
    expect(cfg.planFromPriceId("price_ap", { STRIPE_ADS_AUTOPILOT_PRICE_ID: "price_ap" })?.key).toBe("autopilot");
    expect(cfg.getPlan("ad_department")!.highlights.join(" ")).not.toMatch(/launch|lead ads|run for you/i);
    expect(cfg.planDisplayName(cfg.getPlan("ad_department")!)).toBe("Ozzy Ad Department");
  });
  it("hasAdDepartment includes autopilot; hasTeam is autopilot or agency, live only", async () => {
    const { hasAdDepartment, hasTeam } = await import("@/lib/ads/billing-config");
    const w = (adsPlan: string, subscriptionStatus = "active") => ({ adsPlan, subscriptionStatus });
    expect(hasAdDepartment(w("autopilot"))).toBe(true);
    expect(hasTeam(w("autopilot"))).toBe(true);
    expect(hasTeam(w("agency", "past_due"))).toBe(true);
    expect(hasTeam(w("ad_department"))).toBe(false);
    expect(hasTeam(w("autopilot", "canceled"))).toBe(false);
    expect(hasTeam({ adsPlan: "autopilot", subscriptionStatus: "active", suspendedAt: new Date() })).toBe(false);
  });
  it("founding spots: 10, counted on live autopilot subscriptions, never below 0", async () => {
    const { foundingSpotsLeft, spotsLeftFrom } = await import("@/lib/ads/founding-spots");
    expect(spotsLeftFrom(0)).toBe(10);
    expect(spotsLeftFrom(12)).toBe(0);
    let where: unknown;
    const left = await foundingSpotsLeft({ adsWorkspace: { count: async (a) => { where = a.where; return 7; } } });
    expect(left).toBe(3);
    expect(where).toEqual({ adsPlan: "autopilot", subscriptionStatus: { in: ["active", "trialing", "past_due"] } });
  });
});
