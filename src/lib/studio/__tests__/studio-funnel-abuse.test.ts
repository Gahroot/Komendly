import { describe, expect, it } from "vitest";
import { isFunnelTestEmail, studioFunnel, type StudioWorkspaceFacts } from "@/lib/ads/funnel";
import { decideStudioFree, IP_TRIAL_CAP, STUDIO_CLAIM_PREFIX, studioClaimHashes } from "@/lib/ads/abuse";
import { studioViewBot } from "@/lib/studio/analytics";

const d = (n: number) => new Date(Date.UTC(2026, 10, n));
const base = (id: string, o: Partial<StudioWorkspaceFacts> = {}): StudioWorkspaceFacts => ({ workspaceId: id, sessionAt: null, messageAt: null, firstRenderAt: null, paywallAt: null, checkoutAt: null, paymentsAt: [], ...o });

describe("studioFunnel", () => {
  it("counts each step and conversion vs previous and start", () => {
    const steps = studioFunnel([
      base("a"),
      base("b", { sessionAt: d(1) }),
      base("c", { sessionAt: d(1), messageAt: d(1), firstRenderAt: d(2), paywallAt: d(3), checkoutAt: d(3), paymentsAt: [d(4)] }),
      base("d", { sessionAt: d(1), messageAt: d(1), firstRenderAt: d(2) }),
    ]);
    expect(steps.map((s) => s.count)).toEqual([4, 3, 2, 2, 1, 1, 1]);
    expect(steps[0]?.fromPrev).toBeNull();
    expect(steps[1]?.fromPrev).toBe(0.75);
    expect(steps[4]?.fromPrev).toBe(0.5);
    expect(steps[6]?.fromStart).toBe(0.25);
  });
  it("paid only counts payments at/after the first render", () => {
    const steps = studioFunnel([base("x", { firstRenderAt: d(5), paymentsAt: [d(1)] }), base("y", { paymentsAt: [d(1)] })]);
    expect(steps.find((s) => s.key === "paid")?.count).toBe(0);
  });
  it("empty input gives null rates", () => {
    expect(studioFunnel([]).every((s) => s.count === 0 && s.fromStart === null)).toBe(true);
  });
  it("flags e2e emails as test", () => {
    expect(isFunnelTestEmail("e2e-studio+1@komendly.com")).toBe(true);
    expect(isFunnelTestEmail("jane@acme.co")).toBe(false);
  });
});

describe("decideStudioFree", () => {
  it("email and device always block", () => {
    expect(decideStudioFree({ email: 1, device: 0, ip30d: 0 })).toEqual({ ok: false, reason: "email_used" });
    expect(decideStudioFree({ email: 0, device: 1, ip30d: 0 })).toEqual({ ok: false, reason: "device_used" });
  });
  it("network: first ok, second ok but shared, cap blocks", () => {
    expect(decideStudioFree({ email: 0, device: 0, ip30d: 0 })).toEqual({ ok: true, sharedNetwork: false });
    expect(decideStudioFree({ email: 0, device: 0, ip30d: IP_TRIAL_CAP - 1 })).toEqual({ ok: true, sharedNetwork: true });
    expect(decideStudioFree({ email: 0, device: 0, ip30d: IP_TRIAL_CAP })).toEqual({ ok: false, reason: "ip_used" });
  });
  it("claim hashes are studio-prefixed and share the /24", () => {
    process.env.ADS_HASH_SALT ??= "test-salt";
    const a = studioClaimHashes("ws1", "Jane.Doe+x@gmail.com", { ip: "203.0.113.7", deviceId: "dev", userAgent: null });
    const b = studioClaimHashes("ws2", "janedoe@gmail.com", { ip: "203.0.113.99", deviceId: null, userAgent: null });
    expect(a.domainHash).toBe(`${STUDIO_CLAIM_PREFIX}ws1`);
    expect(a.emailHash).toBe(b.emailHash);
    expect(a.ipHash).toBe(b.ipHash);
    expect(a.deviceHash?.startsWith(STUDIO_CLAIM_PREFIX)).toBe(true);
    expect(b.deviceHash).toBeNull();
  });
});

describe("studioViewBot", () => {
  it("labels crawlers and Meta review", () => {
    expect(studioViewBot("facebookexternalhit/1.1", false)).toBe("crawler");
    expect(studioViewBot("Mozilla/5.0", true)).toBe("meta_review");
    expect(studioViewBot("Mozilla/5.0", false)).toBeNull();
  });
});
