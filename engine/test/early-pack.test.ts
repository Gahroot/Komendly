// Early trial pack completion + hedged replacements. Pure tests, plus dev-DB tests (own workspace only, skipped without DATABASE_URL).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { earlyPackStatus, type PackAd } from "../src/jobs/trial-fill";
import { wantsHedge } from "../src/jobs/replace";

const a = (kind: string, status: string, o: Partial<PackAd> = {}): PackAd => ({ kind, status, replaced: false, pending: false, ...o });
const run = { staticCount: 2, motionCount: 1 };

describe("earlyPackStatus", () => {
  it("waits until the promised statics are ready (replaced ones don't count)", () => {
    expect(earlyPackStatus(run, [a("static", "ready"), a("static", "ready", { replaced: true }), a("static", "qc"), a("motion", "ready")], true)).toBeNull();
  });
  it("completes with surplus/hedge statics still in flight", () => {
    expect(earlyPackStatus(run, [a("static", "ready"), a("static", "ready"), a("static", "rendering"), a("motion", "ready")], true)).toBe("completed");
  });
  it("motion in flight: completes in background mode, waits otherwise", () => {
    const ads = [a("static", "ready"), a("static", "ready"), a("motion", "rendering")];
    expect(earlyPackStatus(run, ads, true)).toBe("completed");
    expect(earlyPackStatus(run, ads, false)).toBeNull();
  });
  it("motion failed for good: partial", () => {
    expect(earlyPackStatus(run, [a("static", "ready"), a("static", "ready"), a("motion", "failed_qc")], false)).toBe("partial");
    expect(earlyPackStatus(run, [a("static", "ready"), a("static", "ready"), a("motion", "failed_qc", { pending: true })], false)).toBeNull();
  });
});

describe("wantsHedge", () => {
  const base = { isTrial: true, freeRun: false, kind: "static", locked: false, qcAttempts: 0, enabled: true };
  it("only a trial static's first fail", () => {
    expect(wantsHedge(base)).toBe(true);
    expect(wantsHedge({ ...base, qcAttempts: 1 })).toBe(false);
    expect(wantsHedge({ ...base, isTrial: false })).toBe(false);
    expect(wantsHedge({ ...base, freeRun: true })).toBe(false);
    expect(wantsHedge({ ...base, kind: "motion" })).toBe(false);
    expect(wantsHedge({ ...base, locked: true })).toBe(false);
    expect(wantsHedge({ ...base, enabled: false })).toBe(false);
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

describe.skipIf(!process.env.DATABASE_URL)("early trial completion + hedge adoption (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { maybeFinalizeRun } = await import("../src/jobs/finalize");
  const { requestReplacement } = await import("../src/jobs/replace");
  const db = new PrismaClient();
  const tag = `earlypack-${process.pid}-${Date.now()}`;
  let wsId = "";
  let userId = "";
  beforeAll(async () => {
    userId = (await db.user.create({ data: { email: `${tag}@test.invalid`, passwordHash: "x" } })).id;
    wsId = (await db.adsWorkspace.create({ data: { name: tag, ownerId: userId } })).id;
  });
  afterAll(async () => {
    await db.adJob.deleteMany({ where: { workspaceId: wsId } });
    await db.creditLedger.deleteMany({ where: { workspaceId: wsId } });
    await db.adsEvent.deleteMany({ where: { workspaceId: wsId } });
    await db.adsWorkspace.deleteMany({ where: { id: wsId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });
  const newRun = () =>
    db.adRun.create({ data: { workspaceId: wsId, userId, url: "https://example.org/", status: "generating", confirmedAt: new Date(), isTrial: true, staticCount: 2, motionCount: 0, ratios: ["1:1"], creditsReserved: 0 } });
  const newAd = (runId: string, index: number, status: "ready" | "failed_qc" | "rendering", visualBrief: object = {}) =>
    db.ad.create({ data: { runId, workspaceId: wsId, index, status, kind: "static", awareness: "most_aware", angle: "a", hook: "h", headline: "x", visualBrief } });

  it("marks a trial run completed once the promised statics are ready, with work still in flight", async () => {
    const r = await newRun();
    await newAd(r.id, 0, "ready");
    await newAd(r.id, 1, "rendering");
    expect(await maybeFinalizeRun(db, r.id)).toBeNull();
    await newAd(r.id, 2, "ready"); // hedge passed first
    expect(await maybeFinalizeRun(db, r.id)).toBe("completed");
    const ev = await db.adsEvent.findFirstOrThrow({ where: { runId: r.id, name: "run_completed" } });
    expect(ev.props).toMatchObject({ early: true, inFlight: 1 });
  });

  it("a failed original adopts its hedge instead of queuing another replacement", async () => {
    const r = await newRun();
    const orig = await newAd(r.id, 0, "failed_qc");
    const hedge = await newAd(r.id, 5, "rendering", { hedgeOf: orig.id });
    expect(await requestReplacement(db, orig.id, "fail")).toBe(true);
    expect((await db.ad.findUniqueOrThrow({ where: { id: orig.id } })).qcReport).toMatchObject({ replacedBy: hedge.id });
    expect(await db.adJob.count({ where: { runId: r.id, type: "plan" } })).toBe(0);
  });

  it("a hedge still being planned marks the original pending", async () => {
    const r = await newRun();
    const orig = await newAd(r.id, 0, "failed_qc");
    await db.adJob.create({ data: { type: "plan", runId: r.id, workspaceId: wsId, status: "running", lockedBy: tag, lockedAt: new Date(), payload: { replaceAdId: orig.id, hedge: true } } });
    expect(await requestReplacement(db, orig.id, "fail")).toBe(true);
    expect((await db.ad.findUniqueOrThrow({ where: { id: orig.id } })).qcReport).toMatchObject({ replacementPending: true });
    expect(await db.adJob.count({ where: { runId: r.id, type: "plan" } })).toBe(1);
  });
});

describe("settledShortfall", () => {
  it("null while a static is in flight or pending; else the missing count", async () => {
    const { settledShortfall } = await import("../src/jobs/trial-fill");
    expect(settledShortfall({ staticCount: 2 }, [a("static", "ready"), a("static", "qc")])).toBeNull();
    expect(settledShortfall({ staticCount: 2 }, [a("static", "ready"), a("static", "failed_qc", { pending: true })])).toBeNull();
    expect(settledShortfall({ staticCount: 2 }, [a("static", "ready"), a("static", "failed_qc"), a("motion", "rendering")])).toBe(1);
  });
});

// Regression: prod trial cmwc7iamu00066ur5udk9p0vo. 9/10 statics ready by +5 min, hedges had spent the attempt
// budget (21 statics >= cap 20), so nothing filled the last slot and the run waited ~32 min for the motion ad.
describe.skipIf(!process.env.DATABASE_URL)("prod replay: settled short pack (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { maybeFinalizeRun } = await import("../src/jobs/finalize");
  const db = new PrismaClient();
  const tag = `settle-${process.pid}-${Date.now()}`;
  let wsId = "";
  let userId = "";
  beforeAll(async () => {
    userId = (await db.user.create({ data: { email: `${tag}@test.invalid`, passwordHash: "x" } })).id;
    wsId = (await db.adsWorkspace.create({ data: { name: tag, ownerId: userId } })).id;
  });
  afterAll(async () => {
    await db.adJob.deleteMany({ where: { workspaceId: wsId } });
    await db.adsEvent.deleteMany({ where: { workspaceId: wsId } });
    await db.adsWorkspace.deleteMany({ where: { id: wsId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  /** 10 originals + 11 hedges: 9 ready, 2 failed leaves, the rest replaced; motion still rendering. */
  async function replay() {
    const run = await db.adRun.create({ data: { workspaceId: wsId, userId, url: "https://example.org/", status: "generating", confirmedAt: new Date(Date.now() - 5 * 60_000), isTrial: true, staticCount: 10, motionCount: 1, ratios: ["1:1"], creditsReserved: 0 } });
    const mk = (index: number, status: "ready" | "failed_qc" | "rendering", kind: "static" | "motion" = "static", qcReport: object = {}) =>
      db.ad.create({ data: { runId: run.id, workspaceId: wsId, index, status, kind, awareness: "most_aware", angle: "a", hook: "h", headline: "x", qcReport } });
    for (let i = 0; i < 9; i++) await mk(i, "ready");
    for (let i = 9; i < 19; i++) await mk(i, "failed_qc", "static", { replacedBy: "superseded" });
    const leaves = [await mk(19, "failed_qc"), await mk(20, "failed_qc")];
    await mk(21, "rendering", "motion");
    await db.adJob.create({ data: { type: "render_motion", runId: run.id, workspaceId: wsId, status: "running", lockedBy: tag, lockedAt: new Date() } });
    return { run, leaves };
  }

  it("fills the missing static immediately, then completes without waiting for motion", async () => {
    const { run, leaves } = await replay();
    expect(await maybeFinalizeRun(db, run.id)).toBeNull();
    const fill = await db.adJob.findMany({ where: { runId: run.id, type: "plan" } });
    expect(fill).toHaveLength(1);
    expect(fill[0]?.payload).toMatchObject({ settle: true });
    const leaf = leaves.find((l) => (fill[0]?.payload as { replaceAdId?: string }).replaceAdId === l.id);
    expect(leaf).toBeDefined();
    expect(await maybeFinalizeRun(db, run.id)).toBeNull(); // fill planning: not settled, no duplicate fill
    expect(await db.adJob.count({ where: { runId: run.id, type: "plan" } })).toBe(1);
    // Fill ad passes QC.
    const ok = await db.ad.create({ data: { runId: run.id, workspaceId: wsId, index: 30, status: "ready", kind: "static", awareness: "most_aware", angle: "a", hook: "h", headline: "x" } });
    await db.ad.update({ where: { id: leaf?.id ?? "" }, data: { qcReport: { replacedBy: ok.id } } });
    await db.adJob.updateMany({ where: { runId: run.id, type: "plan" }, data: { status: "succeeded", lockedBy: null } });
    expect(await maybeFinalizeRun(db, run.id)).toBe("completed");
  });

  it("completes partial at once (motion still rendering) when the fill budget is spent", async () => {
    const prev = process.env.ADS_TRIAL_SETTLE_EXTRA;
    process.env.ADS_TRIAL_SETTLE_EXTRA = "0";
    try {
      const { run } = await replay();
      expect(await maybeFinalizeRun(db, run.id)).toBe("partial");
      expect(await db.adJob.count({ where: { runId: run.id, type: "plan" } })).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.ADS_TRIAL_SETTLE_EXTRA;
      else process.env.ADS_TRIAL_SETTLE_EXTRA = prev;
    }
  });
});
