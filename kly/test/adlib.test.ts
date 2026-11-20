import { describe, expect, it } from "vitest";
import { adlibNiche, adlibSource, toAdlibPlace, type AdlibRow } from "../src/adlib";
import { isExhausted, planSources } from "../src/finder";
import { SOURCE_IDS } from "../src/sources";
import { NICHES } from "../src/targets";

const row = (o: Partial<AdlibRow> = {}): AdlibRow => ({
  page_name: "Acme Roofing", page_id: "123", page_url: "https://facebook.com/acme", website: "https://www.acmeroofing.com/free-quote?utm=fb",
  domain: "acmeroofing.com", niche: "roofing", city: "Denver", state: "CO", active_ads: 4, first_seen: "2026-11-01", search_term: "roofer", ...o,
});
const now = new Date("2026-11-20T12:00:00Z");

describe("adlib mapping", () => {
  it("maps Kly niches, slugs, Overture categories and free text to Kly niches", () => {
    for (const n of NICHES) expect(adlibNiche(n.niche), n.niche).toBe(n.niche);
    expect(adlibNiche("med-spas")).toBe("med spas");
    expect(adlibNiche("pest_control_service")).toBe("pest control");
    expect(adlibNiche("Roofing Contractor")).toBe("roofers");
    expect(adlibNiche("orthodontist")).toBe("orthodontists");
    expect(adlibNiche("cosmetic dentistry")).toBe("dentists");
    expect(adlibNiche("HVAC / heating & air")).toBe("hvac");
    expect(adlibNiche("barber shop")).toBe("barbershops");
    expect(adlibNiche("ceramic coating & paint protection")).toBe("auto detailers");
    expect(adlibNiche("car accident attorney")).toBe("personal injury lawyers");
    expect(adlibNiche("zoo")).toBeNull();
    expect(adlibNiche("")).toBeNull();
  });
  it("builds a KlyPlace from an advertiser with its own site", () => {
    expect(toAdlibPlace(row(), "adlib-2026-11-20")).toMatchObject({
      id: "adlib:123", source: "adlib", release: "adlib-2026-11-20", niche: "roofers", domain: "acmeroofing.com",
      website: "https://www.acmeroofing.com/", city: "Denver", cityKey: "denver", state: "CO", confidence: 0.7,
    });
    expect(toAdlibPlace(row({ page_id: null, niche: "", search_term: "plumber near me" }), "r")).toMatchObject({ id: "adlib:acmeroofing.com", niche: "plumbers" });
    expect(toAdlibPlace(row({ website: null }), "r")).toMatchObject({ domain: "acmeroofing.com", website: "https://acmeroofing.com/" });
    expect(toAdlibPlace(row({ active_ads: 50 }), "r")).toMatchObject({ confidence: 1 });
  });
  it("skips rows without a usable own-site domain, location, niche or name", () => {
    expect(toAdlibPlace(row({ website: null, domain: null }), "r")).toEqual({ skip: "no_domain" });
    expect(toAdlibPlace(row({ website: "https://www.facebook.com/acme", domain: "facebook.com" }), "r")).toEqual({ skip: "excluded_domain" });
    expect(toAdlibPlace(row({ website: "linktr.ee/acme", domain: null }), "r")).toEqual({ skip: "excluded_domain" });
    expect(toAdlibPlace(row({ state: "Ontario" }), "r")).toEqual({ skip: "no_location" });
    expect(toAdlibPlace(row({ state: "new york", city: "Buffalo" }), "r")).toMatchObject({ state: "NY", cityKey: "buffalo" });
    expect(toAdlibPlace(row({ city: "" }), "r")).toEqual({ skip: "no_location" });
    expect(toAdlibPlace(row({ niche: "zoo", search_term: "zoo" }), "r")).toEqual({ skip: "no_niche" });
    expect(toAdlibPlace(row({ page_name: " " }), "r")).toEqual({ skip: "no_name" });
  });
});

describe("adlib priority", () => {
  const y = (source: string, city: string, runs: number, leads: number, dry = 0) => ({ source, city, runs, leads, dry, lastRunAt: now });
  it("is an enumerated source", () => {
    expect(SOURCE_IDS).toContain("adlib");
  });
  it("runs before every other source, whatever their yields, and never exhausts", () => {
    const all = [...SOURCE_IDS];
    expect(planSources(all, [], "Denver, CO", now)[0]).toBe("adlib");
    const rows = [y("adlib", "Denver, CO", 9, 0, 9), y("overture", "Denver, CO", 2, 40), y("osm", "Austin, TX", 2, 30)];
    expect(planSources(["overture", "osm", "adlib"], rows, "Denver, CO", now)).toEqual(["adlib", "overture", "osm"]);
    expect(isExhausted({ source: "adlib", dry: 50, lastRunAt: now }, now)).toBe(false);
    expect(planSources(["osm", "overture"], [], "Denver, CO", now)).toEqual(["osm", "overture"]);
  });
  it("hands out the city's adlib places first, then the niche's elsewhere, tagged source adlib", async () => {
    const queries: Record<string, unknown>[] = [];
    const used: string[][] = [];
    const db = {
      klyPlace: {
        findMany: async (q: { where: Record<string, unknown> }) => {
          queries.push(q.where);
          return queries.length === 1
            ? [{ id: "adlib:1", name: "A", website: "https://a.com/", phone: null, city: "Denver", state: "CO", lon: null }]
            : [{ id: "adlib:2", name: "B", website: "https://b.com/", phone: null, city: "Austin", state: "TX", lon: null }];
        },
        updateMany: async (q: { where: { id: { in: string[] } } }) => { used.push(q.where.id.in); return { count: 2 }; },
      },
    };
    const out = await adlibSource.find("roofers", "Denver, CO", { db, rt: { now: () => now.getTime() } } as never);
    expect(queries[0]).toMatchObject({ source: "adlib", niche: "roofers", cityKey: "denver", state: "CO", usedAt: null });
    expect(queries[1]).toMatchObject({ source: "adlib", niche: "roofers", usedAt: null, id: { notIn: ["adlib:1"] } });
    expect(queries[1]).not.toHaveProperty("cityKey");
    expect(out.map((c) => [c.website, c.city, c.source])).toEqual([["https://a.com/", "Denver", "adlib"], ["https://b.com/", "Austin", "adlib"]]);
    expect(used).toEqual([["adlib:1", "adlib:2"]]);
  });
});

describe("adlibSegment (warm leads first)", () => {
  const { adlibSegment } = await_import();
  function await_import() { return { adlibSegment: async (...a: Parameters<typeof import("../src/loop").adlibSegment>) => (await import("../src/loop")).adlibSegment(...a) }; }
  const arms = [
    { id: "a1", dimension: "segment", status: "active", content: { niche: "med spas", cities: ["X, TX"] } },
    { id: "a2", dimension: "segment", status: "active", content: { niche: "roofers", cities: ["Y, TX"] } },
  ];
  const places = [
    { niche: "med spas", city: "Austin", state: "TX" }, { niche: "med spas", city: "Dallas", state: "TX" }, { niche: "med spas", city: "Austin", state: "TX" },
    { niche: "roofers", city: "Tulsa", state: "OK" }, { niche: "no arm niche", city: "Reno", state: "NV" }, { niche: "no arm niche", city: "Reno", state: "NV" }, { niche: "no arm niche", city: "Reno", state: "NV" }, { niche: "no arm niche", city: "Reno", state: "NV" },
  ];
  const db = {
    klyPlace: {
      groupBy: async () => Object.entries(places.reduce<Record<string, number>>((m, p) => ((m[p.niche] = (m[p.niche] ?? 0) + 1), m), {})).map(([niche, n]) => ({ niche, _count: { _all: n } })),
      findMany: async ({ where }: { where: { niche: string } }) => places.filter((p) => p.niche === where.niche),
    },
    klyArm: { findMany: async () => arms },
  } as never;
  it("picks the biggest backlog niche that has an arm, with the places' own cities", async () => {
    const r = await adlibSegment(db, () => 0);
    expect(r?.arm.id).toBe("a1");
    expect(new Set(r?.cities)).toEqual(new Set(["Austin, TX", "Dallas, TX"]));
  });
  it("returns null when nothing waits", async () => {
    const empty = { klyPlace: { groupBy: async () => [], findMany: async () => [] }, klyArm: { findMany: async () => arms } } as never;
    expect(await adlibSegment(empty, () => 0)).toBeNull();
  });
});
