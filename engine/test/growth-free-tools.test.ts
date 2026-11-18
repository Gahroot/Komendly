import { describe, expect, it } from "vitest";
import { claimToolJobs, runToolJob } from "../src/growth/free-tools";
import { industryExamplesCycle, pingIndexNow } from "../src/growth/industry-examples";
import type { AIProvider } from "../src/providers/types";

const usage = { costMicros: 0, latencyMs: 1 };
function fakeProvider(json: unknown): AIProvider {
  return { name: "codex", text: async () => ({ text: JSON.stringify(json), json, usage }), image: async () => { throw new Error("no"); }, health: async () => ({ ok: true }) };
}

describe("free tools engine", () => {
  it("claims with FOR UPDATE SKIP LOCKED and a limit", async () => {
    let sql = "";
    let values: unknown[] = [];
    const db = { $queryRaw: async (s: TemplateStringsArray, ...v: unknown[]) => { sql = s.join("?"); values = v; return [{ id: "j1", tool: "review-to-ad", input: {} }]; } };
    const jobs = await claimToolJobs(db as never, "w1", 4);
    expect(jobs).toHaveLength(1);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("status = 'queued'");
    expect(values).toContain("w1");
    expect(values).toContain(4);
  });
  it("runs a job through the provider and validates output", async () => {
    const out = { headlines: ["Fresh bread by 7am", "Sourdough, done right", "Cakes for any day"], primaryTexts: ["Warm loaves every morning. Order now.", "Custom cakes in 48 hours. Book today."], hooks: ["Still buying sliced bread?", "Need a cake by Friday?"] };
    await expect(runToolJob(fakeProvider(out), { id: "1", tool: "ad-headline-generator", input: { business: "Bakery in Leeds with sourdough" } })).resolves.toEqual(out);
    await expect(runToolJob(fakeProvider({}), { id: "1", tool: "nope", input: {} })).rejects.toThrow();
  });
});

describe("industry examples engine", () => {
  it("writes valid content for picked industries and pings IndexNow", async () => {
    const sample = (business: string) => ({ business, city: "Leeds", headline: "Fresh bread by 7am", primaryText: "Warm sourdough before work. Order online and pick up.", hook: "Still buying sliced bread?", offer: "Free coffee with a loaf", cta: "Order now", angle: "Specific time plus a small offer." });
    const content = { intro: "Bakery ads work when they show food up close and give a reason to visit this week.", whatWorks: [1, 2, 3].map((n) => ({ title: `Tip ${n}`, detail: "Show the product up close in natural light." })), samples: [sample("Rye Co"), sample("Crumb Corner"), sample("Oven Door")] };
    const upserts: string[] = [];
    let marked = 0;
    const db = {
      industryExample: {
        findMany: async () => [],
        upsert: async (a: { where: { industry: string } }) => { upserts.push(a.where.industry); return {}; },
        updateMany: async () => { marked++; return { count: 1 }; },
      },
    };
    let pinged: string[] = [];
    const fetchFn = (async (_u: string, init: { body: string }) => { pinged = JSON.parse(init.body).urlList; return { ok: true, status: 200 }; }) as unknown as typeof fetch;
    const r = await industryExamplesCycle(db as never, fakeProvider(content), new Date(), { INDUSTRY_EXAMPLES_PER_CYCLE: "2" }, "gpt-6.2-sol", fetchFn);
    expect(r.errors).toEqual([]);
    expect(r.written).toBe(2);
    expect(upserts).toEqual(["bakeries", "coffee-shops"]);
    expect(pinged).toContain("https://www.komendly.com/ad-examples/bakeries");
    expect(marked).toBe(1);
    expect(await pingIndexNow([])).toBe(true);
  });
});
