import { describe, expect, it } from "vitest";
import { canFeatureAd, defaultCaption, FeatureConsent, featuredEmailCopy, nextFeatureStatus, normalizeHandle } from "../features";

describe("feature transitions", () => {
  it("consent creates or re-consents", () => {
    expect(nextFeatureStatus(null, "consent")).toBe("consented");
    expect(nextFeatureStatus("withdrawn", "consent")).toBe("consented");
    expect(nextFeatureStatus("featured", "consent")).toBeNull();
  });
  it("admin queue moves", () => {
    expect(nextFeatureStatus("consented", "shortlist")).toBe("shortlisted");
    expect(nextFeatureStatus("shortlisted", "feature")).toBe("featured");
    expect(nextFeatureStatus("consented", "decline")).toBe("declined");
    expect(nextFeatureStatus("withdrawn", "feature")).toBeNull();
    expect(nextFeatureStatus("featured", "decline")).toBeNull();
  });
  it("users can withdraw any time, even after featuring", () => {
    expect(nextFeatureStatus("featured", "withdraw")).toBe("withdrawn");
    expect(nextFeatureStatus("declined", "withdraw")).toBeNull();
  });
});

describe("eligibility and handles", () => {
  it("only ready, unlocked, non-gift ads", () => {
    expect(canFeatureAd({ status: "ready" }, "standard")).toBe(true);
    expect(canFeatureAd({ status: "ready", locked: true }, "standard")).toBe(false);
    expect(canFeatureAd({ status: "ready" }, "gift")).toBe(false);
    expect(canFeatureAd({ status: "rendering" }, "standard")).toBe(false);
  });
  it("normalizes handles and profile URLs", () => {
    expect(normalizeHandle("acme.co")).toBe("@acme.co");
    expect(normalizeHandle("@@acme")).toBe("@acme");
    expect(normalizeHandle("https://www.instagram.com/acme_studio/?hl=en")).toBe("@acme_studio");
    expect(normalizeHandle("facebook.com/AcmePage")).toBe("@AcmePage");
    expect(normalizeHandle("  ")).toBe("");
    expect(normalizeHandle("<script>")).toBe("@script");
  });
  it("requires the consent tick", () => {
    expect(FeatureConsent.safeParse({ adId: "a1", consent: false }).success).toBe(false);
    expect(FeatureConsent.safeParse({ adId: "a1", consent: true, handle: "@x" }).success).toBe(true);
  });
  it("copy mentions the brand and handle", () => {
    expect(defaultCaption("Acme", "@acme")).toContain("@acme");
    expect(defaultCaption("Acme", null)).toContain("Acme");
    expect(featuredEmailCopy("Acme", "https://instagram.com/p/1").paragraphs[1]).toContain("https://instagram.com/p/1");
  });
});
