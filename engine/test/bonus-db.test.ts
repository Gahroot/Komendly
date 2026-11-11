// Locked bonus ads against the dev DB from ../.env.local (skipped without DATABASE_URL). Own workspace only.
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

describe.skipIf(!hasDb)("trial fill + locked bonus (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { maybeFinalizeRun } = await import("../src/jobs/finalize");
  const { requestReplacement } = await import("../src/jobs/replace");
  const { emitBonusReady } = await import("../src/jobs/bonus");
  const db = new PrismaClient();
  const tag = `bonus-${process.pid}-${Date.now()}`;
  let wsId = "";
  let userId = "";
  const prevBonus = process.env.ADS_TRIAL_BONUS;

  beforeAll(async () => {
    process.env.ADS_TRIAL_BONUS = "1";
    const user = await db.user.create({ data: { email: `${tag}@test.invalid`, passwordHash: "x" } });
    userId = user.id;
    wsId = (await db.adsWorkspace.create({ data: { name: tag, ownerId: user.id, creditBalance: 100 } })).id;
  });
  afterAll(async () => {
    if (prevBonus === undefined) delete process.env.ADS_TRIAL_BONUS;
    else process.env.ADS_TRIAL_BONUS = prevBonus;
    await db.adJob.deleteMany({ where: { workspaceId: wsId } });
    await db.creditLedger.deleteMany({ where: { workspaceId: wsId } });
    await db.adsEvent.deleteMany({ where: { workspaceId: wsId } });
    await db.adsWorkspace.deleteMany({ where: { id: wsId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  const newRun = (staticCount: number) =>
    db.adRun.create({ data: { workspaceId: wsId, userId, url: "https://example.org/", status: "generating", isTrial: true, confirmedAt: new Date(), staticCount, motionCount: 0, ratios: ["4:5"], creditsReserved: staticCount } });
  const newAd = (runId: string, index: number, status: "ready" | "failed_qc" | "rendering" | "planned", visualBrief: object = {}) =>
    db.ad.create({ data: { runId, workspaceId: wsId, index, status, kind: "static", awareness: "most_aware", angle: "a", hook: "h", headline: "x", visualBrief } });

  it("a trial keeps replacing past the old +5 cap, up to 2x", async () => {
    const run = await newRun(10); // old cap 10+5 = 15, now 2x = 20
    for (let i = 0; i < 14; i++) await newAd(run.id, i, "failed_qc");
    await newAd(run.id, 99, "ready", { locked: true, bonusKind: "story" }); // locked ads do not use budget
    const bad = await newAd(run.id, 14, "failed_qc");
    expect(await requestReplacement(db, bad.id, "x")).toBe(true);
    await db.adJob.deleteMany({ where: { runId: run.id } });
    await db.adRun.update({ where: { id: run.id }, data: { status: "partial" } });
  });

  it("stops replacing after the wall-clock cap", async () => {
    const run = await newRun(2);
    await db.adRun.update({ where: { id: run.id }, data: { confirmedAt: new Date(Date.now() - 60 * 60_000) } });
    const bad = await newAd(run.id, 0, "failed_qc");
    expect(await requestReplacement(db, bad.id, "x")).toBe(false);
    await db.adRun.update({ where: { id: run.id }, data: { status: "partial" } });
  });

  it("locked ads never gate completion, are never replaced, and bonus job is queued on completion", async () => {
    const run = await newRun(1);
    await newAd(run.id, 0, "ready");
    const locked = await newAd(run.id, 1, "failed_qc", { locked: true, bonusKind: "story" });
    expect(await requestReplacement(db, locked.id, "x")).toBe(false);
    expect(await db.creditLedger.count({ where: { runId: run.id } })).toBe(0); // no credits released for a bonus ad
    await newAd(run.id, 2, "rendering", { locked: true, bonusKind: "motion" });
    expect(await maybeFinalizeRun(db, run.id)).toBe("completed");
    // Any status: a live dev worker sharing the DB may already have claimed it.
    expect(await db.adJob.count({ where: { runId: run.id, type: "bonus" } })).toBe(1);
    const ev = await db.adsEvent.findFirstOrThrow({ where: { runId: run.id, name: "run_completed" } });
    expect((ev.props as { total: number }).total).toBe(1);

    // bonus_ready only once every locked ad is terminal, and only once.
    expect(await emitBonusReady(db, run.id)).toBe(false);
    await db.ad.updateMany({ where: { runId: run.id, status: "rendering" }, data: { status: "ready" } });
    expect(await emitBonusReady(db, run.id)).toBe(true);
    expect(await emitBonusReady(db, run.id)).toBe(false);
    const b = await db.adsEvent.findFirstOrThrow({ where: { runId: run.id, name: "bonus_ready" } });
    expect(b.props).toEqual({ runId: run.id, count: 1 });
  });
});
