import { describe, expect, it } from "vitest";
import { admit, buildRequestProps, isStale, maxPerHour, parseRequestProps, pollDelay, RESULT_EVENT } from "../core";
import { gatewayText, type GatewayDb } from "../client";

function fakeDb(o: { on: boolean; answer?: (id: string) => object | null }) {
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];
  const db: GatewayDb = {
    adsFeatureFlag: { findUnique: async () => ({ enabled: o.on }) },
    adsEvent: {
      create: async ({ data }) => { events.push({ name: data.name, props: data.props as Record<string, unknown> }); return { id: "e" }; },
      findFirst: async (a) => {
        const id = (a.where.props as { equals: string }).equals;
        const ans = o.answer?.(id);
        return ans ? { props: ans } : null;
      },
    },
  };
  return { db, events };
}
const clock = () => { let t = 0; return { now: () => t, sleep: async (ms: number) => { t += ms; } }; };

describe("ai gateway core", () => {
  it("builds + parses a request, rejects junk", () => {
    const p = buildRequestProps({ system: "s", prompt: "p", jsonSchema: { type: "object" } }, { id: "ai_1", purpose: "x", requester: "web" });
    expect(p.model).toBeNull();
    expect(parseRequestProps(p)?.schema).toEqual({ type: "object" });
    expect(parseRequestProps({ id: "", prompt: "p", system: "s" })).toBeNull();
    expect(parseRequestProps({ id: "a", prompt: "x".repeat(70_000), system: "s" })).toBeNull();
  });
  it("stale after 5 minutes", () => {
    const now = new Date("2026-01-01T00:10:00Z");
    expect(isStale(new Date("2026-01-01T00:04:00Z"), now)).toBe(true);
    expect(isStale(new Date("2026-01-01T00:06:00Z"), now)).toBe(false);
  });
  it("admission: cap and weekly guard", () => {
    expect(admit({ claimedLastHour: 120, maxHour: 120, codexPct: null, pausePct: 97 }).ok).toBe(false);
    expect(admit({ claimedLastHour: 1, maxHour: 120, codexPct: 98, pausePct: 97 }).ok).toBe(false);
    expect(admit({ claimedLastHour: 1, maxHour: 120, codexPct: null, pausePct: 97 }).ok).toBe(true);
    expect(maxPerHour({})).toBe(120);
    expect(maxPerHour({ AI_GATEWAY_MAX_PER_HOUR: "5" })).toBe(5);
    expect(pollDelay(0)).toBe(250);
    expect(pollDelay(50)).toBe(500);
  });
});

describe("gatewayText client", () => {
  it("fails closed immediately when the flag is off (no request written)", async () => {
    const { db, events } = fakeDb({ on: false });
    await expect(gatewayText({ system: "s", prompt: "p" }, { db })).rejects.toMatchObject({ code: "off" });
    expect(events).toHaveLength(0);
  });
  it("returns the engine's result", async () => {
    const c = clock();
    const { db, events } = fakeDb({ on: true, answer: (id) => ({ id, ok: true, text: "hi", json: { a: 1 }, error: null, ms: 5 }) });
    const r = await gatewayText({ system: "s", prompt: "p" }, { db, ...c, purpose: "t" });
    expect(r).toEqual({ text: "hi", json: { a: 1 } });
    expect(events[0].name).toBe("ai_request");
    expect(events[0].props.purpose).toBe("t");
    expect(RESULT_EVENT).toBe("ai_result");
  });
  it("throws on engine failure and on timeout", async () => {
    await expect(gatewayText({ system: "s", prompt: "p" }, { db: fakeDb({ on: true, answer: (id) => ({ id, ok: false, error: "cap" }) }).db, ...clock() })).rejects.toMatchObject({ code: "failed" });
    await expect(gatewayText({ system: "s", prompt: "p" }, { db: fakeDb({ on: true }).db, ...clock(), timeoutMs: 2000 })).rejects.toMatchObject({ code: "timeout" });
  });
});
