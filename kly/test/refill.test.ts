import { describe, expect, it } from "vitest";
import { fakeDb } from "./fakes";
import { lowNiches, refillCycle, refillDue, REFILL_EVENT, REFILL_THRESHOLD } from "../src/refill";

const now = new Date("2026-11-26T12:00:00Z");

describe("kly refill", () => {
  it("flags niches under the threshold, lowest first", () => {
    const low = lowNiches([{ niche: "roofers", unusedPlaces: 500, verifiedLeads: 10 }, { niche: "hvac", unusedPlaces: 20, verifiedLeads: 5 }, { niche: "plumbers", unusedPlaces: 100, verifiedLeads: 0 }]);
    expect(low.map((n) => n.niche)).toEqual(["hvac", "plumbers"]);
  });
  it("is due weekly", () => {
    expect(refillDue(null, now)).toBe(true);
    expect(refillDue(new Date(now.getTime() - 3 * 86_400_000).toISOString(), now)).toBe(false);
    expect(refillDue(new Date(now.getTime() - 8 * 86_400_000).toISOString(), now)).toBe(true);
  });
  it("does nothing while the flag is off", async () => {
    const f = fakeDb();
    expect(await refillCycle(f.db, now)).toBeNull();
    expect(f.of("adsEvent", "create")).toHaveLength(0);
  });
  it("writes an alert event when stock is low", async () => {
    const f = fakeDb({ adsFeatureFlag: { findUnique: () => ({ enabled: true }) }, klyPlace: { count: () => 3 }, outboundLead: { count: () => 2 } });
    const low = await refillCycle(f.db, now);
    expect(low?.length).toBeGreaterThan(0);
    const ev = f.of("adsEvent", "create")[0] as { data: { name: string; props: { threshold: number } } };
    expect(ev.data.name).toBe(REFILL_EVENT);
    expect(ev.data.props.threshold).toBe(REFILL_THRESHOLD);
  });
  it("stays quiet when stock is healthy", async () => {
    const f = fakeDb({ adsFeatureFlag: { findUnique: () => ({ enabled: true }) }, klyPlace: { count: () => 400 }, outboundLead: { count: () => 0 } });
    expect(await refillCycle(f.db, now)).toEqual([]);
    expect(f.of("adsEvent", "create")).toHaveLength(0);
  });
});
