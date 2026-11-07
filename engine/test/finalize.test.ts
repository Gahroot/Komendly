// Runs against the dev DB from ../.env.local (skipped when DATABASE_URL is absent). Own workspace only.
// Isolation: jobs are created already "running" under fresh locks held by no real worker, so live
// workers can neither claim nor stale-recover them; all rows live in this test's own workspace.
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

describe.skipIf(!hasDb)("run finalisation (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { maybeFinalizeRun } = await import("../src/jobs/finalize");
  const { requestReplacement } = await import("../src/jobs/replace");
  const db = new PrismaClient();
  const tag = `finalize-${process.pid}-${Date.now()}`;
  let wsId = "";
  let userId = "";

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `${tag}@test.invalid`, passwordHash: "x" } });
    userId = user.id;
    wsId = (await db.adsWorkspace.create({ data: { name: tag, ownerId: user.id, creditBalance: 100, adsPlan: "growth", subscriptionStatus: "active" } })).id;
  });
  afterAll(async () => {
    await db.creditLedger.deleteMany({ where: { workspaceId: wsId } });
    await db.adsEvent.deleteMany({ where: { workspaceId: wsId } });
    await db.adsWorkspace.deleteMany({ where: { id: wsId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  const newRun = (staticCount: number, reserved: number) =>
    db.adRun.create({
      data: { workspaceId: wsId, userId, url: "https://example.org/", status: "generating", confirmedAt: new Date(), staticCount, motionCount: 0, ratios: ["4:5", "1:1", "9:16"], creditsReserved: reserved },
    });
  const newAd = (runId: string, index: number, status: "ready" | "failed_qc" | "rendering") =>
    db.ad.create({ data: { runId, workspaceId: wsId, index, status, kind: "static", awareness: "most_aware", angle: "a", hook: "h", headline: "x" } });

  it("does not complete while a stale render is still in flight for an ad that already passed QC", async () => {
    const run = await newRun(2, 6);
    await newAd(run.id, 0, "ready");
    const late = await newAd(run.id, 1, "ready"); // revision passed QC...
    // ...but the original render (stale-lock retry) is still running and will overwrite it.
    const stale = await db.adJob.create({ data: { type: "render_static", runId: run.id, adId: late.id, workspaceId: wsId, status: "running", lockedBy: tag, lockedAt: new Date(), attempts: 2 } });
    // The QC job that is finalising (the caller's own job) must not block.
    await db.adJob.create({ data: { type: "qc", runId: run.id, adId: late.id, workspaceId: wsId, status: "running", lockedBy: tag, lockedAt: new Date() } });

    expect(await maybeFinalizeRun(db, run.id)).toBeNull();
    expect((await db.adRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("generating");

    await db.adJob.update({ where: { id: stale.id }, data: { status: "succeeded", lockedBy: null, finishedAt: new Date() } });
    await db.adJob.updateMany({ where: { runId: run.id, type: "qc" }, data: { status: "succeeded", lockedBy: null } });
    expect(await maybeFinalizeRun(db, run.id)).toBe("completed");
  });

  it("releases a permanently failed ad's credits on a paid run and charges only the rest", async () => {
    const run = await newRun(1, 6); // cap = staticCount + 3 = 4 statics
    await db.creditLedger.create({ data: { workspaceId: wsId, delta: -6, balanceAfter: 94, reason: "reserve", runId: run.id, stripeRef: `reserve:${run.id}` } });
    await db.adsWorkspace.update({ where: { id: wsId }, data: { creditBalance: 94 } });
    await newAd(run.id, 0, "ready");
    for (let i = 1; i < 3; i++) await newAd(run.id, i, "ready");
    const bad = await newAd(run.id, 3, "failed_qc"); // 4th static: replacement cap reached

    expect(await requestReplacement(db, bad.id, "forced failure")).toBe(false);
    const release = await db.creditLedger.findMany({ where: { runId: run.id, reason: "release" } });
    expect(release.map((r) => r.delta)).toEqual([3]); // 1 credit x 3 ratios
    expect((await db.adsWorkspace.findUniqueOrThrow({ where: { id: wsId } })).creditBalance).toBe(97);

    // Idempotent: a second release attempt adds nothing.
    await requestReplacement(db, bad.id, "again");
    expect(await db.creditLedger.count({ where: { runId: run.id, reason: "release" } })).toBe(1);

    expect(await maybeFinalizeRun(db, run.id)).toBe("partial");
    expect((await db.adRun.findUniqueOrThrow({ where: { id: run.id } })).creditsCharged).toBe(3);
  });
});
