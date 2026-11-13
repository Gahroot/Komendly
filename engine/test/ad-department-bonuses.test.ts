import { describe, expect, it } from "vitest";
import { generateAdPlan, generateHookLibrary } from "../src/bonuses/job";
import type { AIProvider, TextRequest } from "../src/providers/types";

const LEVELS = ["problem_aware", "solution_aware", "offer"] as const;
const brand = { name: "Bakery", url: "https://example.com", audience: "busy parents", mainOffer: "Bread by 7am", voice: null, pains: ["stale bread"], proof: [], facts: ["Delivered by 7am"] };
const ads = ["a1", "a2", "a3", "a4"].map((id, i) => ({ id, headline: `Ad ${i}`, hook: "h", body: null, angle: "angle", awareness: "problem_aware", createdAt: "2026-11-01T00:00:00Z" }));

function mock(outputs: unknown[]): AIProvider & { calls: TextRequest[] } {
  const calls: TextRequest[] = [];
  return {
    name: "codex",
    calls,
    async text(req) {
      calls.push(req);
      return { text: "", json: outputs[Math.min(calls.length - 1, outputs.length - 1)], usage: { costMicros: 10, latencyMs: 1 } };
    },
    async image() {
      throw new Error("no images");
    },
    async health() {
      return { ok: true };
    },
  };
}

const plan = (ids: string[]) => ({ summary: "Start with the worry, end with the offer.", rules: ["Leave each ad alone 3 days.", "Max $20 a day."], weeks: ids.map((adId, i) => ({ week: i + 1, adId, adHeadline: "x", why: "It speaks to the worry.", dailyBudgetUsd: 12, primaryText: "Tired of stale bread? Try ours.", headline: "Bread by 7am", judgeWhen: "After 4 days and $50 spent." })) });

describe("Ad Department bonus generators (mocked provider)", () => {
  it("ad plan: asks once more when the model invents an ad id, then uses real headlines", async () => {
    const p = mock([plan(["a1", "a2", "nope", "a4"]), plan(["a1", "a2", "a3", "a4"])]);
    const out = await generateAdPlan(p, brand, ads, new Date("2026-11-11T00:00:00Z"), []);
    expect(p.calls).toHaveLength(2);
    expect(p.calls[0]?.reasoning).toBe("high");
    expect(p.calls[1]?.prompt).toContain("nope");
    expect(out.weeks.map((w) => w.adHeadline)).toEqual(["Ad 0", "Ad 1", "Ad 2", "Ad 3"]);
  });
  it("hook library: repairs an invalid answer, validates counts", async () => {
    const good = { industry: "Bakery", offer: "Bread by 7am", hooks: Array.from({ length: 40 }, (_, i) => ({ level: LEVELS[i % 3], text: `Hook ${i}` })), captions: Array.from({ length: 20 }, (_, i) => ({ level: LEVELS[i % 3], text: `Caption ${i}` })) };
    const p = mock([{ ...good, hooks: good.hooks.slice(0, 10) }, good]);
    const out = await generateHookLibrary(p, brand, []);
    expect(p.calls).toHaveLength(2);
    expect(out.hooks).toHaveLength(40);
    expect(p.calls[0]?.jsonSchema).toBeTruthy();
  });
  it("hook library: gives up after the repair attempt", async () => {
    await expect(generateHookLibrary(mock([{ nope: true }]), brand, [])).rejects.toThrow(/did not match/);
  });
});
