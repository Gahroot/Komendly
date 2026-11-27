import { describe, expect, it } from "vitest";
import { formatStyleContext, MEMORY_VERSION, type CustomerMemory } from "../../src/lib/customer-intel/memory";
import { memoryArm, memoryPromptForRun } from "../src/customerintel/hook";

const mem = (): CustomerMemory => ({ v: MEMORY_VERSION, version: 1, workspaceId: "w1", brandId: null, updatedAt: "2026-11-26", sampleSize: 9, facts: [
  { key: "tone", value: "plain, friendly", source: "brand_kit", confidence: 0.9, at: "2026-11-26" },
  { key: "offer", value: "Free roof inspection", source: "website", confidence: 0.9, at: "2026-11-26" },
  { key: "service:roof repair", value: "Roof repair", source: "website", confidence: 0.9, at: "2026-11-26" },
], guidance: [{ text: "Offer-led headlines get kept more", strength: "strong" } as never] });

describe("customer memory in the planner (style-only, A/B-guarded, default OFF)", () => {
  it("style block never carries offer/services/areas", () => {
    const s = formatStyleContext(mem());
    expect(s).toContain("Tone: plain, friendly");
    expect(s).toContain("Offer-led headlines");
    expect(s).not.toMatch(/Free roof inspection|Roof repair|Services|Areas/);
  });
  it("arm is deterministic and roughly balanced", () => {
    expect(memoryArm("abc")).toBe(memoryArm("abc"));
    const arms = Array.from({ length: 200 }, (_, i) => memoryArm(`run${i}x`));
    const t = arms.filter((a) => a === "treatment").length;
    expect(t).toBeGreaterThan(60); expect(t).toBeLessThan(140);
  });
  it("returns '' and writes nothing when the planner flag is off", async () => {
    const writes: unknown[] = [];
    const db = { adsFeatureFlag: { findUnique: async ({ where }: { where: { key: string } }) => ({ enabled: where.key === "sys_customer_memory" }) }, adsEvent: { findFirst: async () => null, create: async (a: unknown) => { writes.push(a); } } };
    expect(await memoryPromptForRun(db as never, { id: "r", workspaceId: "w1" })).toBe("");
    expect(writes).toHaveLength(0);
  });
  it("holdout arm gets '' but is logged; treatment gets the block", async () => {
    const events: Array<{ data: { props: { arm: string; injected: boolean } } }> = [];
    const row = { props: { memory: mem(), brandId: null } };
    const db = { adsFeatureFlag: { findUnique: async () => ({ enabled: true }) }, adsEvent: { findFirst: async (a: { where: { name: string } }) => (a.where.name === "customer_memory" ? row : null), create: async (a: never) => { events.push(a); } } };
    const ids = Array.from({ length: 12 }, (_, i) => `run-${i}`);
    const out = await Promise.all(ids.map((id) => memoryPromptForRun(db as never, { id, workspaceId: "w1" })));
    ids.forEach((id, i) => expect(Boolean(out[i])).toBe(memoryArm(id) === "treatment"));
    expect(events).toHaveLength(12);
  });
});
