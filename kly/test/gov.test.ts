import { describe, expect, it } from "vitest";
import { NICHES } from "../src/targets";
import { businessEmail, GOV_DATASETS, govNiche, toGovPlace, type GovRow } from "../src/gov";
import { dedupeByDomain } from "../src/places";

const ds = (src: string) => GOV_DATASETS.find((d) => d.source === src)!;
const row = (o: Partial<GovRow> = {}): GovRow => ({
  id: "GENERAL CONTRACTOR:123", type: "GENERAL CONTRACTOR", name: "Acme Builders Inc", email: "Info@AcmeBuilders.com", phone: "(718) 296-4100",
  city: "BROOKLYN", state: "NY", postcode: "11201", lat: 40.69, lon: -73.99, ...o,
});

describe("gov licence datasets", () => {
  it("every mapped type points at a catalog niche", () => {
    const niches = new Set(NICHES.map((x) => x.niche));
    for (const d of GOV_DATASETS) for (const [t, n] of Object.entries(d.types)) expect(niches.has(n), `${d.source} ${t}`).toBe(true);
  });
  it("keeps only emails on a business's own domain", () => {
    expect(businessEmail("Info@AcmeBuilders.com")).toEqual({ email: "info@acmebuilders.com", domain: "acmebuilders.com" });
    expect(businessEmail("bob@gmail.com")).toBeNull();
    expect(businessEmail("bob@cfl.rr.com")).toBeNull();
    expect(businessEmail("clerk@orlando.gov")).toBeNull();
    expect(businessEmail("not an email")).toBeNull();
  });
  it("maps a row to a KlyPlace with the dataset recorded", () => {
    const p = toGovPlace(ds("gov:nyc-dob"), row(), "2026-11-12");
    expect(p).toMatchObject({
      id: "gov:nyc-dob:GENERAL CONTRACTOR:123", source: "gov:nyc-dob", release: "t8hj-ruu2@2026-11-12", niche: "home remodelers",
      website: "https://acmebuilders.com", domain: "acmebuilders.com", email: "info@acmebuilders.com", city: "Brooklyn", cityKey: "brooklyn", state: "NY", phone: "+17182964100",
    });
  });
  it("refines broad licence types by name and drops unmapped types", () => {
    expect(govNiche(ds("gov:nyc-dob"), "GENERAL CONTRACTOR", "Top Roofing Corp")).toBe("roofers");
    expect(govNiche(ds("gov:orlando"), "ATTORNEY", "Smith Injury Law")).toBe("personal injury lawyers");
    expect(govNiche(ds("gov:gnv"), "Nail Shop", "Lux Nails")).toBe("nail salons");
    expect(govNiche(ds("gov:nyc-dob"), "WELDER", "x")).toBeNull();
    expect(toGovPlace(ds("gov:nyc-dob"), row({ email: "acme@yahoo.com" }), "d")).toBeNull();
    expect(toGovPlace(ds("gov:nyc-dob"), row({ state: null }), "d")).toBeNull();
  });
  it("Orlando's address string yields city and state", () => {
    const r = ds("gov:orlando").map({ case_number: "BUS-1", license_type: "DENTIST", business_name: "Smile Co", business_email: "hi@smile.co", business_address: "2849 S ORANGE AVE  STE 350, ORLANDO, FL", geocoded_column: { coordinates: [-81.37, 28.51] } });
    expect(r).toMatchObject({ city: "ORLANDO", state: "FL", lon: -81.37, lat: 28.51 });
  });
  it("one place per domain across datasets", () => {
    const a = toGovPlace(ds("gov:nyc-dob"), row(), "d")!;
    const b = toGovPlace(ds("gov:gnv"), row({ id: "9", type: "CONTRACTOR-BUILDING", email: "sales@acmebuilders.com", city: "Gainesville", state: "FL" }), "d")!;
    expect(dedupeByDomain([a, b])).toHaveLength(1);
  });
});
