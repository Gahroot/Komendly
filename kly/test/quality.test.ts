import { describe, expect, it } from "vitest";
import { syncLeadAds } from "../src/hook";
import { afterReject, qualityGate, type Verdict } from "../src/quality";
import { fakeDb, scriptedProvider } from "./fakes";

const ok: Verdict = { score: 8, brandCorrect: true, textLegible: true, typos: false, brokenLayout: false, inventedClaims: false, wrongIndustry: false, notes: "clean" };
const now = new Date("2026-11-10T12:00:00Z");

describe("quality gate", () => {
  it("passes a good ad and fails on score or any defect", () => {
    expect(qualityGate(ok, 7).pass).toBe(true);
    expect(qualityGate({ ...ok, score: 6 }, 7).pass).toBe(false);
    const typo = qualityGate({ ...ok, typos: true, score: 9 }, 7);
    expect(typo.pass).toBe(false);
    expect(typo.notes).toMatch(/typos/);
  });
  it("regenerates once, then drops", () => {
    expect(afterReject(1)).toBe("regenerate");
    expect(afterReject(2)).toBe("drop");
  });
});

function world(giftAttempts: number) {
  const lead = { id: "L1", status: "found", giftId: "G1", giftToken: "tok", giftAttempts, adId: null, businessName: "Acme", niche: "roofers", city: "Denver", website: "https://acme.com" };
  return fakeDb({
    outboundLead: { findMany: () => [lead] },
    adsGift: { findUnique: () => ({ id: "G1", status: "ready", runId: "R1", createdAt: now, costMicros: 0n }), updateMany: () => ({ count: 1 }) },
    ad: { findFirst: () => ({ id: "AD1" }) },
    adAsset: { findMany: () => [{ id: "AS1", ratio: "1:1" }] },
  });
}

const run = (f: ReturnType<typeof fakeDb>, verdict: Verdict) =>
  syncLeadAds({ db: f.db, provider: scriptedProvider([verdict]), base: "https://x", minQualityScore: 7, followUpDays: 4, fetchImage: async () => ({ mediaType: "image/png", base64: "AA" }), now: () => now });

describe("syncLeadAds judge", () => {
  it("marks a good ad as made", async () => {
    const f = world(1);
    expect(await run(f, ok)).toMatchObject({ made: 1 });
    expect(f.of("outboundLead", "update")).toContainEqual(expect.objectContaining({ data: expect.objectContaining({ status: "ad_made", adId: "AD1", qualityScore: 8 }) }));
  });
  it("first weak ad goes back to the gift queue", async () => {
    const f = world(1);
    expect(await run(f, { ...ok, score: 4 })).toMatchObject({ retried: 1, made: 0 });
    expect(f.of("outboundLead", "update")).toContainEqual(expect.objectContaining({ data: expect.objectContaining({ status: "found", giftId: null }) }));
  });
  it("second weak ad is dropped", async () => {
    const f = world(2);
    expect(await run(f, { ...ok, score: 4 })).toMatchObject({ rejected: 1, retried: 0 });
    expect(f.of("outboundLead", "update")).toContainEqual(expect.objectContaining({ data: { status: "failed", error: "quality" } }));
  });
});
