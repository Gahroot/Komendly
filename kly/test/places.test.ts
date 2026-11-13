import { describe, expect, it } from "vitest";
import { NICHES } from "../src/targets";
import { categoryToNiche, cityKey, dedupeByDomain, OVERTURE_CATEGORIES, overtureSource, toKlyPlace, type OverturePlaceRow } from "../src/places";

const row = (o: Partial<OverturePlaceRow> = {}): OverturePlaceRow => ({
  id: "p1", name: "Acme Roofing", websites: ["acmeroofing.com"], phones: ["(303) 296-4100"], city: "Denver", state: "CO", postcode: "80202",
  category: OVERTURE_CATEGORIES["roofers"]?.[0] ?? "roofing", confidence: 0.9, status: "open", lon: -104.99, lat: 39.74, ...o,
});

describe("Overture places", () => {
  it("maps every catalog niche to at least one Overture category, with no category claimed twice", () => {
    for (const n of NICHES) expect(OVERTURE_CATEGORIES[n.niche]?.length ?? 0, n.niche).toBeGreaterThan(0);
    const all = Object.values(OVERTURE_CATEGORIES).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(categoryToNiche().get(OVERTURE_CATEGORIES["roofers"]![0]!)).toBe("roofers");
  });
  it("keeps open US businesses with their own website", () => {
    const p = toKlyPlace(row(), categoryToNiche(), "r1");
    expect(p).toMatchObject({ niche: "roofers", website: "https://acmeroofing.com", domain: "acmeroofing.com", state: "CO", cityKey: "denver", phone: "+13032964100" });
  });
  it("drops closed, low-confidence, non-US, uncatalogued and website-less places", () => {
    const m = categoryToNiche();
    expect(toKlyPlace(row({ status: "permanently_closed" }), m, "r")).toBeNull();
    expect(toKlyPlace(row({ confidence: 0.2 }), m, "r")).toBeNull();
    expect(toKlyPlace(row({ state: "Ontario" }), m, "r")).toBeNull();
    expect(toKlyPlace(row({ category: "zoo" }), m, "r")).toBeNull();
    expect(toKlyPlace(row({ websites: [] }), m, "r")).toBeNull();
    expect(toKlyPlace(row({ websites: null }), m, "r")).toBeNull();
  });
  it("skips directory / social sites and takes the business's own site", () => {
    const p = toKlyPlace(row({ websites: ["https://www.facebook.com/acme", "https://www.yelp.com/biz/acme", "acme-roofing.com"] }), categoryToNiche(), "r");
    expect(p?.domain).toBe("acme-roofing.com");
    expect(toKlyPlace(row({ websites: ["https://www.facebook.com/acme"] }), categoryToNiche(), "r")).toBeNull();
  });
  it("keeps one place per domain, the most confident", () => {
    const m = categoryToNiche();
    const a = toKlyPlace(row({ id: "a", confidence: 0.6 }), m, "r")!;
    const b = toKlyPlace(row({ id: "b", confidence: 0.95, city: "Aurora" }), m, "r")!;
    const c = toKlyPlace(row({ id: "c", websites: ["other.com"] }), m, "r")!;
    const out = dedupeByDomain([a, b, c]);
    expect(out.map((x) => x.id).sort()).toEqual(["b", "c"]);
  });
  it("normalises city keys", () => {
    expect(cityKey("  Saint   Louis ")).toBe("st. louis");
  });
  it("the source hands out unused rows once and marks them used", async () => {
    const used: string[][] = [];
    const db = {
      klyPlace: {
        findMany: async (q: { where: { niche: string; cityKey: string; state?: string; usedAt: null } }) => {
          expect(q.where).toMatchObject({ niche: "roofers", cityKey: "denver", state: "CO", usedAt: null });
          return [{ id: "x1", name: "Acme Roofing", website: "https://acmeroofing.com", phone: null, city: "Denver", state: "CO", lon: -104.9 }];
        },
        updateMany: async (q: { where: { id: { in: string[] } } }) => { used.push(q.where.id.in); return { count: 1 }; },
      },
    };
    const out = await overtureSource.find("roofers", "Denver, CO", { db, rt: { now: () => Date.now() } } as never);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ website: "https://acmeroofing.com", source: "overture" });
    expect(used).toEqual([["x1"]]);
    expect(await overtureSource.find("roofers", "Denver, CO", { rt: { now: () => Date.now() } } as never)).toEqual([]);
  });
});
