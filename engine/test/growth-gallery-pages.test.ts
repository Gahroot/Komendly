import { describe, expect, it } from "vitest";
import { galleryPagesCycle } from "../src/growth/industry-examples";
import type { AIProvider } from "../src/providers/types";

const usage = { costMicros: 0, latencyMs: 1 };
function seqProvider(outs: unknown[]): AIProvider & { calls: number } {
  const p = { calls: 0, name: "codex" as const, text: async () => { const json = outs[Math.min(p.calls++, outs.length - 1)]; return { text: JSON.stringify(json), json, usage }; }, image: async () => { throw new Error("no"); }, health: async () => ({ ok: true }) };
  return p as never;
}
const sample = (business: string, w: string) => ({ business, city: "Leeds", headline: `${w} deal`, primaryText: `${w} story for locals who need it this week. Book now.`, hook: `${w} hook?`, offer: `${w} offer`, cta: "Book now", angle: `${w} angle works.` });
const content = (w: string) => ({ intro: `${w} intro words that are unique to this page and long enough to pass.`, whatWorks: [1, 2, 3].map((n) => ({ title: `${w} tip ${n}`, detail: `${w} detail number ${n} for this exact page.` })), samples: ["A", "B", "C"].map((b) => sample(`${w} ${b}`, w)) });

function fakeDb(existing: Array<{ key: string; generatedAt: Date; content: unknown }>) {
  const upserts: string[] = [];
  return { upserts, db: { galleryPage: { findMany: async () => existing, upsert: async (a: { where: { key: string } }) => { upserts.push(a.where.key); return {}; }, updateMany: async () => ({ count: 1 }) } } };
}
const other = { intro: "Completely different opening about bakeries in winter and how warm bread sells itself to commuters.", whatWorks: [["Morning photos", "Shoot loaves at sunrise on the counter by the window."], ["Name the street", "Mention the high street so walkers know where to stop."], ["Price it", "Show the loaf price so nobody has to ask."]].map(([title, detail]) => ({ title, detail })), samples: [["Rye Co", "Sourdough Saturdays"], ["Crumb Corner", "Cinnamon buns at seven"], ["Oven Door", "Pies for the match"]].map(([business, headline]) => ({ business, city: "York", headline, primaryText: `${headline} at ${business}. Pop in before work and grab one warm. Order ahead online.`, hook: `Fancy ${String(headline).toLowerCase()}?`, offer: "Free coffee", cta: "Order", angle: "Time and place make it real." })) };
const okFetch = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
const now = new Date("2026-11-18T12:00:00Z");

describe("gallery pages engine", () => {
  it("writes the first page keys within the per-cycle cap", async () => {
    const { db, upserts } = fakeDb([]);
    const r = await galleryPagesCycle(db as never, seqProvider([content("alpha")]), now, { GALLERY_PAGES_PER_CYCLE: "1" }, "gpt-6.1-sol", okFetch);
    expect(r).toEqual({ written: 1, errors: [] });
    expect(upserts).toEqual(["platform:google-search"]);
  });
  it("respects the daily cap", async () => {
    const { db, upserts } = fakeDb([{ key: "platform:facebook", generatedAt: new Date("2026-11-18T08:00:00Z"), content: content("x") }]);
    const r = await galleryPagesCycle(db as never, seqProvider([content("alpha")]), now, { GALLERY_PAGES_DAILY_CAP: "1" }, "m", okFetch);
    expect(r.written).toBe(0);
    expect(upserts).toEqual([]);
  });
  it("regenerates a near-duplicate of a sibling once, then rejects", async () => {
    const sib = { key: "platform:facebook", generatedAt: new Date("2026-01-01T00:00:00Z"), content: content("same") };
    const a = fakeDb([sib]);
    const p = seqProvider([content("same"), other]);
    const r = await galleryPagesCycle(a.db as never, p, now, { GALLERY_PAGES_PER_CYCLE: "1", GALLERY_PAGES_REFRESH_DAYS: "999" }, "m", okFetch);
    expect(r).toEqual({ written: 1, errors: [] });
    expect(p.calls).toBe(2);
    const b = fakeDb([sib]);
    const r2 = await galleryPagesCycle(b.db as never, seqProvider([content("same")]), now, { GALLERY_PAGES_PER_CYCLE: "1", GALLERY_PAGES_REFRESH_DAYS: "999" }, "m", okFetch);
    expect(r2.written).toBe(0);
    expect(r2.errors[0]).toMatch(/near-duplicate of platform:facebook/);
  });
});
