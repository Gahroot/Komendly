import { describe, expect, it } from "vitest";
import { syncEncoreCosts } from "../src/hook";
import type { Db } from "../src/db";

function fake(runCost: bigint, counted: bigint) {
  const gift = { id: "g", extraRunId: "r", extraCostMicros: counted };
  const lead = { id: "l", costMicros: 0n };
  const daily: bigint[] = [];
  const db = {
    adsGift: {
      findMany: async () => [{ ...gift }],
      updateMany: async ({ where, data }: { where: { extraCostMicros: bigint }; data: { extraCostMicros: bigint } }) => {
        if (where.extraCostMicros !== gift.extraCostMicros) return { count: 0 };
        gift.extraCostMicros = data.extraCostMicros;
        return { count: 1 };
      },
    },
    adRun: { findUnique: async () => ({ costMicros: runCost }) },
    adJob: { aggregate: async () => ({ _sum: { costMicros: runCost } }) },
    outboundLead: {
      findFirst: async () => ({ id: lead.id }),
      findMany: async () => [],
      update: async ({ data }: { data: { costMicros: { increment: bigint } } }) => { lead.costMicros += data.costMicros.increment; return lead; },
    },
    klyDaily: { upsert: async ({ update }: { update: { costMicros?: { increment: bigint } } }) => { daily.push(update.costMicros?.increment ?? 0n); return {}; } },
  } as unknown as Db;
  return { db, gift, lead, daily };
}

describe("syncEncoreCosts", () => {
  it("credits only the new part of the encore run's cost, once", async () => {
    const f = fake(300_000n, 100_000n);
    const now = new Date("2026-11-11T20:00:00Z");
    expect(await syncEncoreCosts(f.db, now)).toBe(1);
    expect(f.lead.costMicros).toBe(200_000n);
    expect(f.gift.extraCostMicros).toBe(300_000n);
    expect(await syncEncoreCosts(f.db, now)).toBe(0);
    expect(f.lead.costMicros).toBe(200_000n);
  });
});

import { ON_CLICK_NOTE, syncOnClickRuns } from "../src/hook";
describe("syncOnClickRuns", () => {
  it("credits the live run's cost once and points the lead at its first ad", async () => {
    const lead = { id: "L1", giftId: "G1", adId: null as string | null, costMicros: 0n, qualityNotes: ON_CLICK_NOTE };
    const gift = { id: "G1", runId: "R1", extraCostMicros: 0n };
    const made: number[] = [];
    let expiries = 0;
    const db = {
      outboundLead: {
        findMany: async () => [{ id: lead.id, giftId: lead.giftId, adId: lead.adId }],
        update: async ({ data }: { data: { costMicros: { increment: bigint } } }) => { lead.costMicros += data.costMicros.increment; return lead; },
        updateMany: async ({ data }: { data: { adId: string } }) => { if (lead.adId) return { count: 0 }; lead.adId = data.adId; return { count: 1 }; },
      },
      adsGift: {
        findUnique: async () => ({ ...gift }),
        updateMany: async ({ where, data }: { where: { extraCostMicros: bigint }; data: { extraCostMicros: bigint } }) => {
          if (where.extraCostMicros !== gift.extraCostMicros) return { count: 0 };
          gift.extraCostMicros = data.extraCostMicros;
          return { count: 1 };
        },
      },
      adRun: { findUnique: async () => ({ costMicros: 700_000n }) },
      adJob: { aggregate: async () => ({ _sum: { costMicros: 650_000n } }) },
      ad: { findFirst: async () => ({ id: "A1" }) },
      adAsset: { updateMany: async () => { expiries++; return { count: 2 }; } },
      klyDaily: { upsert: async ({ update }: { update: { giftsMade?: { increment: number } } }) => { if (update.giftsMade) made.push(update.giftsMade.increment); return {}; } },
    } as unknown as Db;
    const now = new Date("2026-11-12T12:00:00Z");
    expect(await syncOnClickRuns(db, now)).toBe(1);
    expect(lead.costMicros).toBe(700_000n);
    expect(lead.adId).toBe("A1");
    expect(made).toEqual([1]);
    expect(expiries).toBe(1);
    expect(await syncOnClickRuns(db, now)).toBe(0);
    expect(lead.costMicros).toBe(700_000n);
  });
});
