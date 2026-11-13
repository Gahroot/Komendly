// Runs against the dev DB from ../.env.local (skipped when DATABASE_URL is absent).
// Isolation: every job uses a per-test-run type no real worker claims; recovery is scoped to it.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

describe.skipIf(!hasDb)("queue (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const q = await import("../src/queue/queue");
  const db = new PrismaClient();
  const TYPE = `test_${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    await db.adJob.deleteMany({ where: { type: { startsWith: TYPE } } });
  });
  afterAll(async () => {
    await db.adJob.deleteMany({ where: { type: { startsWith: TYPE } } });
    await db.$disconnect();
  });

  it("claims each job exactly once under concurrency, by priority", async () => {
    for (let i = 0; i < 20; i++) {
      await db.adJob.create({ data: { type: TYPE, priority: i % 2 === 0 ? 10 : 0, payload: { i } } });
    }
    const workers = await Promise.all(Array.from({ length: 6 }, (_, w) => q.claimJobs(db, `w${w}`, [TYPE], 5)));
    const ids = workers.flat().map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(20);
    const one = workers.flat()[0];
    expect(one?.claimedAt).toBeInstanceOf(Date); // queue-wait instrumentation: claimedAt - readyAt
    expect(one?.readyAt).toBeInstanceOf(Date);
    if (one?.claimedAt && one.readyAt) expect(one.claimedAt.getTime()).toBeGreaterThanOrEqual(one.readyAt.getTime() - 1000);
    const first = await q.claimJobs(db, "late", [TYPE], 5);
    expect(first).toHaveLength(0);
  });

  it("orders by priority desc, retries with backoff then goes dead, recovers stale locks", async () => {
    const t = `${TYPE}_b`;
    await db.adJob.create({ data: { type: t, priority: 0 } });
    const hi = await db.adJob.create({ data: { type: t, priority: 5, maxAttempts: 2 } });
    const [c] = await q.claimJobs(db, "w", [t], 1);
    expect(c?.id).toBe(hi.id);
    if (!c) return;
    expect(await q.failJob(db, c, "boom", { durationMs: 1, costMicros: 5 })).toBe("failed");
    const row = await db.adJob.findUniqueOrThrow({ where: { id: hi.id } });
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now());
    await db.adJob.update({ where: { id: hi.id }, data: { runAt: new Date(Date.now() - 1000) } });
    const [c2] = await q.claimJobs(db, "w", [t], 1);
    expect(c2?.id).toBe(hi.id);
    if (!c2) return;
    expect(await q.failJob(db, c2, "boom", { durationMs: 1, costMicros: 5 })).toBe("dead");

    const stuck = await db.adJob.create({ data: { type: t, status: "running", attempts: 1, lockedBy: "gone", lockedAt: new Date(Date.now() - 3_600_000) } });
    expect(await q.recoverStaleJobs(db, 60_000, { types: [t] })).toBe(1);
    expect((await db.adJob.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe("queued");
    // the interrupted attempt is given back and counted as a restart
    const rec = await db.adJob.findUniqueOrThrow({ where: { id: stuck.id } });
    expect(rec.attempts).toBe(0);
    expect((rec.payload as { restarts?: number }).restarts).toBe(1);
    // a job already at maxAttempts is NOT killed by a restart (it was the restart's fault)
    const full = await db.adJob.create({ data: { type: t, status: "running", attempts: 3, maxAttempts: 3, lockedBy: "gone", lockedAt: new Date(Date.now() - 3_600_000) } });
    expect(await q.recoverStaleJobs(db, 60_000, { types: [t] })).toBe(1);
    expect((await db.adJob.findUniqueOrThrow({ where: { id: full.id } })).status).toBe("queued");
    // ...but a job that took its worker down MAX_RESTARTS times is dead
    const poison = await db.adJob.create({ data: { type: t, status: "running", attempts: 1, payload: { restarts: q.MAX_RESTARTS - 1 }, lockedBy: "gone", lockedAt: new Date(Date.now() - 3_600_000) } });
    expect(await q.recoverStaleJobs(db, 60_000, { types: [t] })).toBe(1);
    expect((await db.adJob.findUniqueOrThrow({ where: { id: poison.id } })).status).toBe("dead");
    await db.adJob.deleteMany({ where: { id: { in: [full.id, poison.id] } } });

    // releaseJob gives the attempt back
    const [c3] = await q.claimJobs(db, "w", [t], 5);
    if (!c3) return;
    await q.releaseJob(db, c3.id, 0, "provider down");
    const r3 = await db.adJob.findUniqueOrThrow({ where: { id: c3.id } });
    expect(r3.status).toBe("queued");
    expect(r3.attempts).toBe(c3.attempts - 1);
  });
});
