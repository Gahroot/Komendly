import { describe, expect, it } from "vitest";
import { aiGatewayTick } from "./loop";

function fakeDb(flag: boolean, reqs: Array<{ id: string; at?: Date }>) {
  const events: Array<{ name: string; props: Record<string, unknown>; createdAt: Date }> = reqs.map((r) => ({ name: "ai_request", props: { id: r.id, system: "s", prompt: "p", schema: null, purpose: "t", requester: "web" }, createdAt: r.at ?? new Date() }));
  const match = (e: typeof events[number], w: any) => (w.name?.in ? w.name.in.includes(e.name) : w.name ? e.name === w.name : true) && (!w.createdAt?.gte || e.createdAt >= w.createdAt.gte) && (!w.props?.path || (e.props as any)[w.props.path[0]] === w.props.equals);
  const api: any = {
    adsFeatureFlag: { findUnique: async () => ({ enabled: flag }) },
    engineHeartbeat: { findUnique: async () => null, upsert: async () => ({}) },
    adsEvent: {
      findMany: async ({ where }: any) => events.filter((e) => match(e, where)),
      findFirst: async ({ where }: any) => events.find((e) => match(e, where)) ?? null,
      count: async ({ where }: any) => events.filter((e) => match(e, where)).length,
      create: async ({ data }: any) => { events.push({ ...data, createdAt: new Date() }); return {}; },
    },
    $executeRaw: async () => 0,
  };
  api.$transaction = async (fn: any) => fn(api);
  return { db: api, events };
}
const provider: any = { text: async () => ({ text: "ok", json: undefined, usage: { costMicros: 3, latencyMs: 1 } }) };

describe("aiGatewayTick", () => {
  it("does nothing when the flag is off", async () => {
    const { db, events } = fakeDb(false, [{ id: "a" }]);
    expect(await aiGatewayTick(db, provider)).toBe(0);
    expect(events.filter((e) => e.name === "ai_result")).toHaveLength(0);
  });
  it("answers once, ignores stale, never repeats", async () => {
    const { db, events } = fakeDb(true, [{ id: "a" }, { id: "old", at: new Date(Date.now() - 10 * 60_000) }]);
    expect(await aiGatewayTick(db, provider)).toBe(1);
    expect(await aiGatewayTick(db, provider)).toBe(0);
    const res = events.filter((e) => e.name === "ai_result");
    expect(res).toHaveLength(1);
    expect(res[0]?.props).toMatchObject({ id: "a", ok: true, text: "ok" });
  });
  it("writes ok:false when the provider throws", async () => {
    const { db, events } = fakeDb(true, [{ id: "b" }]);
    await aiGatewayTick(db, { text: async () => { throw new Error("boom"); } } as any);
    expect(events.find((e) => e.name === "ai_result")?.props).toMatchObject({ id: "b", ok: false });
  });
  it("hourly cap", async () => {
    const { db, events } = fakeDb(true, [{ id: "c" }]);
    await aiGatewayTick(db, provider, { AI_GATEWAY_MAX_PER_HOUR: "1" } as any);
    expect(events.find((e) => e.name === "ai_result")?.props.ok).toBe(true); // first of the hour passes (cap counts others)
  });
});
