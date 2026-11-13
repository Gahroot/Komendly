import { describe, expect, it } from "vitest";
import { claimGiftPath, isKlyClaimToken, KLY_COOKIE, KLY_COOKIE_MAX_AGE, klyCookieOptions, klySignupUpdate } from "../claim";

describe("kly claim cookie", () => {
  it("is httpOnly, lax, 90 days", () => {
    expect(KLY_COOKIE).toBe("kmd_kly");
    expect(klyCookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: KLY_COOKIE_MAX_AGE });
    expect(KLY_COOKIE_MAX_AGE).toBe(90 * 86_400);
  });
  it("validates tokens", () => {
    expect(isKlyClaimToken("abcdefghijklmnopqrstuv")).toBe(true);
    expect(isKlyClaimToken("short")).toBe(false);
    expect(isKlyClaimToken("abcdefghijklmnopqrst; x=1")).toBe(false);
    expect(isKlyClaimToken(undefined)).toBe(false);
  });
  it("adds utm_content=claimToken to the gift path", () => {
    const u = new URL(claimGiftPath("GIFTTOKEN1234567", "roofers", "claimtoken_abcdefghij12"), "https://x.test");
    expect(u.pathname).toBe("/gift/GIFTTOKEN1234567");
    expect(Object.fromEntries(u.searchParams)).toEqual({ utm_source: "outbound", utm_medium: "email", utm_campaign: "roofers", utm_content: "claimtoken_abcdefghij12" });
  });
});

describe("klySignupUpdate", () => {
  const now = new Date("2026-11-11T00:00:00Z");
  const link = { userId: "u1", workspaceId: "w1", now };
  it("links and promotes to signed_up", () => {
    expect(klySignupUpdate({ status: "clicked", userId: null }, link)).toEqual({ userId: "u1", workspaceId: "w1", signedUpAt: now, status: "signed_up" });
  });
  it("never downgrades a paid lead", () => {
    expect(klySignupUpdate({ status: "paid", userId: null }, link)).toEqual({ userId: "u1", workspaceId: "w1", signedUpAt: now });
  });
  it("does not relink a lead claimed by another account", () => {
    expect(klySignupUpdate({ status: "signed_up", userId: "other" }, link)).toBeNull();
  });
});

import { sameInbox } from "../claim";
describe("sameInbox", () => {
  it("matches the emailed address case-insensitively, never empty", () => {
    expect(sameInbox("Info@Acme.com", " info@acme.com ")).toBe(true);
    expect(sameInbox("info@acme.com", "owner@acme.com")).toBe(false);
    expect(sameInbox(null, "a@b.co")).toBe(false);
    expect(sameInbox("", "")).toBe(false);
  });
});
