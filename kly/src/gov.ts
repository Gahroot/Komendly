// Lead sources "gov:*": US government open-data business/licence lists that publish the business's EMAIL, imported into
// KlyPlace by scripts/import-gov.ts and handed out by the same places source as Overture/FSQ (src/places.ts).
// Only datasets whose publisher puts no use restriction on them (checked 2026-11-12; see GOV_DATASETS[].terms):
//  - gov:nyc-dob   NYC DOB License Info (data.cityofnewyork.us t8hj-ruu2): NYC Open Data Law (Admin Code 23-5); the
//                  Open Data Technical Standards Manual says published data may be used by anyone without restriction
//                  or licensing requirement; nyc.gov terms only require lawful use.
//  - gov:orlando   City of Orlando Business Tax Receipts (data.cityoforlando.net 7388-4re5): Florida public record
//                  (ch. 119); the portal's Terms of Use is an as-is disclaimer with no use restriction.
//  - gov:gnv       City of Gainesville Active Businesses (data.cityofgainesville.org hk2b-em59): Public Domain.
// The email domain IS the website (no free-mail/ISP addresses), so every row is a business with its own domain + email.
import { normalizeUsPhone } from "./finder";
import { cityKey, type KlyPlaceInput } from "./places";
import { isExcludedDomain } from "./sources";

/** Normalised row from any dataset mapper. */
export interface GovRow {
  id: string; // dataset-local stable id
  type: string; // licence / business type as published
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
}

export interface GovDataset {
  source: `gov:${string}`;
  host: string;
  resource: string;
  label: string;
  terms: string;
  /** SoQL WHERE: active licences with an email only. */
  where: string;
  /** Published type -> Kly niche (exact, upper-cased). */
  types: Record<string, string>;
  map(r: Record<string, unknown>): GovRow;
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const point = (v: unknown): [number | null, number | null] => {
  const c = (v as { coordinates?: unknown[] } | null)?.coordinates;
  return Array.isArray(c) ? [n(c[0]), n(c[1])] : [null, null];
};
const zip5 = (v: unknown): string | null => s(v)?.match(/^\d{5}/)?.[0] ?? null;

const NYC_TYPES: Record<string, string> = {
  "GENERAL CONTRACTOR": "home remodelers", "MASTER PLUMBER": "plumbers", "ELECTRICAL FIRM": "electricians", "OIL BURNER INSTALLER": "hvac",
};
const ORL_TYPES: Record<string, string> = {
  ATTORNEY: "law firms", DENTIST: "dentists", CHIROPRACTOR: "chiropractors", OPTOMETRIST: "optometrists", "OPTICIAN/OCCULIST": "optometrists",
  "PHYSICAL THERAPIST": "physical therapists", "MASSAGE THERAPIST": "massage therapists", "BEAUTY PARLOR": "hairdressers", "BARBER SHOP": "barbershops",
  MANICURIST: "nail salons", "FACIAL SPECIALIST": "med spas", "REAL ESTATE BROKER": "real estate agents", "AUTO SERV/REPAIR": "auto repair shops",
  "AUTOMOBILE DEALER": "car dealers", "GENERAL CONTRACTOR": "home remodelers", "BUILD CONTRA": "home remodelers", "CONTRACTOR DBPR": "home remodelers",
  "CONTRA NOT DBPR": "home remodelers", "HOME BUILDING": "home remodelers", "LAWN MAINT SERVICE": "landscapers", LANDSCAPING: "landscapers",
  "POOLS/SPA/BATH": "pool builders", "JANITORIAL SERVICE": "house cleaners", "TATTOO PARLOR": "tattoo studios", PHOTOGRAPHER: "photographers",
  "SFTWARE/WEB DESIGN": "web design agencies", "ADVERTISING AGENCY": "marketing agencies", VETERINARIAN: "veterinarians", JEWELRY: "jewelers",
  "RTAIL HOME FURNISH": "furniture stores", "ANIMAL GROOMING": "dog groomers", "PEST EXTERMINATOR": "pest control", "MORTGAGE BROKER": "mortgage brokers",
  "LOCKSMITH/KEYS": "locksmiths", "MOBILE WSH/WAX/VAC": "auto detailers", "RETAIL CLOTHING": "boutiques",
};
const GNV_TYPES: Record<string, string> = {
  "ATTORNEY/LAWYER": "law firms", "BARBER/COSMETOLOGIST/NAIL TECH": "hairdressers", "BEAUTY PARLOR": "hairdressers", "NAIL SHOP": "nail salons",
  "BARBER SHOP": "barbershops", "MASSAGE THERAPIST": "massage therapists", "MASSAGE THERAPIST BEFORE 94-95": "massage therapists",
  "AUTO REPAIR GARAGE": "auto repair shops", "AUTO PAINTING, UPHOLSTERY OR TOP SHOP": "auto repair shops", "INTERIOR JANITORIAL AND CLEANING SERVICES": "house cleaners",
  "REAL ESTATE BROKER": "real estate agents", "REAL ESTATE BROKER-BRANCH OFFICE": "real estate agents", DENTIST: "dentists", "USED CAR SALES": "car dealers",
  "MOTOR VEHICLE SALES (NEW)": "car dealers", "LAWN/YARD MAINTENANCE W/O LANDSCAPING": "landscapers", "CONTRACTOR-LAND CLEAR/INCL. LANDSCAPE": "landscapers",
  "CONTRACTOR-LANDSCAPE (NO LAND CLEARING)": "landscapers", "CONTRACTOR-GENERAL-UNLIMITED": "home remodelers", "CONTRACTOR-BUILDING": "home remodelers",
  "CONTRACTOR-INSTALLATION": "home remodelers", "CONTRACTOR-PAINTER/PAPERHANGER": "painters", "TATTOO/PERM MAKEUP ARTIST": "tattoo studios",
  PHOTOGRAPHER: "photographers", "PHYSICAL OR SPEECH THERAPY": "physical therapists", CHIROPRACTOR: "chiropractors", "CAR CLEANING, WAXING, DETAILING": "auto detailers",
  "CONTRACTOR-HARV CLASS B A/C & HEAT": "hvac", "CONTRACTOR-HARV CLASS A UNLTD": "hvac", "CONTRACTOR-ELECTRICAL": "electricians",
  "CONTRACTOR-ROOFER, ROOF DECK, CLEANING": "roofers", "CONTRACTOR-PLUMBER/INCL. GAS LINES": "plumbers", "TREE SERVICE-UNLIMITED": "tree services",
  "RETAIL BAKERY - PLANT ON PREMISES": "bakeries", VETERINARIAN: "veterinarians", "GYMNASIUM,ATHLETIC CLUB OR HEALTH SALON": "gyms",
  "SCHOOL-KARATE/JUDO": "martial arts studios", "SCHOOL-DANCING": "dance studios", OPTOMETRIST: "optometrists", "EXTERMINATORS - PEST CONTROL": "pest control",
  "CONTRACTOR-SWIM POOL SERVICING": "pool builders", "WEB SERVICES INCL DESIGN": "web design agencies", "ADVERTISING AGENCY": "marketing agencies",
  "CONTRACTOR-SOLAR ENERGY": "solar installers", "CONTRACTOR-MASON": "concrete contractors", "CONTRACTOR-TILE": "flooring stores",
  "ANIMAL CARE-GROOMING": "dog groomers", "FACIAL SPECIALIST": "med spas", "AUTO-TRANSFER, HAULING OR DELIVERY CO.": "moving companies",
};
const inList = (col: string, types: Record<string, string>): string => `${col} IN (${Object.keys(types).map((t) => `'${t.replace(/'/g, "''")}'`).join(",")})`;

export const GOV_DATASETS: readonly GovDataset[] = [
  {
    source: "gov:nyc-dob", host: "data.cityofnewyork.us", resource: "t8hj-ruu2", label: "NYC DOB License Info",
    terms: "https://opendata.cityofnewyork.us/overview/ (NYC Open Data Law, Admin Code 23-5) + https://www.nyc.gov/main/terms-of-use",
    types: NYC_TYPES,
    where: `license_status='ACTIVE' AND business_email IS NOT NULL AND ${inList("license_type", NYC_TYPES)}`,
    map: (r) => ({
      id: `${s(r.license_type)}:${s(r.license_number) ?? s(r.license_sl_no)}`, type: s(r.license_type) ?? "", name: s(r.business_name), email: s(r.business_email),
      phone: s(r.business_phone_number), city: s(r.license_business_city), state: s(r.business_state), postcode: zip5(r.business_zip_code), lat: n(r.lat), lon: n(r.long),
    }),
  },
  {
    source: "gov:orlando", host: "data.cityoforlando.net", resource: "7388-4re5", label: "City of Orlando Business Tax Receipts",
    terms: "https://gis.orlando.gov/pdf_docs/CityofOrlandoOpenDataTermsofUseDisclaimer.pdf (Florida Statutes ch. 119 public record)",
    types: ORL_TYPES,
    where: `license_status='Open' AND business_email IS NOT NULL AND ${inList("license_type", ORL_TYPES)}`,
    map: (r) => {
      // "2849 S ORANGE AVE  STE 350, ORLANDO, FL" -> city ORLANDO, state FL
      const parts = (s(r.business_address) ?? "").split(",").map((x) => x.trim());
      const [lon, lat] = point(r.geocoded_column);
      return {
        id: s(r.case_number) ?? "", type: s(r.license_type) ?? "", name: s(r.business_name), email: s(r.business_email), phone: s(r.phone),
        city: parts.length >= 3 ? parts[parts.length - 2]! : null, state: parts.length >= 3 ? parts[parts.length - 1]!.slice(0, 2) : null, postcode: null, lat, lon,
      };
    },
  },
  {
    source: "gov:gnv", host: "data.cityofgainesville.org", resource: "hk2b-em59", label: "City of Gainesville Active and Inactive Businesses",
    terms: "https://data.cityofgainesville.org/d/hk2b-em59 (licence: Public Domain)",
    types: GNV_TYPES,
    where: `statusid='Active' AND email IS NOT NULL AND ${inList("upper(business_type)", GNV_TYPES)}`,
    map: (r) => ({
      id: s(r.id) ?? "", type: s(r.business_type) ?? "", name: s(r.name), email: s(r.email), phone: s(r.business_phone),
      city: s(r.physical_city), state: s(r.physical_state), postcode: null, lat: n(r.latitude), lon: n(r.longitude),
    }),
  },
];

/** Free-mail / ISP mailbox domains: no business website behind them, so the row is skipped. */
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com",
  "me.com", "mac.com", "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net", "spectrum.net", "earthlink.net",
  "optonline.net", "optimum.net", "protonmail.com", "proton.me", "mail.com", "gmx.com", "zoho.com", "zohomail.com", "yandex.com", "frontier.com",
  "frontiernet.net", "windstream.net", "centurylink.net", "embarqmail.com", "roadrunner.com", "twc.com", "rcn.com", "juno.com", "netzero.net", "aim.com",
  "q.com", "cfl.rr.com", "nyc.rr.com", "nycap.rr.com", "tampabay.rr.com", "aol.net", "inbox.com", "usa.net", "hushmail.com", "fastmail.com",
]);

/** Valid address on a business's own domain, lower-cased, else null. */
export function businessEmail(raw: string | null): { email: string; domain: string } | null {
  const e = (raw ?? "").trim().toLowerCase().replace(/^mailto:/, "").split(/[;, ]/)[0] ?? "";
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  const domain = e.split("@")[1]!.replace(/^(www|mail)\./, "");
  if (FREEMAIL.has(domain) || /(^|\.)rr\.com$/.test(domain) || isExcludedDomain(domain)) return null;
  return { email: e, domain };
}

/** Broad niches narrowed by the business name (a "general contractor" called "Acme Roofing" is a roofer). */
const REFINE: readonly { from: readonly string[]; to: string; name: RegExp }[] = [
  { from: ["law firms"], to: "personal injury lawyers", name: /injur|accident/i },
  { from: ["dentists"], to: "orthodontists", name: /orthodon/i },
  { from: ["home remodelers"], to: "roofers", name: /roof/i },
  { from: ["home remodelers"], to: "solar installers", name: /solar/i },
  { from: ["home remodelers"], to: "pool builders", name: /pool/i },
  { from: ["home remodelers"], to: "window installers", name: /window/i },
  { from: ["home remodelers"], to: "fence companies", name: /fenc/i },
  { from: ["home remodelers"], to: "gutter companies", name: /gutter/i },
  { from: ["home remodelers"], to: "foundation repair", name: /foundation|waterproof/i },
  { from: ["home remodelers"], to: "concrete contractors", name: /concrete|masonry/i },
  { from: ["home remodelers"], to: "flooring stores", name: /floor/i },
  { from: ["home remodelers"], to: "painters", name: /painting|painters/i },
  { from: ["home remodelers"], to: "landscapers", name: /landscap/i },
];

export function govNiche(ds: GovDataset, type: string, name: string): string | null {
  const base = ds.types[type.trim().toUpperCase()];
  if (!base) return null;
  return REFINE.find((r) => r.from.includes(base) && r.name.test(name))?.to ?? base;
}

const STATE = /^[A-Z]{2}$/;

/** Dataset row -> KlyPlace (source ds.source, release "<resource>@<snapshot>"), or null without a business email/niche/US city. */
export function toGovPlace(ds: GovDataset, r: GovRow, snapshot: string): (KlyPlaceInput & { source: string; email: string }) | null {
  const name = r.name?.trim();
  const city = r.city?.trim();
  const state = r.state?.trim().toUpperCase();
  const be = businessEmail(r.email);
  if (!name || !city || !state || !STATE.test(state) || !be || !r.id) return null;
  const niche = govNiche(ds, r.type, name);
  if (!niche) return null;
  const titled = city.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return {
    id: `${ds.source}:${r.id}`, niche, category: r.type.slice(0, 80), name: name.slice(0, 120), website: `https://${be.domain}`, domain: be.domain,
    phone: r.phone ? normalizeUsPhone(r.phone) : null, city: titled, cityKey: cityKey(city), state, postcode: r.postcode,
    lon: r.lon, lat: r.lat, confidence: 0.8, release: `${ds.resource}@${snapshot}`, source: ds.source, email: be.email,
  };
}
