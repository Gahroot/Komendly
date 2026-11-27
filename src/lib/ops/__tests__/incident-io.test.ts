import { describe, expect, it } from "vitest";
import { dailyIncidentReview, incidentTick, type OpsDb } from "../incident-io";

function fake(opts: { workerAgeMin: number }) {
  const now = new Date("2026-11-26T12:00:00Z");
  const events: { id: string; name: string; props: Record<string, unknown>; createdAt: Date }[] = [];
  const flags = new Map<string, boolean>();
  let n = 0;
  const db = {
    adsEvent: {
      findMany: async (a: { where: { name: string } }) => events.filter((e) => e.name === a.where.name).reverse(),
      findFirst: async (a: { where: { name: string; props?: { path: string[]; equals: unknown } } }) => events.find((e) => e.name === a.where.name && (!a.where.props || e.props[a.where.props.path[0]] === a.where.props.equals)) ?? null,
      create: async (a: { data: { name: string; props: Record<string, unknown> } }) => { const e = { id: `e${++n}`, ...a.data, createdAt: now }; events.push(e); return e; },
      update: async (a: { where: { id: string }; data: { props: Record<string, unknown> } }) => { events.find((e) => e.id === a.where.id)!.props = a.data.props; },
      count: async () => 0,
    },
    adsFeatureFlag: { findUnique: async (a: { where: { key: string } }) => (flags.has(a.where.key) ? { enabled: flags.get(a.where.key) } : null), upsert: async (a: { where: { key: string }; update: { enabled: boolean } }) => { flags.set(a.where.key, a.update.enabled); } },
    engineHeartbeat: {
      findMany: async () => [{ id: "worker:x", kind: "worker", updatedAt: new Date(now.getTime() - opts.workerAgeMin * 60_000) }],
      findUnique: async (a: { where: { id: string } }) => (a.where.id === "kly" ? { updatedAt: now } : a.where.id === "provider:codex" ? { ok: true, message: null, updatedAt: now } : null),
      upsert: async () => undefined,
    },
    outboundDomain: { findMany: async () => [], updateMany: async () => undefined },
  } as unknown as OpsDb;
  return { db, events, flags, now };
}

describe("incidentTick", () => {
  it("stale engine: opens a P1, sets the maintenance flag, emails the owner once", async () => {
    const f = fake({ workerAgeMin: 30 });
    const sent: string[] = [];
    const send = async (m: { to: string; subject: string }) => { sent.push(`${m.to}|${m.subject}`); };
    await incidentTick(f.db, send, { now: f.now });
    await incidentTick(f.db, send, { now: f.now });
    const inc = f.events.filter((e) => e.name === "incident");
    expect(inc).toHaveLength(1);
    expect(inc[0].props).toMatchObject({ key: "heartbeat:engine", severity: "P1", status: "contained" });
    expect(f.flags.get("ops_maintenance")).toBe(true);
    expect(sent).toEqual(["nolan@prestyj.com|[P1] Engine is not reporting"]);
  });
  it("watchdog does nothing while the engine is alive", async () => {
    const f = fake({ workerAgeMin: 1 });
    const r = await incidentTick(f.db, async () => undefined, { now: f.now, mode: "watchdog" });
    expect(r).toEqual({ created: 0, updated: 0, contained: 0, escalated: 0 });
    expect(f.events).toHaveLength(0);
  });
  it("clears the incident and the maintenance flag after recovery", async () => {
    const f = fake({ workerAgeMin: 30 });
    await incidentTick(f.db, async () => undefined, { now: f.now });
    const later = new Date(f.now.getTime() + 40 * 60_000);
    // engine healthy again
    (f.db as unknown as { engineHeartbeat: { findMany: () => Promise<unknown[]> } }).engineHeartbeat.findMany = async () => [{ id: "w", kind: "worker", updatedAt: later }];
    await incidentTick(f.db, async () => undefined, { now: later, mode: "watchdog" }); // watchdog skips (alive)
    expect(f.events[0].props.status).toBe("contained");
    await incidentTick(f.db, async () => undefined, { now: later, mode: "full" });
    expect(f.events[0].props.status).toBe("resolved");
    expect(f.flags.get("ops_maintenance")).toBe(false);
  });
  it("daily review files a proposal for recurring incidents once", async () => {
    const f = fake({ workerAgeMin: 1 });
    const mk = (id: string) => f.db.adsEvent.create({ data: { name: "incident", props: { incidentId: id, key: "funnel:x", type: "funnel", severity: "P2", title: "x", status: "resolved", detectedAt: f.now.toISOString(), lastSeenAt: f.now.toISOString() } } });
    await mk("a"); await mk("b");
    expect(await dailyIncidentReview(f.db, f.now)).toBe(1);
    expect(await dailyIncidentReview(f.db, f.now)).toBe(0);
    expect(f.events.some((e) => e.name === "product_proposal" && e.props.incidentKey === "funnel:x")).toBe(true);
  });
});
