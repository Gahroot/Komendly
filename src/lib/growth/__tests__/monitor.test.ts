import { describe, expect, it } from "vitest";
import { getSystem, type SystemBeat } from "@/lib/growth/systems";
import { alertEmail, decideProviderAlert, decideSystemAlert, monitorHealth, providerProblem } from "@/lib/growth/monitor";

const sys = getSystem("checkout_recovery")!;
const now = new Date("2026-11-18T12:00:00Z");
const beat = (p: Partial<SystemBeat>): SystemBeat => ({ firstRunAt: "2026-11-18T11:00:00Z", lastRunAt: "2026-11-18T11:55:00Z", lastOkAt: "2026-11-18T11:55:00Z", lastOutputAt: "2026-11-18T11:55:00Z", runs: 5, outputs: 3, lastError: null, alertedAt: null, alertReason: null, ...p });

describe("decideSystemAlert", () => {
  it("alerts once per incident", () => {
    const failing = beat({ lastOkAt: "2026-11-18T11:00:00Z", lastError: "boom" });
    expect(decideSystemAlert(sys, true, failing, now).decision).toEqual({ action: "alert", reason: "failing: boom" });
    expect(decideSystemAlert(sys, true, { ...failing, alertedAt: "x", alertReason: "failing: boom" }, now).decision.action).toBe("none");
  });
  it("re-alerts when the incident kind changes, alerts stalled", () => {
    const stalled = beat({ lastRunAt: "2026-11-18T10:00:00Z", lastOkAt: "2026-11-18T10:00:00Z", alertedAt: "x", alertReason: "failing: boom" });
    expect(decideSystemAlert(sys, true, stalled, now).decision.action).toBe("alert");
  });
  it("recovers when healthy, clears when off, ignores never_ran", () => {
    expect(decideSystemAlert(sys, true, beat({ alertedAt: "x", alertReason: "stalled: ..." }), now).decision).toEqual({ action: "recover", reason: "stalled: ..." });
    expect(decideSystemAlert(sys, false, beat({ alertedAt: "x" }), now).decision.action).toBe("clear");
    expect(decideSystemAlert(sys, true, null, now).decision.action).toBe("none");
    expect(decideSystemAlert(sys, true, beat({}), now).decision.action).toBe("none");
  });
});

describe("provider + monitor", () => {
  it("flags missing, stale and not-ok Codex", () => {
    expect(providerProblem(null, now)).toMatch(/no provider/);
    expect(providerProblem({ ok: true, message: null, updatedAt: new Date("2026-11-18T11:00:00Z") }, now)).toMatch(/stale/);
    expect(providerProblem({ ok: false, message: "login expired", updatedAt: now }, now)).toMatch(/login expired/);
    expect(providerProblem({ ok: true, message: null, updatedAt: now }, now)).toBeNull();
    expect(decideProviderAlert("x", null).action).toBe("alert");
    expect(decideProviderAlert("x", "t").action).toBe("none");
    expect(decideProviderAlert(null, "t").action).toBe("recover");
  });
  it("monitor health + emails", () => {
    expect(monitorHealth(null, now)).toBe("never_ran");
    expect(monitorHealth({ lastRunAt: "2026-11-18T11:55:00Z", runs: 1, alertsSent: 0, lastAlertAt: null, lastError: null, codexAlertedAt: null, codexAlertReason: null }, now)).toBe("healthy");
    expect(alertEmail("Free tools", { action: "alert", reason: "stalled" }, "u")?.subject).toBe("[Komendly] SYSTEM DOWN: Free tools");
    expect(alertEmail("x", { action: "none" }, "u")).toBeNull();
  });
});
