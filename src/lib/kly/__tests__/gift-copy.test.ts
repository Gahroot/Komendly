import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { claimedRunId, copyGiftToWorkspace, GIFT_CLAIMED_KIND, planGiftCopy } from "../gift-copy";

const now = new Date("2026-11-11T00:00:00Z");
const asset = (id: string, key: string) => ({ id, adId: "x", ratio: "1:1", storageKey: key, mime: "image/png", width: 1080, height: 1080, bytes: 10, expiresAt: new Date("2026-12-01T00:00:00Z"), createdAt: now });
const ad = (id: string, index: number, status: string, assets: ReturnType<typeof asset>[]) => ({ id, runId: "src", workspaceId: "sender", kind: "static", index, awareness: "problem_aware", angle: "a", hook: "h", headline: `H${index}`, body: null, cta: null, claims: [], visualBrief: null, status, qcAttempts: 0, qcReport: null, costMicros: BigInt(5), durationMs: null, createdAt: now, updatedAt: now, locked: false, assets });
const source = () => ({
  id: "src", workspaceId: "sender", userId: "su", url: "https://bob.example", goal: "auto", resolvedGoal: null, status: "completed", kind: "gift", ratios: ["1:1"], extraction: { brandName: "Bob" },
  ads: [ad("a2", 1, "failed", [asset("x2", "runs/k2.png")]), ad("a1", 0, "ready", [asset("x1", "runs/k1.png")])],
});

/** In-memory fake of the few Prisma calls copyGiftToWorkspace makes. */
function fakeDb() {
  const runs = new Map<string, Record<string, unknown>>([["src", source()]]);
  const ads: Record<string, unknown>[] = [];
  const assets: { storageKey: string; expiresAt: Date | null }[] = [{ storageKey: "runs/k1.png", expiresAt: new Date("2026-12-01T00:00:00Z") }];
  const tx = {
    adRun: {
      findUnique: async ({ where }: { where: { id: string } }) => runs.get(where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> & { id: string } }) => { if (runs.has(data.id)) throw new Error("P2002"); runs.set(data.id, data); return data; },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const r = { ...runs.get(where.id), ...data }; runs.set(where.id, r); return r; },
    },
    ad: {
      create: async ({ data }: { data: Record<string, unknown> }) => { ads.push(data); return data; },
      findMany: async ({ where }: { where: { runId: string } }) => ads.filter((a) => a.runId === where.runId).map((a) => ({ id: a.id })),
    },
    adAsset: {
      createMany: async ({ data }: { data: { storageKey: string; expiresAt: Date | null }[] }) => { assets.push(...data); return { count: data.length }; },
      updateMany: async ({ where }: { where: { storageKey: { in: string[] } } }) => { let count = 0; for (const a of assets) if (where.storageKey.in.includes(a.storageKey) && a.expiresAt) { a.expiresAt = null; count++; } return { count }; },
    },
  };
  const db = { $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as Pick<PrismaClient, "$transaction">;
  return { db, runs, ads, assets };
}

describe("planGiftCopy", () => {
  it("copies only ready ads with shared keys, no TTL, no credits, not a trial", () => {
    const p = planGiftCopy(source() as never, "g1", { workspaceId: "w", userId: "u" }, now);
    expect(p.run).toMatchObject({ id: claimedRunId("g1"), kind: GIFT_CLAIMED_KIND, workspaceId: "w", userId: "u", isTrial: false, creditsReserved: 0, creditsCharged: 0, staticCount: 1, status: "completed" });
    expect(p.ads).toHaveLength(1);
    expect(p.ads[0]?.ad).toMatchObject({ headline: "H0", index: 0, workspaceId: "w", costMicros: BigInt(0) });
    expect(p.ads[0]?.assets).toEqual([expect.objectContaining({ storageKey: "runs/k1.png", expiresAt: null })]);
  });
});

describe("copyGiftToWorkspace", () => {
  it("is idempotent and retains the shared object", async () => {
    const f = fakeDb();
    expect(await copyGiftToWorkspace(f.db, { giftId: "g1", sourceRunId: "src", workspaceId: "w", userId: "u", now })).toBe("gc_g1");
    expect(await copyGiftToWorkspace(f.db, { giftId: "g1", sourceRunId: "src", workspaceId: "w", userId: "u", now })).toBeNull();
    expect(f.ads).toHaveLength(1);
    expect(f.runs.size).toBe(2);
    expect(f.assets.every((a) => a.expiresAt === null)).toBe(true);
  });

  it("appends the encore ads later, after the hook ad, without duplicating", async () => {
    const f = fakeDb();
    await copyGiftToWorkspace(f.db, { giftId: "g1", sourceRunId: "src", workspaceId: "w", userId: "u", now });
    const base = source() as { ads: Array<Record<string, unknown>> } & Record<string, unknown>;
    const ready = base.ads.find((a) => a.status === "ready")!;
    f.runs.set("extra", { ...base, id: "extra", ads: [{ ...ready, id: "e0", index: 0, headline: "E0" }, { ...ready, id: "e1", index: 1, headline: "E1" }] });
    expect(await copyGiftToWorkspace(f.db, { giftId: "g1", sourceRunId: "src", extraRunId: "extra", workspaceId: "w", userId: "u", now })).toBe("gc_g1");
    expect(f.ads.map((a) => a.headline)).toEqual(["H0", "E0", "E1"]);
    expect(f.runs.get("gc_g1")).toMatchObject({ staticCount: 3 });
    expect(await copyGiftToWorkspace(f.db, { giftId: "g1", sourceRunId: "src", extraRunId: "extra", workspaceId: "w", userId: "u", now })).toBeNull();
    expect(f.ads).toHaveLength(3);
  });
});
