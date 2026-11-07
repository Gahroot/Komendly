import { describe, expect, it } from "vitest";
import { churnRate, cohortWeek, computeMrr, grossMargin, percentile, qcPassRate, timeToFirstAdSeconds, trialConversionByCohort } from "../metrics";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("metrics", () => {
  it("percentiles interpolate", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([100, 1, 50], 90)).toBeCloseTo(90);
  });

  it("MRR / ARPU only counts paying statuses", () => {
    const r = computeMrr([
      { adsPlan: "starter", subscriptionStatus: "active" },
      { adsPlan: "growth", subscriptionStatus: "past_due" },
      { adsPlan: "scale", subscriptionStatus: "canceled" },
      { adsPlan: "trial", subscriptionStatus: "none" },
    ]);
    expect(r).toEqual({ mrrCents: 14800, activeSubscribers: 2, arpuCents: 7400 });
  });

  it("churn rate", () => {
    expect(churnRate(40, 2)).toBe(0.05);
    expect(churnRate(0, 0)).toBe(0);
  });

  it("trial conversion by cohort week within 30 days", () => {
    const events = [
      { name: "trial_started", workspaceId: "a", createdAt: d("2026-10-05") },
      { name: "paid_converted", workspaceId: "a", createdAt: d("2026-10-10") },
      { name: "trial_started", workspaceId: "b", createdAt: d("2026-10-06") },
      { name: "paid_converted", workspaceId: "b", createdAt: d("2026-11-20") }, // too late
      { name: "trial_started", workspaceId: "c", createdAt: d("2026-10-14") },
      { name: "trial_started", workspaceId: "c", createdAt: d("2026-10-20") }, // only first counts
    ];
    const r = trialConversionByCohort(events, d("2026-11-06"));
    expect(r.cohorts).toEqual([
      { week: "2026-10-05", trials: 2, converted: 1, rate: 0.5, matured: true },
      { week: "2026-10-12", trials: 1, converted: 0, rate: 0, matured: false },
    ]);
    expect(r.overall).toBeCloseTo(1 / 3);
    expect(cohortWeek(d("2026-11-08"))).toBe("2026-11-02"); // Sunday -> Monday
  });

  it("time to first ad, QC pass rate, margin", () => {
    expect(timeToFirstAdSeconds([
      { confirmedAt: new Date(0), firstAdAt: new Date(90_000) },
      { confirmedAt: null, firstAdAt: new Date(1) },
    ])).toEqual([90]);
    expect(qcPassRate(["ready", "ready", "failed_qc", "rendering"])).toBeCloseTo(2 / 3);
    expect(grossMargin(10000, 30_000_000)).toBeCloseTo(0.7);
    expect(grossMargin(0, 1)).toBeNull();
  });
});
