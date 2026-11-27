import { describe, expect, it } from "vitest";
import { isDue, policyMail } from "../src/jobs/sync-google";
import { refreshTokenFromSealed } from "../src/jobs/google-auth";
import { NON_AI_TYPES } from "../src/runner";

const now = new Date("2026-11-27T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3600_000);

describe("google sync", () => {
  it("syncs hourly while live/under review, daily when paused and decided", () => {
    expect(isDue({ serving: "paused", policy: "unknown", metricsAt: null }, now)).toBe(true);
    expect(isDue({ serving: "enabled", policy: "approved", metricsAt: ago(1.1) }, now)).toBe(true);
    expect(isDue({ serving: "paused", policy: "under_review", metricsAt: ago(0.5) }, now)).toBe(false);
    expect(isDue({ serving: "paused", policy: "approved", metricsAt: ago(5) }, now)).toBe(false);
    expect(isDue({ serving: "paused", policy: "approved", metricsAt: ago(25) }, now)).toBe(true);
  });
  it("policy email is plain and promises nothing", () => {
    const m = policyMail({ to: "a@b.c", policy: "disapproved", campaignName: "Komendly Search", issues: ["Your website link didn't load for Google's reviewers."], url: "https://ads.google.com/x" });
    expect(m.subject).toBe("Google didn't approve some of your ads");
    expect(m.text).toContain("didn't load");
    expect(m.text).not.toMatch(/results|leads|ROI|guarantee/i);
    expect(policyMail({ to: "a@b.c", policy: "approved", campaignName: "<x>", issues: [], url: "u" }).html).toContain("&#60;x&#62;");
  });
  it("job types are non-AI and the sealed token parses both shapes", () => {
    for (const t of ["publish_google", "activate_google", "sync_google"]) expect(NON_AI_TYPES).toContain(t);
    expect(refreshTokenFromSealed('{"refreshToken":"r1"}')).toBe("r1");
    expect(refreshTokenFromSealed("r2")).toBe("r2");
  });
});
