import { describe, expect, it } from "vitest";
import { adSetPlan, countryFromLocale, defaultPublishGoal, suggestedDailyBudget, toMinorUnits } from "../publish-options";

describe("publish options", () => {
  it("guesses the country from the browser locale", () => {
    expect(countryFromLocale("en-GB")).toBe("GB");
    expect(countryFromLocale("de")).toBe("DE");
    expect(countryFromLocale("xx-ZZ")).toBe("US");
    expect(countryFromLocale(undefined)).toBe("US");
  });

  it("converts budgets to Meta minor units", () => {
    expect(toMinorUnits(15, "USD")).toBe(1500);
    expect(toMinorUnits(12.5, "eur")).toBe(1250);
    expect(toMinorUnits(2000, "JPY")).toBe(2000);
    expect(suggestedDailyBudget("USD")).toBe(15);
    expect(suggestedDailyBudget("JPY")).toBeNull();
  });

  it("prefills the goal from the run", () => {
    expect(defaultPublishGoal("leads")).toBe("leads");
    expect(defaultPublishGoal("auto")).toBe("traffic");
    expect(defaultPublishGoal("app_installs")).toBe("traffic");
  });

  it("plans one ad set per placement", () => {
    const plan = adSetPlan([{ ratios: ["4:5", "1:1", "9:16"] }, { ratios: ["4:5"] }], ["4:5", "1:1", "9:16"]);
    expect(plan).toEqual([{ label: "Feed", ratios: ["1:1", "4:5"], ads: 2 }, { label: "Stories & Reels", ratios: ["9:16"], ads: 1 }]);
    expect(adSetPlan([{ ratios: ["9:16"] }], ["4:5"])).toEqual([]);
  });
});

describe("fromMinorUnits", () => {
  it("reverses toMinorUnits", async () => {
    const { fromMinorUnits } = await import("../publish-options");
    expect(fromMinorUnits(1500, "USD")).toBe(15);
    expect(fromMinorUnits(2000, "JPY")).toBe(2000);
  });
});
