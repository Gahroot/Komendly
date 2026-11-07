import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  InsufficientCreditsError, adminAdjustCredits, computeExpiringIncluded, getBalance, grantSubscriptionCredits,
  grantTopup, refundCredits, releaseCredits, releaseKey, reserveCredits,
} from "../credits";

const tag = `vitest-${Date.now()}`;
let wsId = "";
let userId = "";

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${tag}@test.komendly.dev`, passwordHash: "x" } });
  userId = user.id;
  const ws = await prisma.adsWorkspace.create({ data: { name: tag, ownerId: user.id } });
  wsId = ws.id;
});

afterAll(async () => {
  await prisma.adsWorkspace.deleteMany({ where: { id: wsId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

async function ledgerSum() {
  const agg = await prisma.creditLedger.aggregate({ where: { workspaceId: wsId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

describe("credit ledger (dev DB)", () => {
  it("top-up is idempotent per stripeRef", async () => {
    await grantTopup(wsId, `${tag}:cs_1`, 50);
    const replay = await grantTopup(wsId, `${tag}:cs_1`, 50);
    expect(replay.applied).toBe(false);
    expect(await getBalance(wsId)).toBe(50);
  });

  it("reserve is idempotent per runId and never overdraws", async () => {
    await reserveCredits(wsId, `${tag}-run1`, 20);
    await reserveCredits(wsId, `${tag}-run1`, 20);
    expect(await getBalance(wsId)).toBe(30);
    await expect(reserveCredits(wsId, `${tag}-run2`, 31)).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(await getBalance(wsId)).toBe(30);
  });

  it("concurrent reserves never push the balance negative", async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => reserveCredits(wsId, `${tag}-c${i}`, 10)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await getBalance(wsId)).toBe(0);
  });

  it("release is idempotent per key and capped at the reserved amount", async () => {
    await releaseCredits(wsId, `${tag}-run1`, 5, "ad_a");
    await releaseCredits(wsId, `${tag}-run1`, 5, "ad_a");
    expect(await getBalance(wsId)).toBe(5);
    await releaseCredits(wsId, `${tag}-run1`, 100, "ad_b");
    expect(await getBalance(wsId)).toBe(20); // run1 reserved 20 in total
  });

  it("skips a release the engine already wrote with release:<runId>:<key>", async () => {
    await prisma.$transaction([
      prisma.creditLedger.create({ data: { workspaceId: wsId, delta: 0, balanceAfter: 20, reason: "release", runId: `${tag}-c0`, note: releaseKey(`${tag}-c0`, "ad_x") } }),
    ]);
    await releaseCredits(wsId, `${tag}-c0`, 4, "ad_x");
    expect(await getBalance(wsId)).toBe(20);
  });

  it("refund claw-back clamps at zero; admin adjust can't overdraw", async () => {
    await refundCredits(wsId, `${tag}-r1`, 1000);
    expect(await getBalance(wsId)).toBe(0);
    await expect(adminAdjustCredits(wsId, -1, userId, "test", `${tag}-a1`)).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("renewal expires unused included credits but keeps top-ups", async () => {
    await grantSubscriptionCredits(wsId, `${tag}-in1`, 60);
    await grantTopup(wsId, `${tag}:cs_2`, 50);
    await reserveCredits(wsId, `${tag}-run3`, 10); // consumes included first
    await grantSubscriptionCredits(wsId, `${tag}-in2`, 60);
    await grantSubscriptionCredits(wsId, `${tag}-in2`, 60); // replay
    expect(await getBalance(wsId)).toBe(110); // 50 top-up + 60 new plan
    expect(await ledgerSum()).toBe(await getBalance(wsId));
  });

  it("computeExpiringIncluded", () => {
    expect(computeExpiringIncluded(60, -10, 100)).toBe(50);
    expect(computeExpiringIncluded(60, -80, 30)).toBe(0);
    expect(computeExpiringIncluded(60, 0, 20)).toBe(20);
  });
});
