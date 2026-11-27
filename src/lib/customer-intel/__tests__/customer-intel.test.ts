import { describe, expect, it } from "vitest";
import { buildMemory, formatPromptContext, mergeFacts, parseMemory, stripPii, PROMPT_CONTEXT_MAX_CHARS, type Fact } from "../memory";
import { learnGuidance, leadsWithOffer, weeklyLearned, MIN_SAMPLE, type AdSignal } from "../learning";
import { nextBestAction } from "../next-action";
import { clientRows, dueForDrop, exportFileName, planBulkDrop, weekKey, type ClientRow } from "../agency";
import { getCustomerMemory, purgeCustomerMemory, saveCustomerMemory } from "../server";
import { getSystem } from "@/lib/growth/systems";

const now = new Date("2026-11-26T12:00:00Z");
const ad = (headline: string, kept: boolean): AdSignal => ({ headline, downloaded: kept, hasOffer: leadsWithOffer(headline) });

describe("customer memory", () => {
  it("builds facts with provenance; customer edits outrank scraped facts", () => {
    const m = buildMemory({ workspaceId: "w1", brandId: "b1", now, trade: "roofing", brand: { name: "Acme Roofing", mainOffer: "Free roof inspection", audience: "Homeowners", editedFields: ["mainOffer"], sourceUrl: "https://acme.test", services: ["Roof repair"], colors: ["#fff"] } });
    const offer = m.facts.find((f) => f.key === "offer")!;
    expect(offer).toMatchObject({ source: "customer_edit", confidence: 0.95, ref: "https://acme.test" });
    expect(m.facts.find((f) => f.key === "audience")!.source).toBe("website");
    expect(m.version).toBe(1);
    expect(buildMemory({ workspaceId: "w1", now }, m).version).toBe(2);
  });
  it("strips emails and phone numbers", () => {
    expect(stripPii("call +1 (512) 555-0199 or bob@acme.com")).toBe("call [number] or [email]");
  });
  it("merge: higher confidence wins, newer on ties", () => {
    const a: Fact = { key: "k", value: "old", source: "website", confidence: 0.65, at: "2026-01-01" };
    const b: Fact = { key: "k", value: "new", source: "website", confidence: 0.65, at: "2026-02-01" };
    const c: Fact = { key: "k", value: "edited", source: "customer_edit", confidence: 0.95, at: "2025-01-01" };
    expect(mergeFacts([a], [b])[0].value).toBe("new");
    expect(mergeFacts([c], [b])[0].value).toBe("edited");
  });
  it("prompt context is strictly capped and empty when nothing is known", () => {
    expect(formatPromptContext(null)).toBe("");
    const m = buildMemory({ workspaceId: "w1", now, brand: { mainOffer: "x".repeat(230), audience: "y".repeat(230), voice: "z".repeat(230), services: Array.from({ length: 8 }, (_, i) => "service number " + "s".repeat(50) + i) } });
    const out = formatPromptContext(m);
    expect(out.length).toBeLessThanOrEqual(PROMPT_CONTEXT_MAX_CHARS);
    expect(out.startsWith("BUSINESS MEMORY")).toBe(true);
    expect(formatPromptContext(buildMemory({ workspaceId: "w1", now }))).toBe("");
  });
  it("parseMemory rejects garbage and old versions", () => {
    expect(parseMemory(null)).toBeNull();
    expect(parseMemory({ v: 0 })).toBeNull();
    expect(parseMemory(buildMemory({ workspaceId: "w", now }))).not.toBeNull();
  });
});

describe("self-learning", () => {
  it("says nothing under the minimum sample", () => {
    expect(learnGuidance([ad("Short one", true), ad("Another short", false)]).guidance).toEqual([]);
    expect(MIN_SAMPLE).toBeGreaterThan(2);
  });
  it("finds a short-headline preference only when both groups exist and the gap is clear", () => {
    const ads = [
      ...[1, 2, 3, 4].map((i) => ad(`Roof leak ${i}`, true)),
      ...[1, 2, 3, 4].map((i) => ad(`Why every homeowner in the county trusts our crew with leak ${i}`, false)),
    ];
    const r = learnGuidance(ads);
    expect(r.guidance.find((g) => g.id === "short_headlines")).toMatchObject({ n: 8, strength: "weak" }); // small sample: recorded, never prompted
    const more = [...ads, ...[5, 6].map((i) => ad(`Roof leak ${i}`, true)), ...[5, 6].map((i) => ad(`Why every homeowner in the county trusts our crew with leak ${i}`, false))];
    expect(learnGuidance(more).guidance.find((g) => g.id === "short_headlines")!.strength).toBe("moderate");
    // all one group: no comparison
    expect(learnGuidance([1, 2, 3, 4, 5, 6].map((i) => ad(`Short ${i}`, i % 2 === 0))).guidance.find((g) => g.id === "short_headlines")).toBeUndefined();
  });
  it("detects offer-led preference", () => {
    const ads = [...[1, 2, 3].map((i) => ad(`Free inspection ${i}`, true)), ...[1, 2, 3].map((i) => ad(`We care about your home ${i} and the neighbours`, false))];
    expect(learnGuidance(ads).guidance.map((g) => g.id)).toContain("offer_led");
  });
  it("weak guidance never reaches the prompt; weekly record has measured facts only", () => {
    const ads = [...[1, 2, 3].map((i) => ad(`Free inspection ${i}`, true)), ...[1, 2, 3].map((i) => ad(`We care about your home ${i} and the neighbours`, false))];
    const m = buildMemory({ workspaceId: "w", now, ads, brand: { mainOffer: "Free inspection" } });
    expect(m.guidance.every((g) => g.strength === "weak")).toBe(true);
    expect(formatPromptContext(m)).not.toContain("own choices");
    expect(weeklyLearned({ guidance: [], sampleSize: 0, kept: 0, made: 0 })).toMatchObject({ lines: [], measured: false });
    const w = weeklyLearned({ guidance: [], sampleSize: 8, kept: 3, made: 10, performance: { spendUsd: 120, leads: 4, days: 7 } });
    expect(w.lines.join(" ")).toContain("kept 3 of 10");
    expect(w.lines.join(" ")).toContain("Meta measured 4 leads");
  });
});

describe("next best action", () => {
  it("walks the journey with exactly one step each", () => {
    expect(nextBestAction({ paid: false, runStatus: null }).id).toBe("make_first_pack");
    expect(nextBestAction({ paid: false, runStatus: "generating" }).id).toBe("wait_pack");
    expect(nextBestAction({ paid: false, runStatus: "completed", readyAds: 10 }).id).toBe("download_first");
    expect(nextBestAction({ paid: false, runStatus: "completed", downloaded: true }).id).toBe("unlock_more");
    expect(nextBestAction({ paid: true, runStatus: "completed", readyAds: 5, downloaded: true }).id).toBe("connect_meta");
    expect(nextBestAction({ paid: true, runStatus: "completed", downloaded: true, metaConnected: true }).id).toBe("go_live");
    expect(nextBestAction({ paid: true, runStatus: "completed", downloaded: true, metaConnected: true, adsLive: true, credits: 1, dropCost: 15 }).id).toBe("top_up");
    expect(nextBestAction({ paid: true, runStatus: "completed", downloaded: true, metaConnected: true, adsLive: true, credits: 99, dropCost: 15, daysSinceLastPack: 8 }).id).toBe("fresh_drop");
    expect(nextBestAction({ paid: true, runStatus: "failed" }).id).toBe("retry_pack");
    expect(nextBestAction({ paid: true, runStatus: "completed", changesRequested: true }).id).toBe("apply_changes");
  });
  it("never promises results", () => {
    for (const s of [{ paid: false }, { paid: true, runStatus: "completed", metaConnected: true, adsLive: true }] as const) {
      const a = nextBestAction(s);
      expect(`${a.title} ${a.body}`).not.toMatch(/guarantee|more (leads|sales)|double|\d+x/i);
    }
  });
});

describe("agency rules", () => {
  const row = (id: string, over: Partial<ClientRow> = {}): ClientRow => ({ brandId: id, name: id, domain: `${id}.test`, latestRun: { id: `r${id}`, status: "completed", createdAt: "2026-11-16T00:00:00Z", readyAds: 5, creditsCharged: 15 }, approval: "none", creditsUsed30d: 15, adsLive: false, metaConnected: false, ...over });
  it("flags clients due for a drop and skips busy ones", () => {
    const rows = clientRows([row("a"), row("b", { latestRun: { id: "x", status: "generating", createdAt: "2026-11-10T00:00:00Z", readyAds: 0, creditsCharged: 0 } }), row("c", { latestRun: null }), row("d", { latestRun: { id: "y", status: "completed", createdAt: "2026-11-25T00:00:00Z", readyAds: 5, creditsCharged: 15 } })], now, { credits: 500, dropCost: 15 });
    expect(dueForDrop(rows)).toEqual(["a", "c"]);
    expect(rows[2].next.id).toBe("make_first_pack");
  });
  it("bulk plan dedupes, ignores foreign ids, caps and checks the pool", () => {
    const valid = new Set(["a", "b", "c"]);
    expect(planBulkDrop({ selected: ["a", "a", "zzz"], valid, perRunCost: 15, credits: 100, unlimited: false })).toEqual({ ok: true, brandIds: ["a"], cost: 15 });
    expect(planBulkDrop({ selected: ["a", "b"], valid, perRunCost: 15, credits: 20, unlimited: false })).toMatchObject({ ok: false, cost: 30 });
    expect(planBulkDrop({ selected: ["a", "b"], valid, perRunCost: 15, credits: 0, unlimited: true })).toMatchObject({ ok: true, cost: 0 });
    expect(planBulkDrop({ selected: ["zzz"], valid, perRunCost: 15, credits: 100, unlimited: false }).ok).toBe(false);
    expect(planBulkDrop({ selected: Array.from({ length: 11 }, (_, i) => `i${i}`), valid: new Set(Array.from({ length: 11 }, (_, i) => `i${i}`)), perRunCost: 1, credits: 100, unlimited: false }).ok).toBe(false);
  });
  it("week key and export names", () => {
    expect(weekKey(new Date("2026-11-26T00:00:00Z"))).toBe("2026-W48");
    expect(weekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(exportFileName("Acme Roofing & Sons!", "2026-W48", 3, "4:5")).toBe("acme-roofing-sons_2026-w48_03-4x5.png");
    expect(exportFileName("Acme", "2026-W48", 1, "1:1")).not.toMatch(/komendly/i);
  });
});

describe("storage isolation + deletion (fake db)", () => {
  function fakeDb() {
    const rows: { id: string; name: string; workspaceId: string; props: Record<string, unknown> }[] = [];
    let n = 0;
    return {
      rows,
      adsEvent: {
        findFirst: async ({ where }: { where: { name: string; workspaceId: string; props?: { path: string[]; equals: unknown } } }) =>
          rows.filter((r) => r.name === where.name && r.workspaceId === where.workspaceId && (!where.props || r.props[where.props.path[0]] === where.props.equals)).at(-1) ?? null,
        create: async ({ data }: { data: { name: string; workspaceId: string; props: Record<string, unknown> } }) => { rows.push({ id: String(++n), ...data }); },
        update: async ({ where, data }: { where: { id: string }; data: { props: Record<string, unknown> } }) => { rows.find((r) => r.id === where.id)!.props = data.props; },
        deleteMany: async ({ where }: { where: { workspaceId: string; name: { in: string[] } } }) => {
          const keep = rows.filter((r) => !(r.workspaceId === where.workspaceId && where.name.in.includes(r.name)));
          const count = rows.length - keep.length; rows.length = 0; rows.push(...keep); return { count };
        },
      },
    };
  }
  it("latest wins in place, never leaks across workspaces, purge removes only that workspace", async () => {
    const db = fakeDb();
    await saveCustomerMemory(db, buildMemory({ workspaceId: "w1", brandId: "b", now, brand: { name: "One" } }));
    await saveCustomerMemory(db, buildMemory({ workspaceId: "w1", brandId: "b", now, brand: { name: "One v2" } }));
    await saveCustomerMemory(db, buildMemory({ workspaceId: "w2", brandId: "b", now, brand: { name: "Two" } }));
    expect(db.rows.filter((r) => r.workspaceId === "w1")).toHaveLength(1);
    expect((await getCustomerMemory(db, "w1", "b"))!.facts.find((f) => f.key === "business")!.value).toBe("One v2");
    expect((await getCustomerMemory(db, "w2", "b"))!.facts.find((f) => f.key === "business")!.value).toBe("Two");
    expect(await purgeCustomerMemory(db, "w1")).toBe(1);
    expect(await getCustomerMemory(db, "w1", "b")).toBeNull();
    expect(await getCustomerMemory(db, "w2", "b")).not.toBeNull();
  });
});

describe("flags", () => {
  it("registered, additive", () => {
    for (const k of ["customer_memory", "agency_ops", "simplicity"]) expect(getSystem(k)?.utmSource).toBeTruthy();
  });
});
