import { describe, expect, it } from "vitest";
import { hasBannedClaim } from "../copy";

describe("hasBannedClaim (copy guard for the fixed hot follow-up)", () => {
  const prices = ["$97", "$297"];
  it("lets only the exact public prices through", () => {
    expect(hasBannedClaim("$97 your first month, then $297/month", [])).toBe(true); // arms may not quote $297
    expect(hasBannedClaim("$97 your first month, then $297/month", prices)).toBe(false);
    for (const t of ["then $2970/month", "then $297.50 a month", "only $199", "$97.5", "$29"]) expect(hasBannedClaim(t, prices)).toBe(true);
  });
  it("still blocks guaranteed results, leads, ROI, hype and links", () => {
    for (const t of ["guaranteed leads", "we guarantee it", "great results", "leads will come", "real ROI", "100% sure", "up to 50%", "act now", "limited time", "last chance", "we work with Acme", "customer of ours", "wow!!", "see https://x.com", "email me@x.com", "free forever"]) {
      expect(hasBannedClaim(t, prices), t).toBe(true);
    }
  });
  it("passes plain words", () => {
    expect(hasBannedClaim("Thanks for taking a look at the ad. Reply yes and I'll set it up.", prices)).toBe(false);
  });
});
