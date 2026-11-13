import { describe, expect, it } from "vitest";
import {
  AdPlanSchema, BONUS_TIMING, bonusDue, bonusesEnabled, checkBonusOutput, CHECKUP_AREAS, CheckupSchema, checkupRerunOpensAt, HOOK_LEVELS, HookLibrarySchema, unknownPlanAds,
} from "../bonuses/contracts";

const now = new Date("2026-11-11T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const DAY = 86_400_000;
const ctx = { now, readyAdCount: 5, latestReadyAdAt: ago(10 * DAY), hasBrand: true };

function checkup() {
  return { summary: "Fix your headline first, it's the biggest leak.", fixes: CHECKUP_AREAS.map((area) => ({ area, title: `Fix ${area}`, whatsWrong: "The page says nothing clear.", whyItMatters: "You pay for clicks that leave.", rewrite: area === "headline" ? "Fresh bread, delivered by 7am" : null })) };
}
function plan(ids = ["a1", "a2", "a3", "a4"]) {
  return { summary: "Start with the problem ad, end with the offer.", rules: ["Leave each ad alone for 3 days.", "Never spend more than $20 a day."], weeks: ids.map((adId, i) => ({ week: i + 1, adId, adHeadline: "H", why: "It speaks to the main worry.", dailyBudgetUsd: 15, primaryText: "Tired of stale bread? Try ours.", headline: "Bread by 7am", judgeWhen: "After 4 days and about $60 spent." })) };
}
function library() {
  const hooks = Array.from({ length: 40 }, (_, i) => ({ level: HOOK_LEVELS[i % 3], text: `Hook number ${i}` }));
  const captions = Array.from({ length: 20 }, (_, i) => ({ level: HOOK_LEVELS[i % 3], text: `Caption number ${i}` }));
  return { industry: "Bakery", offer: "Bread delivered by 7am", hooks, captions };
}

describe("bonus output schemas", () => {
  it("accepts a valid check-up and requires all 7 areas once", () => {
    expect(CheckupSchema.safeParse(checkup()).success).toBe(true);
    const dup = checkup();
    dup.fixes[1] = { ...dup.fixes[0]! };
    expect(CheckupSchema.safeParse(dup).success).toBe(false);
    expect(CheckupSchema.safeParse({ ...checkup(), fixes: checkup().fixes.slice(0, 6) }).success).toBe(false);
  });
  it("plan: 4 weeks in order, budget $10-20", () => {
    expect(AdPlanSchema.safeParse(plan()).success).toBe(true);
    const p = plan();
    p.weeks[0]!.dailyBudgetUsd = 25;
    expect(AdPlanSchema.safeParse(p).success).toBe(false);
    const q = plan();
    q.weeks[0]!.week = 2;
    expect(AdPlanSchema.safeParse(q).success).toBe(false);
  });
  it("plan ad ids must be the member's ads", () => {
    const p = AdPlanSchema.parse(plan(["a1", "a2", "zz", "a4"]));
    expect(unknownPlanAds(p, ["a1", "a2", "a4"])).toEqual(["zz"]);
  });
  it("library: 40 distinct hooks, 20 captions, every level covered", () => {
    expect(HookLibrarySchema.safeParse(library()).success).toBe(true);
    const l = library();
    l.hooks[1] = { ...l.hooks[0]! };
    expect(HookLibrarySchema.safeParse(l).success).toBe(false);
    const m = library();
    m.hooks = m.hooks.map((h) => ({ ...h, level: "offer" as const }));
    expect(HookLibrarySchema.safeParse(m).success).toBe(false);
    expect(checkBonusOutput("hook_library", { ...library(), captions: [] }).ok).toBe(false);
  });
});

describe("bonusDue", () => {
  const ready = (generatedAt: Date) => ({ status: "ready", generatedAt, updatedAt: generatedAt });
  it("generates every bonus initially once there is a brand (plan needs ads)", () => {
    expect(bonusDue("website_checkup", null, ctx)).toBe("initial");
    expect(bonusDue("hook_library", null, { ...ctx, hasBrand: false })).toBeNull();
    expect(bonusDue("ad_plan", null, { ...ctx, readyAdCount: 0, latestReadyAdAt: null })).toBeNull();
    expect(bonusDue("ad_plan", null, ctx)).toBe("initial");
  });
  it("check-up never auto-refreshes", () => {
    expect(bonusDue("website_checkup", ready(ago(90 * DAY)), ctx)).toBeNull();
  });
  it("plan and library refresh monthly", () => {
    expect(bonusDue("hook_library", ready(ago(29 * DAY)), ctx)).toBeNull();
    expect(bonusDue("hook_library", ready(ago(31 * DAY)), ctx)).toBe("monthly");
    expect(bonusDue("ad_plan", ready(ago(31 * DAY)), ctx)).toBe("monthly");
  });
  it("plan rebuilds after new ads (e.g. a Weekly Drop) once they've settled", () => {
    const row = ready(ago(5 * DAY));
    expect(bonusDue("ad_plan", row, { ...ctx, latestReadyAdAt: ago(BONUS_TIMING.newAdsSettleMs + 60_000) })).toBe("new_ads");
    expect(bonusDue("ad_plan", row, { ...ctx, latestReadyAdAt: ago(60_000) })).toBeNull();
    expect(bonusDue("ad_plan", row, { ...ctx, latestReadyAdAt: ago(6 * DAY) })).toBeNull();
    expect(bonusDue("hook_library", row, { ...ctx, latestReadyAdAt: ago(BONUS_TIMING.newAdsSettleMs + 60_000) })).toBeNull();
  });
  it("in-flight is left alone until stuck; failures retry after a wait", () => {
    expect(bonusDue("hook_library", { status: "generating", generatedAt: null, updatedAt: ago(10 * 60_000) }, ctx)).toBeNull();
    expect(bonusDue("hook_library", { status: "pending", generatedAt: null, updatedAt: ago(BONUS_TIMING.stuckMs + 1) }, ctx)).toBe("stuck");
    expect(bonusDue("website_checkup", { status: "failed", generatedAt: null, updatedAt: ago(60_000) }, ctx)).toBeNull();
    expect(bonusDue("website_checkup", { status: "failed", generatedAt: null, updatedAt: ago(BONUS_TIMING.failedRetryMs + 1) }, ctx)).toBe("retry");
  });
  it("member check-up re-run opens 7 days after the last one", () => {
    expect(checkupRerunOpensAt(null, now)).toBeNull();
    expect(checkupRerunOpensAt(ready(ago(8 * DAY)), now)).toBeNull();
    expect(checkupRerunOpensAt(ready(ago(2 * DAY)), now)?.toISOString()).toBe(new Date(now.getTime() + 5 * DAY).toISOString());
  });
  it("kill switch", () => {
    expect(bonusesEnabled({ ADS_BONUSES: "0" })).toBe(false);
    expect(bonusesEnabled({})).toBe(true);
  });
});

import { AD_DEPARTMENT_STACK } from "@/lib/ads/billing-config";
import { BONUS_META as BONUS_META_FOR_STACK } from "@/lib/ads/bonuses/contracts";

describe("offer stack bonus values match the bonus pages", () => {
  it("uses the same stated value for each bonus", () => {
    const byLabel = Object.fromEntries(AD_DEPARTMENT_STACK.filter((i) => i.bonus).map((i) => [i.label, i.valueUsd]));
    for (const m of Object.values(BONUS_META_FOR_STACK)) expect(byLabel[m.title]).toBe(m.valueUsd);
  });
});
