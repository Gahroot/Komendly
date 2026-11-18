import { describe, expect, it } from "vitest";
import { isExternalReferrer, isMarkCode, madeWithCtaUrl, markCode, markRedirectUrl, markShortUrl, shouldBrand } from "../viral-branding";

const free = { adsPlan: "trial", subscriptionStatus: "none" };
const paid = { adsPlan: "starter", subscriptionStatus: "active" };
const now = new Date("2026-11-18T12:00:00Z");

describe("viral branding decision", () => {
  it("brands free output, never when the kill switch is off", () => {
    expect(shouldBrand({ systemOn: true, workspace: free, removeBranding: null }, now)).toBe(true);
    expect(shouldBrand({ systemOn: true, workspace: free, removeBranding: true }, now)).toBe(true);
    expect(shouldBrand({ systemOn: false, workspace: free, removeBranding: null }, now)).toBe(false);
  });
  it("paid workspaces get no mark unless they opt to keep it", () => {
    expect(shouldBrand({ systemOn: true, workspace: paid, removeBranding: null }, now)).toBe(false);
    expect(shouldBrand({ systemOn: true, workspace: paid, removeBranding: true }, now)).toBe(false);
    expect(shouldBrand({ systemOn: true, workspace: paid, removeBranding: false }, now)).toBe(true);
    expect(shouldBrand({ systemOn: true, workspace: { ...paid, suspendedAt: now }, removeBranding: null }, now)).toBe(true);
    expect(shouldBrand({ systemOn: true, workspace: { ...free, unlimitedUntil: new Date("2026-11-20") }, removeBranding: null }, now)).toBe(false);
  });
});

describe("viral branding links", () => {
  it("CTA carries made_with attribution", () => {
    const u = new URL(madeWithCtaUrl("studio_share", "tok123"));
    expect(u.origin + u.pathname).toBe("https://www.komendly.com/free-ads");
    expect(u.searchParams.get("utm_source")).toBe("made_with");
    expect(u.searchParams.get("utm_medium")).toBe("acquire");
    expect(u.searchParams.get("utm_campaign")).toBe("studio_share");
    expect(u.searchParams.get("utm_content")).toBe("tok123");
  });
  it("mark codes are short and stable", () => {
    expect(markCode("cmabcdEFGH12345678")).toBe("12345678");
    expect(isMarkCode(markCode("cm3x9q2kz0001abcd"))).toBe(true);
    expect(isMarkCode("../x")).toBe(false);
    expect(markShortUrl("ab12cd34")).toBe("komendly.com/m/ab12cd34");
    expect(new URL(markRedirectUrl("ab12cd34")).searchParams.get("utm_campaign")).toBe("mark");
  });
  it("external referrer", () => {
    expect(isExternalReferrer(null)).toBe(true);
    expect(isExternalReferrer("https://www.facebook.com/")).toBe(true);
    expect(isExternalReferrer("https://www.komendly.com/ads/app")).toBe(false);
  });
});
