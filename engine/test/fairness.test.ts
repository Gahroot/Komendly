// Queue fairness. The claim-order test runs against the dev DB (skipped without DATABASE_URL).
// Isolation: test-only job types (passed as the fairness start/render types), so no real worker
// can claim them; all runs/ads live in this test's own workspace.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startLaneLimits } from "../src/queue/fairness";

describe("startLaneLimits", () => {
  it("keeps a reserved slot for start work when renders fill the worker", () => {
    expect(startLaneLimits(4, 1, 0, 3)).toEqual({ start: 1, other: 0 }); // 3 renders busy: last slot is start-only
    expect(startLaneLimits(4, 1, 0, 0)).toEqual({ start: 4, other: 3 });
    expect(startLaneLimits(4, 1, 1, 3)).toEqual({ start: 0, other: 0 }); // full
    expect(startLaneLimits(4, 1, 2, 1)).toEqual({ start: 1, other: 1 }); // start work may use general slots
    expect(startLaneLimits(1, 1, 0, 0)).toEqual({ start: 1, other: 1 }); // never reserve the only slot
  });
});

function loadEnv(): void {
  try {
    for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]?.replace(/^"|"$/g, "");
    }
  } catch {
    /* no env file */
  }
}
loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("claim fairness across concurrent runs (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { claimJobs } = await import("../src/queue/queue");
  const db = new PrismaClient();
  const tag = `fair_${process.pid}_${Date.now()}`;
  const T = { extract: `${tag}_extract`, plan: `${tag}_plan`, render: `${tag}_render`, qc: `${tag}_qc` };
  const fairness = { start: [T.extract, T.plan], render: [T.render], qc: [T.qc] };
  const types = Object.values(T);
  let wsId = "";
  let userId = "";

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `${tag}@test.invalid`, passwordHash: "x" } });
    userId = user.id;
    wsId = (await db.adsWorkspace.create({ data: { name: tag, ownerId: user.id } })).id;
  });
  afterAll(async () => {
    await db.adJob.deleteMany({ where: { type: { in: types } } });
    await db.adsWorkspace.deleteMany({ where: { id: wsId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  const run = () => db.adRun.create({ data: { workspaceId: wsId, userId, url: "https://example.org/", status: "generating" } });
  const ad = (runId: string, index: number, status: "planned" | "ready") =>
    db.ad.create({ data: { runId, workspaceId: wsId, index, status, kind: "static", awareness: "unaware", angle: "a", hook: "h", headline: "x" } });
  const ago = (s: number) => new Date(Date.now() - s * 1000);
  const job = (type: string, runId: string, o: { adId?: string; priority?: number; runAt?: Date; payload?: object } = {}) =>
    db.adJob.create({ data: { type, runId, workspaceId: wsId, adId: o.adId, priority: o.priority ?? 0, runAt: o.runAt ?? ago(1), payload: o.payload ?? {} } });

  it("new run's extract, then its plan and first ad, go before older runs' later ads and replacements", async () => {
    // Old run A: already has a ready ad; many later renders + a replacement plan queued long ago, high raw priority.
    const a = await run();
    await ad(a.id, 0, "ready");
    const aLater = [];
    for (let i = 1; i <= 5; i++) aLater.push(await job(T.render, a.id, { adId: (await ad(a.id, i, "planned")).id, priority: 20, runAt: ago(60) }));
    const aReplace = await job(T.plan, a.id, { priority: 40, runAt: ago(60), payload: { replaceAdId: "x" } });
    // New run B: just submitted (web enqueues extract at priority 0).
    const b = await run();
    const bExtract = await job(T.extract, b.id, { priority: 0 });
    // New run C: planned, its first ad waiting.
    const c = await run();
    const cFirst = await job(T.render, c.id, { adId: (await ad(c.id, 0, "planned")).id, priority: 20 });

    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [got] = await claimJobs(db, `w-${tag}`, types, 1, fairness);
      if (got) order.push(got.id);
    }
    expect(order[0]).toBe(bExtract.id); // start work first, despite priority 0
    expect(order[1]).toBe(cFirst.id); // then the first ad of a run with nothing rendered yet
    expect(aLater.map((j) => j.id).concat(aReplace.id)).toContain(order[2]);

    // Once C has a render in flight, its next ad no longer jumps the queue.
    await db.ad.updateMany({ where: { runId: c.id, index: 0 }, data: { status: "rendering" } });
    const cSecond = await job(T.render, c.id, { adId: (await ad(c.id, 1, "planned")).id, priority: 20 });
    const [next] = await claimJobs(db, `w-${tag}`, types, 1, fairness);
    expect(next?.id).not.toBe(cSecond.id);
  });

  it("QC is claimed before any render, even with many runs boosting renders and none ready (20:18 starvation)", async () => {
    const renders: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await run(); // no ready ad, nothing rendering: every one of these renders gets the first-ad boost
      renders.push((await job(T.render, r.id, { adId: (await ad(r.id, 0, "planned")).id, priority: 120, runAt: ago(600) })).id);
    }
    const q = await run();
    const qcAd = await ad(q.id, 0, "planned");
    await db.ad.update({ where: { id: qcAd.id }, data: { status: "qc" } });
    const otherRun = await run();
    await ad(otherRun.id, 0, "ready");
    const laterQc = await job(T.qc, otherRun.id, { adId: (await ad(otherRun.id, 1, "planned")).id, priority: 25 }); // run already has a ready ad
    const firstQc = await job(T.qc, q.id, { adId: qcAd.id, priority: 25 });
    const got = [];
    for (let i = 0; i < 3; i++) got.push(...(await claimJobs(db, `w-${tag}`, [T.render, T.qc], 1, fairness)));
    expect(got.map((j) => j.id).slice(0, 2)).toEqual([firstQc.id, laterQc.id]); // first-ad QC, then other QC
    expect(renders).toContain(got[2]?.id);
  });

  it("ages waiting jobs so a low-priority job is not starved forever", async () => {
    const r = await run();
    await ad(r.id, 0, "ready"); // no first-ad boost
    const old = await job(T.qc, r.id, { priority: 0, runAt: ago(30 * 60) }); // waited 30 min: +300
    const fresh = await job(T.qc, r.id, { priority: 100 });
    const [got] = await claimJobs(db, `w-${tag}`, [T.qc], 1, fairness);
    expect(got?.id).toBe(old.id);
    expect(fresh.id).toBeTruthy();
  });
});
