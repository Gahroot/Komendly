import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { email: "owner@acme-bakery.com", emailVerifiedAt: null as Date | null },
  ws: { suspendedAt: null as Date | null, trialUsedAt: null as Date | null },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ ...db.user })) },
    adsWorkspace: { findUnique: vi.fn(async () => ({ ...db.ws })) },
    abuseFlag: { create: vi.fn(async () => ({})) },
    adsTrialClaim: { findFirst: vi.fn(async () => null), count: vi.fn(async () => 0) },
  },
}));

const { checkTrialEligibility } = await import("../abuse");
const { downloadNeedsVerifiedEmail, DOWNLOAD_GATE_MESSAGE } = await import("../download-gate");
const { assertCanDownload } = await import("../download-gate-server");
const { AdsHttpError } = await import("../workspace");
const { freelancerValueLine } = await import("../offer-value");

const fp = { ip: null, deviceId: null, userAgent: null } as unknown as Parameters<typeof checkTrialEligibility>[3];
const trialWs = { adsPlan: "trial", subscriptionStatus: "none", suspendedAt: null } as unknown as Parameters<typeof assertCanDownload>[1];
const paidWs = { adsPlan: "starter", subscriptionStatus: "active", suspendedAt: null } as unknown as Parameters<typeof assertCanDownload>[1];

describe("trial eligibility no longer needs a verified email", () => {
  beforeEach(() => {
    db.user = { email: "owner@acme-bakery.com", emailVerifiedAt: null };
    db.ws = { suspendedAt: null, trialUsedAt: null };
  });

  it("never returns email_unverified; later checks still run", async () => {
    const r = await checkTrialEligibility("u", "w", "http://127.0.0.1/", fp);
    expect(r).toEqual({ ok: false, reason: "blocked_url" });
  });

  it("keeps the other checks for unverified users", async () => {
    db.ws.trialUsedAt = new Date();
    expect(await checkTrialEligibility("u", "w", "https://acme-bakery.com", fp)).toEqual({ ok: false, reason: "trial_used" });
    db.user.email = "x@mailinator.com";
    expect(await checkTrialEligibility("u", "w", "https://acme-bakery.com", fp)).toEqual({ ok: false, reason: "disposable_email" });
  });
});

describe("download gate", () => {
  it("never blocks downloads on email confirmation (unconfirmed sign-ups must still get their free ads)", () => {
    for (const isTrial of [true, false]) for (const isPaid of [true, false]) for (const emailVerified of [true, false]) {
      expect(downloadNeedsVerifiedEmail({ isTrial, isPaid, emailVerified })).toBe(false);
    }
    expect(() => assertCanDownload({ emailVerifiedAt: null }, trialWs, { isTrial: true })).not.toThrow();
    expect(() => assertCanDownload({ emailVerifiedAt: null }, paidWs, { isTrial: true })).not.toThrow();
    expect(typeof DOWNLOAD_GATE_MESSAGE).toBe("string");
    expect(AdsHttpError).toBeTypeOf("function");
  });
});

describe("freelancer value line", () => {
  it("anchors on ready ads, rounded down, only from 3 ads", () => {
    expect(freelancerValueLine({ static: 2, motion: 0 })).toBeNull();
    expect(freelancerValueLine({ static: 3, motion: 0 })).toBe("A freelancer would charge about $100 for these 3 ads.");
    expect(freelancerValueLine({ static: 10, motion: 1 })).toBe("A freelancer would charge about $500 for these 11 ads.");
    expect(freelancerValueLine({ static: 20, motion: 1 })).toBe("A freelancer would charge about $850 for these 21 ads.");
  });
});
