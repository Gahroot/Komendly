// Runs against the dev DB from ../.env.local (skipped when DATABASE_URL is absent). Own workspace only.
// Isolation: render jobs are created already 'running' under fresh locks (never claimable, never stale);
// the lease test uses a test-only job type and scoped recovery.
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

describe.skipIf(!hasDb)("render guard + leases (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { supersededReason } = await import("../src/jobs/render-guard");
  const { recoverStaleJobs, renewLeases } = await import("../src/queue/queue");
  const db = new PrismaClient();
  const tag = `rguard-${process.pid}-${Date.now()}`;
  const W = `worker:${tag}`;
  let wsId = "";
  let userId = "";
  let runId = "";

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `${tag}@test.invalid`, passwordHash: "x" } });
    userId = user.id;
    wsId = (await db.adsWorkspace.create({ data: { name: tag, ownerId: user.id } })).id;
    runId = (await db.adRun.create({ data: { workspaceId: wsId, userId, url: "https://example.org/", status: "generating" } })).id;
  });
  afterAll(async () => {
    await db.adsWorkspace.deleteMany({ where: { id: wsId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  const newAd = (index: number, status: "planned" | "rendering" | "ready") =>
    db.ad.create({ data: { runId, workspaceId: wsId, index, status, kind: "static", awareness: "unaware", angle: "a", hook: "h", headline: "x" } });
  // attempts = maxAttempts: if recovered, the job goes 'dead' rather than back to the live queue.
  const running = (adId: string, lockedBy = W, lockedAt = new Date()) =>
    db.adJob.create({ data: { type: "render_static", runId, adId, workspaceId: wsId, status: "running", lockedBy, lockedAt, attempts: 3, maxAttempts: 3 } });

  it("drops a render when the ad is already ready", async () => {
    const ad = await newAd(0, "ready");
    const job = await running(ad.id);
    expect(await supersededReason(db, job, W)).toBe("ad status ready");
  });

  it("drops an older render once a newer render job exists for the ad (the run cmw5c7te race)", async () => {
    const ad = await newAd(1, "planned");
    const old = await running(ad.id);
    expect(await supersededReason(db, old, W)).toBeNull(); // healthy, sole render
    await new Promise((r) => setTimeout(r, 5));
    // Not claimable: created already 'running' under a lock no real worker holds.
    const revision = await db.adJob.create({ data: { type: "render_static", runId, adId: ad.id, workspaceId: wsId, status: "running", lockedBy: "worker:other", lockedAt: new Date() } });
    expect(await supersededReason(db, old, W)).toBe(`superseded by render ${revision.id}`);
    expect(await supersededReason(db, { id: revision.id, adId: ad.id }, W)).toBe("lock lost"); // not claimed by W
  });

  it("drops a render whose lock was taken over by another worker", async () => {
    const ad = await newAd(2, "rendering");
    const job = await running(ad.id, "worker:someone-else");
    expect(await supersededReason(db, job, W)).toBe("lock lost");
  });

  it("a healthy long render keeps its lease; only an unrenewed one is recovered", async () => {
    // Test-only job type: no real worker claims or recovers it (live recovery would see it as stale too).
    const T = `test_${tag}`;
    const longAgo = new Date(Date.now() - 20 * 60_000); // claimed 20 min ago (> 15 min threshold)
    const lease = (lockedBy: string) =>
      db.adJob.create({ data: { type: T, runId, workspaceId: wsId, status: "running", lockedBy, lockedAt: longAgo, attempts: 3, maxAttempts: 3 } });
    const healthy = await lease(W);
    const crashed = await lease("worker:crashed");
    expect(await renewLeases(db, W, [healthy.id, crashed.id])).toBe(1); // only W's own job
    expect(await recoverStaleJobs(db, 15 * 60_000, { types: [T], workspaceId: wsId })).toBe(1);
    const [h, c] = await Promise.all([db.adJob.findUniqueOrThrow({ where: { id: healthy.id } }), db.adJob.findUniqueOrThrow({ where: { id: crashed.id } })]);
    expect(h.status).toBe("running");
    expect(h.lockedBy).toBe(W);
    expect(c.status).toBe("dead"); // recovered (out of attempts), never re-queued for live workers
  });
});
