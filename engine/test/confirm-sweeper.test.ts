import { describe, expect, it } from "vitest";
import type { Db } from "../src/db";
import { sweepConfirmations } from "../src/jobs/confirm-sweeper";

type Call = { model: string; op: string; args: unknown };

function fakeDb(runs: Array<{ id: string; workspaceId: string; userId: string; isTrial: boolean; trialClaim: unknown }>) {
  const calls: Call[] = [];
  const rec = (model: string, op: string, result: unknown) => async (args: unknown) => {
    calls.push({ model, op, args });
    return result;
  };
  let findMany = 0;
  const db = {
    adRun: {
      findMany: async () => (findMany++ === 0 ? runs : []),
      updateMany: rec("adRun", "updateMany", { count: 1 }),
    },
    adsTrialClaim: { findFirst: rec("adsTrialClaim", "findFirst", null), create: rec("adsTrialClaim", "create", {}) },
    adsWorkspace: { updateMany: rec("adsWorkspace", "updateMany", { count: 1 }) },
    adsEvent: { create: rec("adsEvent", "create", {}) },
  };
  return { db: db as unknown as Db, calls };
}

const claim = { domainHash: "d", emailHash: "e", ipHash: "i", deviceHash: "v" };

describe("sweepConfirmations", () => {
  it("auto-confirm claims the trial, marks it used and logs run_confirmed", async () => {
    const now = new Date("2026-11-06T00:00:00Z");
    const { db, calls } = fakeDb([{ id: "r1", workspaceId: "w1", userId: "u1", isTrial: true, trialClaim: claim }]);
    const res = await sweepConfirmations(db, now);
    expect(res.confirmed).toBe(1);
    expect(calls).toContainEqual({ model: "adsTrialClaim", op: "create", args: { data: { workspaceId: "w1", ...claim } } });
    expect(calls).toContainEqual({ model: "adsWorkspace", op: "updateMany", args: { where: { id: "w1", trialUsedAt: null }, data: { trialUsedAt: now } } });
    const ev = calls.find((c) => c.model === "adsEvent");
    expect(ev?.args).toMatchObject({ data: { name: "run_confirmed", runId: "r1", userId: "u1", props: { auto: true } } });
  });

  it("paid runs log run_confirmed without touching the trial", async () => {
    const { db, calls } = fakeDb([{ id: "r2", workspaceId: "w2", userId: "u2", isTrial: false, trialClaim: null }]);
    await sweepConfirmations(db);
    expect(calls.some((c) => c.model === "adsTrialClaim" || c.model === "adsWorkspace")).toBe(false);
    expect(calls.filter((c) => c.model === "adsEvent")).toHaveLength(1);
  });
});
