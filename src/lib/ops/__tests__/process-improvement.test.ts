import { describe, expect, it } from "vitest";
import { analyseProcess } from "../qa/process-improvement";
import { recordOwnerIntervention } from "../qa/owner-intervention";

const now = new Date("2026-11-26T00:00:00Z");
const d = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("analyseProcess", () => {
  it("ranks by recurrence x impact and ignores one-offs", () => {
    const a = analyseProcess({
      now,
      incidents: [
        { key: "funnel:/pricing", type: "funnel", severity: "P1", detectedAt: d(3), resolvedAt: d(3) },
        { key: "funnel:/pricing", type: "funnel", severity: "P1", detectedAt: d(10), resolvedAt: d(10) },
        { key: "heartbeat:kly", type: "heartbeat", severity: "P3", detectedAt: d(2), resolvedAt: null },
        { key: "heartbeat:kly", type: "heartbeat", severity: "P3", detectedAt: d(4), resolvedAt: null },
        { key: "heartbeat:kly", type: "heartbeat", severity: "P3", detectedAt: d(6), resolvedAt: null },
        { key: "once", type: "system", severity: "P1", detectedAt: d(1), resolvedAt: null },
      ],
      interventions: [],
    });
    expect(a.findings.map((f) => f.key)).toEqual(["incident:funnel:/pricing", "incident:heartbeat:kly"]);
    expect(a.findings[0]).toMatchObject({ recurrence: 2, impact: 10, score: 20 });
    expect(a.findings[0]?.proposedFix).toMatch(/smoke/);
  });
  it("turns repeated manual interventions and clusters into findings", () => {
    const a = analyseProcess({ now, incidents: [], interventions: [{ kind: "rerun_ad_job", note: "x", at: d(1) }, { kind: "rerun_ad_job", note: "y", at: d(2) }], supportClusters: [{ key: "refund", count: 3 }], reruns: [{ key: "render", count: 1 }] });
    expect(a.findings.map((f) => f.area)).toEqual(["intervention", "support"]);
  });
  it("measures outcomes and compares with the previous window", () => {
    const a = analyseProcess({
      now,
      incidents: [
        { key: "a", type: "t", severity: "P2", detectedAt: d(40), resolvedAt: d(40 - 1 / 24), startedAt: d(40.1) },
        { key: "a", type: "t", severity: "P2", detectedAt: d(35), resolvedAt: d(35 - 2 / 24) },
        { key: "b", type: "t", severity: "P2", detectedAt: d(5), resolvedAt: d(5 - 1 / 24) },
      ],
      interventions: [{ kind: "k", note: "", at: d(45) }, { kind: "k", note: "", at: d(44) }, { kind: "k", note: "", at: d(3) }],
    });
    expect(a.previous.recurrenceRate).toBe(1);
    expect(a.current.recurrenceRate).toBe(0);
    expect(a.current.meanTimeToResolveMin).toBe(60);
    expect(a.previous.meanTimeToDetectMin).toBeGreaterThan(0);
    expect(a.current.interventionsPerWeek).toBe(0.2);
    expect(a.verdict).toBe("improving");
  });
  it("says so when there is no baseline", () => {
    expect(analyseProcess({ now, incidents: [], interventions: [] }).verdict).toBe("insufficient_data");
  });
});

describe("recordOwnerIntervention", () => {
  it("writes a sanitised owner_intervention event and never throws", async () => {
    const rows: unknown[] = [];
    await recordOwnerIntervention({ adsEvent: { create: async (a) => rows.push(a) } }, "Rerun Ad Job!", "fixed pack for bob@example.com");
    expect(rows[0]).toEqual({ data: { name: "owner_intervention", props: { kind: "rerun_ad_job_", note: "fixed pack for [email]" } } });
    await expect(recordOwnerIntervention({ adsEvent: { create: async () => { throw new Error("db"); } } }, "x", "y")).resolves.toBeUndefined();
  });
});
