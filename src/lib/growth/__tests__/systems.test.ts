import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEMS, getSystem, nextBeat, parseBeat, systemForTouch, systemHealth, withSystemUtm } from "../systems";

const now = new Date("2026-11-18T12:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3_600_000).toISOString();
const sys = getSystem("checkout_recovery")!;

describe("growth systems registry", () => {
  it("has unique keys and utm sources", () => {
    expect(new Set(GROWTH_SYSTEMS.map((s) => s.key)).size).toBe(GROWTH_SYSTEMS.length);
    expect(new Set(GROWTH_SYSTEMS.map((s) => s.utmSource)).size).toBe(GROWTH_SYSTEMS.length);
  });
  it("traces a first touch to its system", () => {
    expect(systemForTouch({ utm_source: "Free_Tool" })).toBe("free_tools");
    expect(systemForTouch({ utm_source: "facebook" })).toBeNull();
    expect(systemForTouch(null)).toBeNull();
  });
  it("tags links without overwriting an existing source", () => {
    const u = new URL(withSystemUtm("https://www.komendly.com/pricing?x=1", "checkout_recovery", { campaign: "step1" }));
    expect(u.searchParams.get("utm_source")).toBe("recovery");
    expect(u.searchParams.get("utm_campaign")).toBe("step1");
    expect(u.searchParams.get("x")).toBe("1");
    expect(new URL(withSystemUtm("https://a.com/?utm_source=keep", "winback")).searchParams.get("utm_source")).toBe("keep");
  });
  it("derives health", () => {
    const b = (p: Partial<ReturnType<typeof parseBeat>>) => ({ ...parseBeat({}), ...p });
    expect(systemHealth(sys, false, null, now)).toBe("off");
    expect(systemHealth(sys, true, null, now)).toBe("never_ran");
    expect(systemHealth(sys, true, b({ firstRunAt: h(1), lastRunAt: h(0.1), lastOkAt: h(0.1) }), now)).toBe("healthy");
    expect(systemHealth(sys, true, b({ firstRunAt: h(1), lastRunAt: h(0.1), lastOkAt: h(0.5), lastError: "boom" }), now)).toBe("failing");
    expect(systemHealth(sys, true, b({ firstRunAt: h(10), lastRunAt: h(2), lastOkAt: h(2) }), now)).toBe("stalled");
    expect(systemHealth(sys, true, b({ firstRunAt: h(24 * 8), lastRunAt: h(0.1), lastOkAt: h(0.1) }), now)).toBe("silent");
    expect(systemHealth(sys, true, b({ firstRunAt: h(24 * 8), lastRunAt: h(0.1), lastOkAt: h(0.1), lastOutputAt: h(5) }), now)).toBe("healthy");
  });
  it("accumulates beats", () => {
    const a = nextBeat(parseBeat({}), { ok: true, outputs: 2 }, now);
    const b = nextBeat(a, { ok: false, error: "x" }, now);
    expect([b.runs, b.outputs, b.firstRunAt, b.lastError, b.lastOutputAt]).toEqual([2, 2, now.toISOString(), "x", now.toISOString()]);
  });
});
