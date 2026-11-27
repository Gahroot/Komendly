import { describe, expect, it } from "vitest";
import { evaluateSlo, type AdRow, type RunRow } from "../reliability";

const t0 = new Date("2026-11-20T10:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);
const run = (completedMin: number): RunRow => ({ id: "r1", workspaceId: "w", status: "completed", isTrial: false, kind: "standard", staticCount: 8, createdAt: t0, confirmedAt: t0, firstAdAt: at(2), completedAt: at(completedMin), costMicros: 0, creditsCharged: 0 });
const ads = (n: number, minute: number): AdRow[] => Array.from({ length: n }, (_, i) => ({ runId: "r1", workspaceId: "w", kind: "static", status: "ready", template: null, costMicros: 0, readyAt: at(minute + i * 0.1) }));

describe("SLO time-to-pack", () => {
  it("uses the 8th ready static, not completedAt (motion/bonus ads finish later)", () => {
    const r = evaluateSlo([run(30)], ads(8, 6), { target: 0.97, packMinAds: 8, packWithinMs: 600_000, minSample: 1 });
    expect(r.ok).toBe(1);
    expect(r.slowRuns).toBe(0);
  });
  it("is slow when the 8th static really is late", () => {
    const r = evaluateSlo([run(30)], ads(8, 14), { target: 0.97, packMinAds: 8, packWithinMs: 600_000, minSample: 1 });
    expect(r.slowRuns).toBe(1);
  });
  it("falls back to completedAt when ads carry no timestamps", () => {
    const noStamp = ads(8, 6).map((a) => ({ ...a, readyAt: null }));
    expect(evaluateSlo([run(30)], noStamp, { target: 0.97, packMinAds: 8, packWithinMs: 600_000, minSample: 1 }).slowRuns).toBe(1);
  });
});
