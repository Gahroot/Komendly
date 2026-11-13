import { describe, expect, it } from "vitest";
import { dueEmail, isTestEmail, nextEmail, refreshedPackAllowed, type LifecycleCandidate } from "../lifecycle/select";
import { checkCopy, fallbackCopy, type CopyContext } from "../lifecycle/copy";
import { founderFrom, founderNote } from "../lifecycle/founder";
import { signEmailToken, verifyEmailToken } from "../lifecycle/tokens";
import { renderLifecycleHtml, renderLifecycleText } from "../lifecycle/template";

const H = 3_600_000;
const T0 = new Date("2026-11-01T00:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * H);

function cand(over: Partial<LifecycleCandidate> = {}): LifecycleCandidate {
  return {
    userId: "u1", email: "jane@yahoo.com", name: "Jane", workspaceId: "w1", adsSignup: true,
    signedUpAt: at(-2), emailVerifiedAt: at(-1.5), paid: false, unsubscribed: false,
    trialRunId: "r1", trialCompletedAt: T0, readyAdCount: 11, sent: [], ...over,
  };
}

describe("dueEmail", () => {
  it("walks the trial sequence by the 72h window", () => {
    expect(dueEmail(cand(), at(0.1))?.kind).toBe("ads_ready");
    expect(dueEmail(cand(), at(12))).toBeNull();
    expect(dueEmail(cand(), at(25))?.kind).toBe("how_to_run");
    expect(dueEmail(cand(), at(49))?.kind).toBe("offer_24h");
    expect(dueEmail(cand(), at(70.5))?.kind).toBe("last_chance");
    expect(dueEmail(cand(), at(72))).toBeNull();
    expect(dueEmail(cand(), at(24 * 7 + 1))?.kind).toBe("day7_downsell");
    expect(dueEmail(cand(), at(24 * 8 + 1))).toBeNull();
  });

  it("never sends twice and respects the gap (except the real deadline)", () => {
    expect(dueEmail(cand({ sent: [{ kind: "ads_ready", runId: null, at: at(0) }, { kind: "founder_note", runId: null, at: at(0.2) }] }), at(1))).toBeNull();
    expect(dueEmail(cand({ sent: [{ kind: "offer_24h", runId: null, at: at(49) }] }), at(51))).toBeNull();
    expect(dueEmail(cand({ sent: [{ kind: "how_to_run", runId: null, at: at(46) }] }), at(49))).toBeNull();
    expect(dueEmail(cand({ sent: [{ kind: "offer_24h", runId: null, at: at(67) }] }), at(70.5))?.kind).toBe("last_chance");
  });

  it("suppresses paid, unsubscribed and e2e users", () => {
    expect(dueEmail(cand({ paid: true }), at(0.1))).toBeNull();
    expect(dueEmail(cand({ unsubscribed: true }), at(0.1))).toBeNull();
    expect(dueEmail(cand({ email: "e2e-adrdy+x1@komendly.com" }), at(0.1))).toBeNull();
    expect(isTestEmail("E2E-ADRDY+abc@komendly.com")).toBe(true);
    expect(isTestEmail("someone@gmail.com", "")).toBe(false);
  });

  it("nudges unverified /ads sign-ups after 1h, then once more at 24h", () => {
    const c = cand({ signedUpAt: T0, emailVerifiedAt: null, trialRunId: null, trialCompletedAt: null, readyAdCount: 0 });
    expect(dueEmail(c, at(0.5))).toBeNull();
    expect(dueEmail(c, at(1.2))?.kind).toBe("verify_nudge");
    expect(dueEmail(c, at(25))?.kind).toBe("verify_nudge_2");
    expect(dueEmail(c, at(73))).toBeNull();
    expect(dueEmail({ ...c, adsSignup: false }, at(1.2))).toBeNull();
    expect(nextEmail(c, at(0.5))?.kind).toBe("verify_nudge");
  });

  it("skips ads_ready when no ad is ready", () => {
    expect(dueEmail(cand({ readyAdCount: 0 }), at(0.1))).toBeNull();
  });

  it("allows refreshed_pack once per run", () => {
    expect(refreshedPackAllowed(cand(), "r2")).toBe(true);
    expect(refreshedPackAllowed(cand({ sent: [{ kind: "refreshed_pack", runId: "r2", at: at(1) }] }), "r2")).toBe(false);
    expect(refreshedPackAllowed(cand({ paid: true }), "r2")).toBe(false);
  });
});

describe("copy", () => {
  const ctx: CopyContext = { kind: "last_chance", firstName: "Jane", brandName: "Acme", offer: null, audience: null, pains: [], headlines: [], readyAdCount: 11, offerExpiresAt: at(72) };
  it("fallbacks pass the validator for every kind", () => {
    for (const kind of ["verify_nudge", "ads_ready", "how_to_run", "offer_24h", "last_chance", "day7_downsell", "refreshed_pack"] as const) {
      const c = { ...ctx, kind, code: "123456" };
      expect(checkCopy(fallbackCopy(c, at(70)), c), kind).toBeNull();
    }
  });
  it("rejects invented prices, discounts, links and long subjects", () => {
    const ok = fallbackCopy(ctx, at(70));
    expect(checkCopy({ ...ok, paragraphs: ["Only $99 today"] }, ctx)).toMatch(/price/);
    expect(checkCopy({ ...ok, paragraphs: ["Get 50% off"] }, ctx)).toMatch(/discount/);
    expect(checkCopy({ ...ok, paragraphs: ["go to https://x.com"] }, ctx)).toMatch(/link/);
    expect(checkCopy({ ...ok, subject: "x".repeat(51) }, ctx)).toMatch(/subject/);
    expect(checkCopy({ ...ok, paragraphs: ["The launch offer is $97 for your first month"] }, { ...ctx, kind: "day7_downsell" })).toMatch(/closed/);
  });
});

describe("email tokens + template", () => {
  it("signs and verifies, rejects tampering and expiry", () => {
    const t = signEmailToken({ p: "img", a: "asset1", e: Math.floor(at(10).getTime() / 1000) }, "s3cret");
    expect(verifyEmailToken(t, "s3cret", at(1))).toEqual({ p: "img", a: "asset1", e: Math.floor(at(10).getTime() / 1000) });
    expect(verifyEmailToken(t, "s3cret", at(11))).toBeNull();
    expect(verifyEmailToken(t, "other", at(1))).toBeNull();
    expect(verifyEmailToken(`${t}x`, "s3cret", at(1))).toBeNull();
    const u = signEmailToken({ p: "unsub", u: "u1" }, "s3cret");
    expect(verifyEmailToken(u, "s3cret")).toEqual({ p: "unsub", u: "u1" });
  });
  it("renders escaped html and a text part with unsubscribe", () => {
    const input = { appUrl: "https://www.komendly.com", subject: "Hi <b>", preheader: "p", paragraphs: ["a & b"], cta: { label: "Go", href: "https://www.komendly.com/ads/runs/r1" }, code: "123456", thumbnails: [{ src: "https://x/i.png", alt: "ad" }], unsubscribeUrl: "https://www.komendly.com/api/ads/email-unsubscribe?t=abc" };
    const html = renderLifecycleHtml(input);
    expect(html).toContain("Hi &#60;b&#62;");
    expect(html).toContain("123456");
    expect(html).toContain("https://x/i.png");
    expect(renderLifecycleText(input)).toContain("Unsubscribe: https://www.komendly.com/api/ads/email-unsubscribe?t=abc");
  });
});

describe("internal addresses", () => {
  it("never emails our own domain, test sinks or excluded owner emails", async () => {
    const { isTestEmail } = await import("../lifecycle/select");
    expect(isTestEmail("e2e+hype1@komendly.com", "")).toBe(true);
    expect(isTestEmail("delivered+x@resend.dev", "")).toBe(true);
    expect(isTestEmail("Owner@Gmail.com", "owner@gmail.com, sold@x.com")).toBe(true);
    expect(isTestEmail("jo@yahoo.com", "owner@gmail.com")).toBe(false);
  });
});

describe("stuck before the free ads", () => {
  const fresh = (over: Partial<LifecycleCandidate> = {}) =>
    cand({ signedUpAt: T0, emailVerifiedAt: null, trialRunId: null, trialCompletedAt: null, readyAdCount: 0, startedRun: false, ...over });

  it("unverified: code reminder at 1h, a second one at 24h, then stops", () => {
    expect(dueEmail(fresh(), at(1.5))?.kind).toBe("verify_nudge");
    const sent = [{ kind: "verify_nudge", runId: null, at: at(1.5) }];
    expect(dueEmail(fresh({ sent }), at(20))).toBeNull();
    expect(dueEmail(fresh({ sent }), at(25))?.kind).toBe("verify_nudge_2");
    expect(dueEmail(fresh({ sent: [...sent, { kind: "verify_nudge_2", runId: null, at: at(25) }] }), at(60))).toBeNull();
    expect(dueEmail(fresh({ sent }), at(73))).toBeNull();
  });

  it("verified, never started: 1h, 1d, 3d from verification", () => {
    const v = fresh({ emailVerifiedAt: at(2) });
    expect(dueEmail(v, at(2.5))).toBeNull();
    expect(dueEmail(v, at(3.5))?.kind).toBe("start_nudge_1h");
    const s1 = [{ kind: "start_nudge_1h", runId: null, at: at(3.5) }];
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), sent: s1 }), at(27))).toBeNull(); // 24h cap across all lifecycle email
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), sent: s1 }), at(27.5))?.kind).toBe("start_nudge_1d");
    const s2 = [...s1, { kind: "start_nudge_1d", runId: null, at: at(27) }];
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), sent: s2 }), at(60))).toBeNull();
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), sent: s2 }), at(75))?.kind).toBe("start_nudge_3d");
  });

  it("no start nudge once a run started, the trial was refused, they paid, or it's a test user", () => {
    const at4 = at(4);
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), startedRun: true }), at4)).toBeNull();
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), trialBlocked: true }), at4)).toBeNull();
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), paid: true }), at4)).toBeNull();
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), email: "e2e+x@komendly.com" }), at4)).toBeNull();
    expect(dueEmail(fresh({ emailVerifiedAt: at(2), adsSignup: false }), at4)).toBeNull();
  });

  it("fallback copy for the new kinds passes the checks and makes no price claims", () => {
    for (const kind of ["verify_nudge_2", "start_nudge_1h", "start_nudge_1d", "start_nudge_3d"] as const) {
      const ctx: CopyContext = { kind, firstName: null, brandName: null, offer: null, audience: null, pains: [], headlines: [], readyAdCount: 0, offerExpiresAt: null, code: "123456" };
      const c = fallbackCopy(ctx);
      expect(checkCopy(c, ctx)).toBeNull();
      expect(c.paragraphs.join(" ")).not.toMatch(/\$/);
    }
  });
});

describe("best-ad emails", () => {
  it("ranks ready statics by QC, then run order, dropping replaced/motion/imageless", async () => {
    const { rankAdsForEmail } = await import("../lifecycle/select");
    const ad = (index: number, qcReport: unknown, o: Partial<{ kind: string; qcAttempts: number; hasImage: boolean }> = {}) => ({ index, kind: "static", qcAttempts: 1, hasImage: true, qcReport, ...o });
    const ranked = rankAdsForEmail([
      ad(0, { pass: false, checks: [] }),
      ad(1, { pass: true, checks: [{ pass: false }] }),
      ad(2, { pass: true, checks: [{ pass: true }] }, { qcAttempts: 2 }),
      ad(3, { pass: true, checks: [] }),
      ad(4, { pass: true, replacedBy: "x" }),
      ad(5, null, { kind: "motion" }),
      ad(6, null, { hasImage: false }),
    ]);
    expect(ranked.map((a) => a.index)).toEqual([3, 2, 1, 0]);
  });
  it("subjects name the brand and stay short; day7 never mentions the Launch Quarter", () => {
    for (const kind of ["ads_ready", "how_to_run", "offer_24h", "last_chance", "day7_downsell"] as const) {
      for (const [brandName, hasLockedBonus] of [["Acme", true], ["A Very Long Brand Name For Testing Purposes Inc", false]] as const) {
        const ctx: CopyContext = { kind, hasLockedBonus, firstName: "Jane", brandName, offer: null, audience: null, pains: [], headlines: [], readyAdCount: 11, offerExpiresAt: at(72) };
        const c = fallbackCopy(ctx, at(48));
        expect(c.subject.length, `${kind} ${c.subject}`).toBeLessThanOrEqual(50);
        expect(checkCopy(c, ctx), kind).toBeNull();
        if (brandName === "Acme") expect(c.subject).toContain("Acme");
      }
    }
  });
  it("renders a top hero before the headline", () => {
    const html = renderLifecycleHtml({ appUrl: "https://x", subject: "S", preheader: "p", paragraphs: ["a"], cta: { label: "Go", href: "https://x/a" }, hero: { src: "https://x/i.png", alt: "Best", href: "https://x/a", caption: "Best", locked: false, position: "top" }, unsubscribeUrl: "https://x/u" });
    expect(html.indexOf("https://x/i.png")).toBeLessThan(html.indexOf("<h1"));
  });
});

describe("launch offer window + day7 offer", () => {
  it("offer emails follow offerReadyAt (3rd ready ad), not run completion", async () => {
    const { offerWindowStart } = await import("../lifecycle/select");
    expect(offerWindowStart({ offerReadyAt: at(-2), trialCompletedAt: at(0) })).toEqual(at(-2));
    expect(offerWindowStart({ offerReadyAt: null, trialCompletedAt: at(0) })).toEqual(at(0));
    expect(offerWindowStart({ trialCompletedAt: at(0) })).toEqual(at(0));
  });
  it("day7 pitches the $9 unlock only with locked bonus ads, else the 10-credit pack", () => {
    const base: CopyContext = { kind: "day7_downsell", firstName: null, brandName: "Acme", offer: null, audience: null, pains: [], headlines: [], readyAdCount: 11, offerExpiresAt: null };
    const withLocked = fallbackCopy({ ...base, hasLockedBonus: true });
    const without = fallbackCopy({ ...base, hasLockedBonus: false });
    expect(withLocked.ctaLabel).toContain("$9");
    expect(without.ctaLabel).toContain("$29");
    expect([...without.paragraphs, without.subject].join(" ")).not.toContain("$9");
    expect(checkCopy(withLocked, { ...base, hasLockedBonus: true })).toBeNull();
    expect(checkCopy(without, base)).toBeNull();
  });
});

describe("founder_note", () => {
  const ready = (h: number) => ({ kind: "ads_ready", runId: "r1", at: at(h) });
  it("goes out >= 10 min after ads_ready actually sent, never before it", () => {
    expect(dueEmail(cand(), at(0.1))?.kind).toBe("ads_ready");
    expect(dueEmail(cand({ sent: [ready(0.1)] }), at(0.2))).toBeNull();
    expect(dueEmail(cand({ sent: [ready(0.1)] }), at(0.1 + 10 / 60))?.kind).toBe("founder_note");
    expect(dueEmail(cand({ sent: [ready(0.1)] }), at(0.1 + 21))).toBeNull();
  });
  it("only once per user", () => {
    expect(dueEmail(cand({ sent: [ready(0), { kind: "founder_note", runId: "r1", at: at(0.2) }] }), at(1))).toBeNull();
  });
  it("is suppressed for paid, unsubscribed and test users", () => {
    for (const o of [{ paid: true }, { unsubscribed: true }, { email: "e2e-x@gmail.com" }]) expect(dueEmail(cand({ ...o, sent: [ready(0)] }), at(1))).toBeNull();
  });
  it("waits (not skipped) when another email went out recently", () => {
    const sent = [{ kind: "start_nudge_1h", runId: null, at: at(-1) }, ready(0)];
    expect(dueEmail(cand({ sent }), at(0.5))).toBeNull();
    expect(dueEmail(cand({ sent }), at(1.1))?.kind).toBe("founder_note");
  });
  it("renders plain text with no tracked links", () => {
    const n = founderNote({ firstName: "Jane", brandName: "Bloom Bakery", readyAdCount: 11, runUrl: "https://www.komendly.com/ads/runs/r1", unsubscribeUrl: "https://www.komendly.com/api/ads/email-unsubscribe?t=x" });
    expect(n.subject).toBe("your Bloom Bakery ads");
    expect(n.text).toContain("Hi Jane,");
    expect(n.text).toContain("11 ads for Bloom Bakery");
    expect(n.text).not.toMatch(/utm_|email-click|email-img|<[a-z]/i);
    expect(n.text).toContain("email-unsubscribe");
    expect(founderFrom(undefined)).toBe("Nolan from Komendly <nolan@komendly.com>");
  });
});
