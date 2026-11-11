import { describe, expect, it } from "vitest";
import { adTextFile, LAUNCH_GUIDE_STEPS } from "../launch-guide";

describe("launch guide", () => {
  it("has 5 short steps", () => {
    expect(LAUNCH_GUIDE_STEPS).toHaveLength(5);
    for (const s of LAUNCH_GUIDE_STEPS) expect(s.text.split(/\s+/).length).toBeLessThan(50);
  });
  it("ad-text.txt pairs each ad's files with its copy and skips ads with no files", () => {
    const t = adTextFile("Joe's Bakery", [
      { files: ["ad-01-problem_aware-1x1.png"], headline: "Fresh bread by 7am", body: "Order tonight, pick up warm.", cta: "Order now" },
      { files: [], headline: "Locked one", body: null, cta: null },
      { files: ["ad-02-most_aware-1x1.png"], headline: "Sourdough Saturdays", body: null, cta: null },
    ]);
    expect(t).toContain("Your ads for Joe's Bakery");
    expect(t).toContain("--- ad-01-problem_aware-1x1.png\r\nHeadline: Fresh bread by 7am\r\nPrimary text: Order tonight, pick up warm.\r\nButton idea: Order now");
    expect(t).not.toContain("Locked one");
    expect(t).toContain("Headline: Sourdough Saturdays");
  });
});

describe("launch guide file text", () => {
  it("gives the Ads Manager address in the file, not 'button below'", () => {
    const t = adTextFile("X", []);
    expect(t).toContain("2. Open Meta Ads Manager: Open Meta Ads Manager and click Create.");
    expect(t).toContain("https://adsmanager.facebook.com");
    expect(t).not.toContain("button below");
  });
});
