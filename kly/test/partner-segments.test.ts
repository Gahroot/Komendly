import { describe, expect, it } from "vitest";
import { checkArmContent } from "../src/arms";
import { PARTNER_ARM_KEYS, PARTNER_COPY, partnerCopyErrors, partnerSeedArms } from "../src/partner-segments";
import { audienceOf, nicheDef, NICHES } from "../src/targets";

describe("partner segments", () => {
  it("copy passes the shared rules and has three first-touch variants", () => {
    expect(partnerCopyErrors()).toEqual([]);
    expect(PARTNER_COPY.filter((c) => c.dimension === "body")).toHaveLength(3);
  });
  it("seed arms validate and are agency audience", () => {
    for (const a of partnerSeedArms()) expect(checkArmContent(a.dimension, a.content), a.key).toBeNull();
    expect(audienceOf("seo agencies")).toBe("agency");
    expect(nicheDef("media buyers")?.osm.length).toBeGreaterThan(0);
  });
  it("stays out of the default catalog", () => {
    expect(NICHES.some((n) => PARTNER_ARM_KEYS.has(`segment:${n.niche}`))).toBe(false);
  });
});
