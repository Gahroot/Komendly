// Referral reward + expiry + gift bookkeeping against the dev DB from ../.env.local (skipped without DATABASE_URL). Own rows only.
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

describe.skipIf(!hasDb)("referrals + gifts (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { rewardReferralForRun, sweepReferralExpiry, REFERRAL_MONTHLY_CAP } = await import("../src/jobs/referral");
  const { maybeFinalizeRun } = await import("../src/jobs/finalize");
  const db = new PrismaClient();
  const tag = `ref-${process.pid}-${Date.now()}`;
  const userIds: string[] = [];
  const wsIds: string[] = [];
  let referrer = "";
  let referrerUser = "";

  const mkWs = async (n: string, balance = 0) => {
    const u = await db.user.create({ data: { email: `${tag}-${n}@test.invalid`, passwordHash: "x" } });
    const w = await db.adsWorkspace.create({ data: { name: `${tag}-${n}`, ownerId: u.id, creditBalance: balance } });
    userIds.push(u.id);
    wsIds.push(w.id);
    return { userId: u.id, wsId: w.id };
  };
  const mkReferral = async (n: string, status = "signed_up") => {
    const r = await mkWs(n);
    const ref = await db.adsReferral.create({ data: { code: tag, referrerWorkspaceId: referrer, referredWorkspaceId: r.wsId, referredUserId: r.userId, status } });
    return { ...r, refId: ref.id };
  };

  beforeAll(async () => {
    const r = await mkWs("referrer", 5);
    referrer = r.wsId;
    referrerUser = r.userId;
  });
  afterAll(async () => {
    await db.adsGift.deleteMany({ where: { senderWorkspaceId: { in: wsIds } } });
    await db.adsReferral.deleteMany({ where: { referrerWorkspaceId: { in: wsIds } } });
    await db.adJob.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await db.creditLedger.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await db.adsEvent.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await db.adsWorkspace.deleteMany({ where: { id: { in: wsIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it("rewards the referrer once (idempotent), with a 30-day expiry", async () => {
    const r = await mkReferral("a");
    const now = new Date();
    const first = await rewardReferralForRun(db, { id: "run-a", workspaceId: r.wsId }, now);
    expect(first.status).toBe("rewarded");
    const again = await rewardReferralForRun(db, { id: "run-a", workspaceId: r.wsId }, now);
    expect(again.status).toBe("skipped");
    const ws = await db.adsWorkspace.findUniqueOrThrow({ where: { id: referrer } });
    expect(ws.creditBalance).toBe(15);
    const rows = await db.creditLedger.findMany({ where: { workspaceId: referrer, reason: "referral_reward" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stripeRef).toBe(`referral:${r.refId}`);
    expect(rows[0]?.balanceAfter).toBe(15);
    expect(Math.round(((rows[0]?.expiresAt?.getTime() ?? 0) - now.getTime()) / 86_400_000)).toBe(30);
    const ref = await db.adsReferral.findUniqueOrThrow({ where: { id: r.refId } });
    expect(ref).toMatchObject({ status: "rewarded", rewardCredits: 10, rewardLedgerId: rows[0]?.id });
    expect(ref.trialDoneAt).not.toBeNull();
    expect(await db.adsEvent.count({ where: { name: "referral_rewarded", workspaceId: referrer } })).toBe(1);
    expect(await db.adsEvent.count({ where: { name: "referral_trial_done", workspaceId: r.wsId } })).toBe(1);
  });

  it("concurrent finalizes grant only once", async () => {
    const r = await mkReferral("race");
    const out = await Promise.all([1, 2, 3].map(() => rewardReferralForRun(db, { id: "x", workspaceId: r.wsId })));
    expect(out.filter((o) => o.status === "rewarded")).toHaveLength(1);
  });

  it("caps at 5 rewarded per UTC month, then rejects monthly_cap", async () => {
    // 2 already rewarded above; 3 more fit.
    for (let i = 0; i < REFERRAL_MONTHLY_CAP - 2; i++) {
      const r = await mkReferral(`c${i}`);
      expect((await rewardReferralForRun(db, { id: "x", workspaceId: r.wsId })).status).toBe("rewarded");
    }
    const over = await mkReferral("over");
    expect((await rewardReferralForRun(db, { id: "x", workspaceId: over.wsId })).status).toBe("capped");
    const ref = await db.adsReferral.findUniqueOrThrow({ where: { id: over.refId } });
    expect(ref).toMatchObject({ status: "rejected", rejectReason: "monthly_cap" });
    expect(ref.trialDoneAt).not.toBeNull();
    expect(await db.adsEvent.count({ where: { name: "referral_capped", workspaceId: referrer } })).toBe(1);
    const rej = await mkReferral("rej", "rejected");
    expect((await rewardReferralForRun(db, { id: "x", workspaceId: rej.wsId })).status).toBe("skipped");
  });

  it("expiry sweep expires the unused remainder once", async () => {
    const w = await mkWs("exp", 0);
    const t0 = new Date(Date.now() - 40 * 86_400_000);
    const grant = await db.creditLedger.create({ data: { workspaceId: w.wsId, delta: 10, balanceAfter: 10, reason: "referral_reward", stripeRef: `referral:${tag}-exp`, expiresAt: new Date(t0.getTime() + 30 * 86_400_000), createdAt: t0 } });
    await db.creditLedger.create({ data: { workspaceId: w.wsId, delta: -3, balanceAfter: 7, reason: "reserve", createdAt: new Date(t0.getTime() + 86_400_000) } });
    await db.adsWorkspace.update({ where: { id: w.wsId }, data: { creditBalance: 7 } });
    const res = await sweepReferralExpiry(db);
    expect(res.find((x) => x.ledgerId === grant.id)?.expired).toBe(7);
    expect((await sweepReferralExpiry(db)).find((x) => x.ledgerId === grant.id)).toBeUndefined();
    expect((await db.adsWorkspace.findUniqueOrThrow({ where: { id: w.wsId } })).creditBalance).toBe(0);
    expect(await db.creditLedger.count({ where: { stripeRef: `expire:${grant.id}`, delta: -7, balanceAfter: 0 } })).toBe(1);
  });

  it("gift run finalize: AdsGift ready + gift_ready, no credits, no bonus", async () => {
    const run = await db.adRun.create({ data: { workspaceId: referrer, userId: referrerUser, url: "https://example.org/", status: "generating", kind: "gift", isTrial: false, confirmedAt: new Date(), staticCount: 3, motionCount: 0, ratios: ["4:5"], creditsReserved: 0 } });
    const gift = await db.adsGift.create({ data: { token: `${tag}-g`, senderWorkspaceId: referrer, senderUserId: referrerUser, senderName: "Sarah", recipientUrl: run.url, recipientDomainHash: "h", source: "trial_ready", runId: run.id, status: "generating" } });
    for (let i = 0; i < 3; i++) await db.ad.create({ data: { runId: run.id, workspaceId: referrer, index: i, status: i < 2 ? "ready" : "failed_qc", kind: "static", awareness: "most_aware", angle: "a", hook: "h", headline: "x" } });
    const before = (await db.adsWorkspace.findUniqueOrThrow({ where: { id: referrer } })).creditBalance;
    expect(await maybeFinalizeRun(db, run.id)).toBe("partial");
    expect((await db.adsGift.findUniqueOrThrow({ where: { id: gift.id } })).status).toBe("ready");
    expect(await db.adsEvent.count({ where: { name: "gift_ready", runId: run.id } })).toBe(1);
    expect(await db.adJob.count({ where: { runId: run.id, type: "bonus" } })).toBe(0);
    expect(await db.creditLedger.count({ where: { runId: run.id } })).toBe(0);
    expect((await db.adsWorkspace.findUniqueOrThrow({ where: { id: referrer } })).creditBalance).toBe(before);
    await db.ad.deleteMany({ where: { runId: run.id } });
    await db.adRun.delete({ where: { id: run.id } });
  });
});
