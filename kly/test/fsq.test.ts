import { describe, expect, it } from "vitest";
import { fsqCategoryIds, fsqConfidence, fsqNiche, FSQ_CATEGORIES, ownDomainEmail, toFsqPlace, usState, type FsqPlaceRow } from "../src/fsq";
import { NICHES } from "../src/targets";
import { overtureSource } from "../src/places";

const ROOFER = FSQ_CATEGORIES["roofers"]![0]!;
const row = (o: Partial<FsqPlaceRow> = {}): FsqPlaceRow => ({
  fsq_place_id: "f1", name: "Acme Roofing", website: "acmeroofing.com", email: "Info@AcmeRoofing.com", tel: "(303) 296-4100",
  locality: "Denver", region: "CO", postcode: "80202", country: "US", latitude: 39.74, longitude: -104.99, date_closed: null,
  date_refreshed: "2026-05-01", category_ids: [ROOFER], unresolved_flags: [], ...o,
});

describe("FSQ OS places", () => {
  it("maps catalog niches only, and every niche id is in the SQL pre-filter", () => {
    const known = new Set(NICHES.map((n) => n.niche));
    for (const n of Object.keys(FSQ_CATEGORIES)) expect(known.has(n), n).toBe(true);
    const ids = new Set(fsqCategoryIds());
    for (const c of Object.values(FSQ_CATEGORIES).flat()) expect(ids.has(c)).toBe(true);
  });
  it("refines broad categories by name", () => {
    const law = FSQ_CATEGORIES["law firms"]![0]!;
    expect(fsqNiche([law], "Smith Personal Injury Law")).toBe("personal injury lawyers");
    expect(fsqNiche([law], "Smith & Jones LLP")).toBe("law firms");
    expect(fsqNiche([FSQ_CATEGORIES["dentists"]![0]!], "Bright Orthodontics")).toBe("orthodontists");
    expect(fsqNiche(["4bf58dd8d48988d1ed941735"], "Glow Med Spa")).toBe("med spas");
    expect(fsqNiche(["4bf58dd8d48988d1ed941735"], "Day Spa")).toBeNull();
  });
  it("keeps an open US business with its own site, phone and own-domain email", () => {
    expect(toFsqPlace(row(), "2026-10-15")).toMatchObject({
      id: "fsq:f1", niche: "roofers", source: "fsq", website: "https://acmeroofing.com", domain: "acmeroofing.com",
      email: "info@acmeroofing.com", phone: "+13032964100", state: "CO", cityKey: "denver", confidence: 0.9, release: "fsq-2026-10-15",
    });
  });
  it("drops closed, flagged, stale, non-US, website-less and directory places", () => {
    for (const o of [{ date_closed: "2025-01-01" }, { unresolved_flags: ["closed"] }, { date_refreshed: "2020-01-01" }, { country: "CA" },
      { region: "Ontario" }, { website: null }, { website: "https://www.facebook.com/acme" }, { category_ids: ["nope"] }] as Partial<FsqPlaceRow>[])
      expect(toFsqPlace(row(o), "2026-10-15"), JSON.stringify(o)).toBeNull();
  });
  it("keeps only own-domain emails; full state names normalise", () => {
    expect(ownDomainEmail("owner@gmail.com", "acme.com")).toBeNull();
    expect(ownDomainEmail("mailto:a@mail.acme.com", "acme.com")).toBe("a@mail.acme.com");
    expect(ownDomainEmail("not an email", "acme.com")).toBeNull();
    expect(toFsqPlace(row({ email: "x@gmail.com" }), "2026-10-15")?.email).toBeNull();
    expect(usState("Texas")).toBe("TX");
    expect(fsqConfidence("2024-06-01", "2026-10-15")).toBe(0.6);
  });
  it("the places source passes an fsq row's email to the finder", async () => {
    const db = {
      klyPlace: {
        findMany: async () => [{ id: "fsq:f1", name: "Acme", website: "https://acme.com", phone: null, city: "Denver", state: "CO", lon: null, email: "info@acme.com" }],
        updateMany: async () => ({ count: 1 }),
      },
    };
    const out = await overtureSource.find("roofers", "Denver, CO", { db, rt: { now: () => Date.now() } } as never);
    expect(out[0]).toMatchObject({ email: "info@acme.com" });
  });
});
