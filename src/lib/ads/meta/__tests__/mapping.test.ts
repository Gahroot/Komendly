import { describe, expect, it } from "vitest";
import { adPayload, adSetPayload, adsManagerUrl, campaignPayload, ctaType, objectiveForGoal, placementGroupForRatio, placementTargeting } from "../core/mapping";

describe("objective mapping", () => {
  it.each([
    ["leads", "OUTCOME_LEADS"], ["sales", "OUTCOME_SALES"], ["awareness", "OUTCOME_AWARENESS"],
    ["traffic", "OUTCOME_TRAFFIC"], ["app_installs", "OUTCOME_APP_PROMOTION"], ["auto", "OUTCOME_TRAFFIC"], [null, "OUTCOME_TRAFFIC"],
  ])("%s -> %s", (goal, obj) => expect(objectiveForGoal(goal)).toBe(obj));
});

describe("placements by ratio", () => {
  it("9:16 goes to Stories/Reels, 4:5 and 1:1 to Feed", () => {
    expect(placementGroupForRatio("9:16")).toBe("stories_reels");
    expect(placementGroupForRatio("4:5")).toBe("feed");
    expect(placementGroupForRatio("1:1")).toBe("feed");
    expect(placementTargeting("stories_reels").instagram_positions).toEqual(["story", "reels"]);
    expect(placementTargeting("feed").facebook_positions).toEqual(["feed"]);
  });
});

describe("paused by default", () => {
  it("campaign, ad set and ad payloads are PAUSED", () => {
    expect(campaignPayload({ name: "c", objective: "OUTCOME_SALES" }).status).toBe("PAUSED");
    const set = adSetPayload({ name: "s", campaignId: "1", objective: "OUTCOME_SALES", group: "stories_reels", dailyBudgetMinor: 2000, countries: ["US"] });
    expect(set.status).toBe("PAUSED");
    expect(set.daily_budget).toBe(2000);
    expect(set.targeting.facebook_positions).toEqual(["story", "facebook_reels"]);
    expect(adPayload({ name: "a", adSetId: "2", creativeId: "3" }).status).toBe("PAUSED");
  });

  it("maps CTA text and builds an Ads Manager link", () => {
    expect(ctaType("Shop now", "OUTCOME_SALES")).toBe("SHOP_NOW");
    expect(ctaType(null, "OUTCOME_APP_PROMOTION")).toBe("INSTALL_MOBILE_APP");
    expect(adsManagerUrl("act_123", "9")).toContain("act=123");
  });
});
