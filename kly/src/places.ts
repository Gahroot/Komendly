// Lead source "overture": US businesses WITH a website from Overture Maps Places (CDLA-Permissive-2.0 / Apache-2.0,
// https://docs.overturemaps.org/guides/places/), imported periodically into Postgres (KlyPlace) by
// scripts/import-places.ts. The source hands out unused rows for one niche + city and marks them used, so each place
// is tried once; the finder then dedupes against leads/suppression/customers and crawls the business's own site.
import { domainOfUrl } from "../../src/lib/ads/outbound/policy";
import { normalizeUsPhone } from "./finder";
import { cityParts, isExcludedDomain, isListiclePath, type Candidate, type LeadSource } from "./sources";

/** Kly niche -> Overture `taxonomy.primary` categories (release 2026-10-21.0). Every NICHES entry has one. */
export const OVERTURE_CATEGORIES: Record<string, readonly string[]> = {
  roofers: ["roofing", "ceiling_and_roofing_repair_and_service"],
  plumbers: ["plumbing", "water_heater_installation_repair"],
  electricians: ["electrician"],
  hvac: ["hvac_service", "air_duct_cleaning_service"],
  landscapers: ["landscaping", "lawn_service", "landscape_architect"],
  painters: ["painting"],
  dentists: ["dental_clinic", "general_dentistry", "cosmetic_dentistry", "pediatric_dentistry"],
  hairdressers: ["hair_salon", "hair_stylist", "kids_hair_salon"],
  bakeries: ["bakery"],
  gyms: ["gym", "boxing_gym"],
  "med spas": ["medical_spa", "aesthetic_medicine", "laser_hair_removal"],
  "plastic surgeons": ["plastic_and_reconstructive_surgery", "cosmetic_surgery"],
  orthodontists: ["orthodontics"],
  chiropractors: ["chiropractic"],
  "physical therapists": ["physical_therapy"],
  "personal injury lawyers": ["personal_injury_law"],
  "law firms": ["attorney_or_law_firm"],
  "home remodelers": ["bathroom_remodeling", "kitchen_remodeling", "altering_and_remodeling_contractor"],
  "solar installers": ["solar_installation"],
  "pool builders": ["pool_and_hot_tub_service", "pool_cleaning"],
  "garage door companies": ["garage_door_service"],
  "pest control": ["pest_control_service"],
  "real estate agents": ["real_estate_agent"],
  "mortgage brokers": ["mortgage_broker", "mortgage_lender"],
  "car dealers": ["auto_dealer", "used_auto_dealer"],
  jewelers: ["jewelry_store"],
  "furniture stores": ["furniture_store"],
  "flooring stores": ["flooring_store", "flooring_contractor", "carpet_store"],
  "wedding venues": ["event_venue", "wedding_chapel"],
  veterinarians: ["veterinarian"],
  "martial arts studios": ["martial_arts_club", "karate_club"],
  "yoga studios": ["yoga_studio"],
  "tattoo studios": ["tattoo_and_piercing", "tattoo"],
  "dog groomers": ["pet_groomer"],
  "auto detailers": ["auto_detailing"],
  boutiques: ["fashion_boutique"],
  "moving companies": ["mover"],
  "auto repair shops": ["automotive_repair", "auto_body_shop"],
  "tree services": ["tree_service"],
  "fence companies": ["fence_and_gate_sales_service"],
  "concrete contractors": ["masonry_concrete"],
  "window installers": ["windows_installation"],
  "house cleaners": ["home_cleaning", "cleaning_service"],
  "carpet cleaners": ["carpet_cleaning"],
  "junk removal": ["junk_removal_and_hauling"],
  locksmiths: ["key_and_locksmith"],
  "nail salons": ["nail_salon"],
  barbershops: ["barber"],
  "massage therapists": ["massage_therapy"],
  optometrists: ["optometry", "vision_or_eye_care_clinic"],
  florists: ["florist"],
  "pet boarding": ["pet_boarding", "pet_sitting"],
  "dance studios": ["dance_studio"],
  photographers: ["photography_service", "event_photography_service", "session_photography_service"],
  "foundation repair": ["foundation_repair", "waterproofing"],
  "gutter companies": ["gutter_service"],
  "appliance repair": ["appliance_repair_service"],
  "marketing agencies": ["marketing_agency", "advertising_agency", "internet_marketing_service", "b2b_marketing_consultant"],
  "web design agencies": ["web_designer", "graphic_designer"],
};

/** Category -> niche (first niche listing it wins; the lists don't overlap). */
export function categoryToNiche(): Map<string, string> {
  const m = new Map<string, string>();
  for (const niche of Object.keys(OVERTURE_CATEGORIES).sort()) for (const c of OVERTURE_CATEGORIES[niche] ?? []) if (!m.has(c)) m.set(c, niche);
  return m;
}

/** One raw Overture row (as selected by the import). */
export interface OverturePlaceRow {
  id: string;
  name: string | null;
  websites: readonly string[] | null;
  phones: readonly string[] | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  category: string | null;
  confidence: number | null;
  status: string | null;
  lon: number | null;
  lat: number | null;
}

export interface KlyPlaceInput {
  id: string;
  niche: string;
  category: string;
  name: string;
  website: string;
  domain: string;
  phone: string | null;
  city: string;
  cityKey: string;
  state: string;
  postcode: string | null;
  lon: number | null;
  lat: number | null;
  confidence: number;
  release: string;
}

export const MIN_CONFIDENCE = 0.5;

export const cityKey = (city: string): string => city.trim().toLowerCase().replace(/^saint /, "st. ").replace(/\s+/g, " ");

/** Overture row -> KlyPlace, or null when it isn't an open US business in our catalog with its OWN website. */
export function toKlyPlace(r: OverturePlaceRow, byCategory: Map<string, string>, release: string): KlyPlaceInput | null {
  const niche = r.category ? byCategory.get(r.category) : undefined;
  if (!niche || !r.name || !r.city || !r.state || !/^[A-Z]{2}$/.test(r.state)) return null;
  if (r.status && r.status !== "open") return null;
  if ((r.confidence ?? 0) < MIN_CONFIDENCE) return null;
  for (const raw of r.websites ?? []) {
    const website = /^https?:\/\//i.test(raw) ? raw.trim() : `https://${raw.trim()}`;
    const domain = domainOfUrl(website);
    if (!domain || isExcludedDomain(domain) || isListiclePath(website)) continue;
    const phone = (r.phones ?? []).map((p) => normalizeUsPhone(p)).find((p): p is string => Boolean(p)) ?? null;
    return {
      id: r.id, niche, category: r.category ?? "", name: r.name.slice(0, 120), website, domain, phone,
      city: r.city.trim(), cityKey: cityKey(r.city), state: r.state, postcode: r.postcode, lon: r.lon, lat: r.lat,
      confidence: r.confidence ?? 0, release,
    };
  }
  return null;
}

/** Keep one place per domain (chains/duplicates share a site): the highest confidence, then smallest id. */
export function dedupeByDomain(rows: readonly KlyPlaceInput[]): KlyPlaceInput[] {
  const best = new Map<string, KlyPlaceInput>();
  for (const r of rows) {
    const cur = best.get(r.domain);
    if (!cur || r.confidence > cur.confidence || (r.confidence === cur.confidence && r.id < cur.id)) best.set(r.domain, r);
  }
  return [...best.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Rows handed out per niche|city call (the finder stops at its deadline / count anyway). */
export const PLACES_PER_CALL = 80;

export const overtureSource: LeadSource = {
  id: "overture",
  async find(niche, city, ctx) {
    const db = ctx.db;
    if (!db) return [];
    const { name, state } = cityParts(city);
    const rows = await db.klyPlace.findMany({
      where: { niche, cityKey: cityKey(name), ...(state ? { state } : {}), usedAt: null },
      orderBy: [{ confidence: "desc" }, { id: "asc" }],
      take: PLACES_PER_CALL,
      select: { id: true, name: true, website: true, phone: true, city: true, state: true, lon: true, email: true },
    });
    if (rows.length) await db.klyPlace.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { usedAt: new Date(ctx.rt.now()) } });
    return rows.map((r): Candidate => ({ name: r.name, website: r.website, city: r.city, state: r.state, lon: r.lon, phone: r.phone, source: "overture", ...(r.phone ? { phoneSource: "overture" } : {}), ...(r.email ? { email: r.email } : {}) }));
  },
};

