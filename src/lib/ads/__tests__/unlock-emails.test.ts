import { describe, expect, it } from "vitest";
import { autopilotLaunchState } from "@/lib/ads/autopilot-launch";
import { dueEmail, type LifecycleCandidate } from "@/lib/ads/lifecycle/select";
import { unlockEmail } from "@/lib/ads/lifecycle/unlock-emails";

const D = 86_400_000;
const bought = new Date("2026-12-01T10:00:00Z");
const cand = (o: Partial<LifecycleCandidate> = {}): LifecycleCandidate => ({
  userId: "u1", email: "a@b.co", name: "Sam Roe", workspaceId: "w1", adsSignup: true, signedUpAt: new Date(bought.getTime() - 3 * D), emailVerifiedAt: new Date(bought.getTime() - 3 * D),
  paid: true, subscribed: false, unlockBoughtAt: bought, unsubscribed: false, trialRunId: "r1", trialCompletedAt: new Date(bought.getTime() - 2 * D), readyAdCount: 10, sent: [], ...o,
});
const at = (ms: number) => new Date(bought.getTime() + ms);

describe("unlock buyer sequence", () => {
  it("thanks goes out right away, then day 3 and day 7 (24h cap)", () => {
    expect(dueEmail(cand(), at(60_000))?.kind).toBe("unlock_thanks");
    const sent = [{ kind: "unlock_thanks", runId: null, at: at(5 * 60_000) }];
    expect(dueEmail(cand({ sent }), at(3 * D + 3_600_000))?.kind).toBe("unlock_day3");
    const sent3 = [...sent, { kind: "unlock_day3", runId: null, at: at(3 * D + 3_600_000) }];
    expect(dueEmail(cand({ sent: sent3 }), at(7 * D + 3_600_000))?.kind).toBe("unlock_day7");
  });
  it("stops once they subscribe, unsubscribe or reply", () => {
    expect(dueEmail(cand({ subscribed: true }), at(60_000))).toBeNull();
    expect(dueEmail(cand({ unsubscribed: true }), at(60_000))).toBeNull();
    const sent = [{ kind: "unlock_thanks", runId: null, at: at(60_000) }];
    expect(dueEmail(cand({ replied: true, sent }), at(3 * D + 3_600_000))).toBeNull();
    expect(dueEmail(cand({ subscribed: true, sent }), at(3 * D + 3_600_000))).toBeNull();
  });
  it("sends nothing to non-buyers", () => {
    expect(dueEmail(cand({ unlockBoughtAt: null, paid: false }), at(60_000))?.kind).not.toMatch(/^unlock_/);
  });
});

const base = { firstName: "Sam", brandName: "Acme", packUrl: "https://x/ads/runs/r1", offerUrl: "https://x/ads/runs/r1?offer=autopilot", pricingUrl: "https://x/ads/pricing", unsubscribeUrl: "https://x/u", autopilotOpen: true, diyFirstMonthOpen: false };
describe("unlock email copy", () => {
  it("thanks: how to download, the upsell line with price + guarantee, the question", () => {
    const e = unlockEmail({ ...base, kind: "unlock_thanks" });
    expect(e.text).toContain("Download all");
    expect(e.text).toContain("$97 your first month, then $297/month");
    expect(e.text).toContain("within 7 days of you connecting Meta");
    expect(e.text).toContain("What are you hoping these ads do for Acme?");
    expect(e.text).toContain("Unsubscribe: https://x/u");
  });
  it("never mentions the $97 price once the offer is closed", () => {
    for (const kind of ["unlock_thanks", "unlock_day3"] as const) expect(unlockEmail({ ...base, kind, autopilotOpen: false }).text).not.toContain("$97");
  });
  it("day 7 changes the terms (do it yourself) and promises no results", () => {
    const e = unlockEmail({ ...base, kind: "unlock_day7" });
    expect(e.text).toContain("Ozzy Ad Department");
    expect(e.text).toContain("$197/month");
    expect(e.text).not.toContain("$97");
    for (const k of ["unlock_thanks", "unlock_day3", "unlock_day7"] as const) expect(unlockEmail({ ...base, kind: k }).text).not.toMatch(/guarantee(d)? (leads|sales|results)|get you (leads|sales)/i);
  });
});

describe("autopilot first-month eligibility", () => {
  const fin = new Date("2026-12-01T00:00:00Z");
  it("needs a finished pack, 7 days, one use", () => {
    expect(autopilotLaunchState(null, false, fin).open).toBe(false);
    expect(autopilotLaunchState(fin, false, new Date(fin.getTime() + 6 * D)).open).toBe(true);
    expect(autopilotLaunchState(fin, false, new Date(fin.getTime() + 8 * D)).open).toBe(false);
    expect(autopilotLaunchState(fin, true, new Date(fin.getTime() + D)).open).toBe(false);
  });
  it("a founder extension reopens the window but not a used offer or an unfinished pack", () => {
    const now = new Date(fin.getTime() + 9 * D);
    const until = new Date(now.getTime() + D);
    expect(autopilotLaunchState(fin, false, now, until).open).toBe(true);
    expect(autopilotLaunchState(fin, true, now, until).open).toBe(false);
    expect(autopilotLaunchState(null, false, now, until).open).toBe(false);
  });
});
