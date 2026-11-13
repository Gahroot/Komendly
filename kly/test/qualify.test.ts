import { describe, expect, it } from "vitest";
import { pageText, parseQualification, qualificationScore, type Qualification } from "../src/qualify";

const good: Qualification = { isLocalSmb: true, sellsToConsumers: true, chainOrFranchise: false, excludedType: "none", benefitsFromSocialAds: true, isLegal: false, score: 82.4, reasons: ["family roofer"] };

describe("qualification", () => {
  it("parses a valid answer and rounds the score", () => {
    expect(parseQualification(good)).toEqual({ score: 82, qualification: good });
  });
  it("rejects malformed answers", () => {
    expect(parseQualification({ ...good, score: "high" })).toBeNull();
    expect(parseQualification({ ...good, excludedType: "bank" })).toBeNull();
    expect(parseQualification(null)).toBeNull();
  });
  it("hard exclusions zero the score", () => {
    expect(qualificationScore({ ...good, chainOrFranchise: true })).toBe(0);
    expect(qualificationScore({ ...good, isLocalSmb: false })).toBe(0);
    expect(qualificationScore({ ...good, excludedType: "agency" })).toBe(0);
  });
  it("caps B2B and no-ads-fit businesses", () => {
    expect(qualificationScore({ ...good, sellsToConsumers: false })).toBe(40);
    expect(qualificationScore({ ...good, benefitsFromSocialAds: false })).toBe(45);
  });
  it("pageText strips markup and scripts", () => {
    expect(pageText("<html><script>var x=1</script><h1>Acme&nbsp;Roofing</h1><p>Since 1990</p></html>")).toBe("Acme Roofing Since 1990");
  });
});
