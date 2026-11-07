// Runs against the dev DB from ../.env.local (skipped when DATABASE_URL is absent). Scoped to its own workspace.
// Isolation: test-only job types (never claimed) and ages far below production reaper thresholds
// (24h / 2h), so a live worker's hourly reaper never touches these runs.
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

describe.skipIf(!hasDb)("reapOrphans (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { reapOrphans } = await import("../src/queue/reaper");
  const db = new PrismaClient();
  const tag = `reaper-${process.pid}-${Date.now()}`;
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
  let wsId = "";
  let userId = "";

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `${tag}@test.invalid`, passwordHash: "x" } });
    userId = user.id;
    const ws = await db.adsWorkspace.create({ data: { name: tag, ownerId: user.id, creditBalance: 0 } });
    wsId = ws.id;
  });
  afterAll(async () => {
    await db.creditLedger.deleteMany({ where: { workspaceId: wsId } });
    await db.adsEvent.deleteMany({ where: { workspaceId: wsId } });
    await db.adsWorkspace.deleteMany({ where: { id: wsId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  const ad = (runId: string, index: number, status: "ready" | "rendering" | "planned") => ({
    runId, workspaceId: wsId, index, status, kind: "static" as const, awareness: "problem_aware" as const, angle: "a", hook: "h", headline: "x",
  });

  it("cancels orphaned jobs and finalizes stuck runs with credits released", async () => {
    const base = { workspaceId: wsId, userId, url: "https://example.org/" };
    const failed = await db.adRun.create({ data: { ...base, status: "failed" } });
    const old = await db.adRun.create({ data: { ...base, status: "completed", createdAt: hoursAgo(0.5) } });
    const live = await db.adRun.create({ data: { ...base, status: "generating", confirmedAt: now, creditsReserved: 2 } });
    const stuck = await db.adRun.create({ data: { ...base, status: "generating", confirmedAt: hoursAgo(0.2), creditsReserved: 2, ratios: ["1:1"] } });
    await db.creditLedger.create({ data: { workspaceId: wsId, delta: -2, balanceAfter: 0, reason: "reserve", runId: stuck.id } });
    await db.ad.createMany({ data: [ad(stuck.id, 0, "ready"), ad(stuck.id, 1, "rendering")] });
    const job = (runId: string, status: "queued" | "failed" | "running") => db.adJob.create({ data: { type: `test_${tag}`, runId, workspaceId: wsId, status } });
    const [jFailed, jOld, jLive, jStuck] = await Promise.all([job(failed.id, "queued"), job(old.id, "failed"), job(live.id, "queued"), job(stuck.id, "queued")]);

    const res = await reapOrphans(db, { now, maxRunAgeHours: 0.25, stuckRunHours: 0.1, onlyWorkspaceIds: [wsId] });
    expect(res.finalizedRuns).toBe(1);

    const status = async (id: string) => (await db.adJob.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(jFailed.id)).toBe("canceled");
    expect(await status(jOld.id)).toBe("canceled");
    expect(await status(jStuck.id)).toBe("canceled");
    expect(await status(jLive.id)).toBe("queued");

    const s = await db.adRun.findUniqueOrThrow({ where: { id: stuck.id } });
    expect(s.status).toBe("partial");
    const released = await db.creditLedger.aggregate({ where: { runId: stuck.id, reason: "release" }, _sum: { delta: true } });
    expect(released._sum.delta).toBeGreaterThan(0);
    expect((await db.adRun.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("generating");

    // Idempotent: a second pass touches nothing.
    expect(await reapOrphans(db, { now, maxRunAgeHours: 0.25, stuckRunHours: 0.1, onlyWorkspaceIds: [wsId] })).toEqual({ canceledJobs: 0, finalizedRuns: 0 });
  });
});
