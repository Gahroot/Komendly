// Lead source "fsq": Foursquare Open Source Places (Apache-2.0, https://docs.foursquare.com/data-products/docs/access-fsq-os-places;
// mirror https://huggingface.co/datasets/foursquare/fsq-os-places). Imported into KlyPlace (source "fsq") by
// scripts/import-fsq.ts and handed out by the same places source as Overture (src/places.ts). Unlike Overture, FSQ often
// lists the business email; we keep it only when it's on the business's own domain so the finder can skip the crawl.
import { domainOfUrl } from "../../src/lib/ads/outbound/policy";
import { normalizeUsPhone } from "./finder";
import { cityKey, type KlyPlaceInput } from "./places";
import { isExcludedDomain, isListiclePath } from "./sources";

const HI = "63be6904847c3692a84b9b"; // Business and Professional Services > Home Improvement Service > ...
const LAW = ["52f2ab2ebcbc57f1066b8b3f" /* Law Office */, `${HI}6c` /* Immigration Attorney */];
const DENTIST = ["4bf58dd8d48988d178941735"];
const GENERAL = [`${HI}55` /* General Contractor */, `${HI}58` /* Home Improvement Service */, "545419b1498ea6ccd0202f58" /* Home Service */, `${HI}36` /* Construction */];
const CLEANING = [`${HI}60`];

/** Name-refined rules, checked first: a broad FSQ category + a name pattern -> a narrower Kly niche. */
export const FSQ_REFINED: readonly { niche: string; ids: readonly string[]; name: RegExp }[] = [
  { niche: "personal injury lawyers", ids: LAW, name: /injur|accident/i },
  { niche: "orthodontists", ids: DENTIST, name: /orthodon|braces/i },
  { niche: "med spas", ids: ["4bf58dd8d48988d1ed941735" /* Spa */, "4bf58dd8d48988d177941735" /* Doctor's Office */, "4bf58dd8d48988d104941735" /* Medical Center */, `${HI}4a` /* Hair Removal */, `${HI}d8` /* Plastic Surgeon */], name: /med\s?spa|medical spa|aesthetic|botox|injectable/i },
  { niche: "carpet cleaners", ids: CLEANING, name: /carpet|rug|upholster/i },
  { niche: "auto detailers", ids: ["4f04ae1f2fb6e1c99f3db0ba" /* Car Wash and Detail */], name: /detail/i },
  { niche: "solar installers", ids: [...GENERAL, `${HI}52`], name: /solar/i },
  { niche: "gutter companies", ids: [...GENERAL, `${HI}61`], name: /gutter/i },
  { niche: "foundation repair", ids: GENERAL, name: /foundation|waterproof/i },
  { niche: "concrete contractors", ids: GENERAL, name: /concrete|masonry/i },
  { niche: "pool builders", ids: GENERAL, name: /pool/i },
  { niche: "junk removal", ids: ["58daa1558bbb0b01f18ec1ac" /* Waste Management */, `${HI}5c`, ...GENERAL], name: /junk|haul/i },
  { niche: "appliance repair", ids: [`${HI}f1` /* Home Appliance Store */, ...GENERAL], name: /appliance.*repair|repair.*appliance/i },
  { niche: "home remodelers", ids: GENERAL, name: /remodel|renovat/i },
  { niche: "mortgage brokers", ids: [`${HI}44` /* Loans Agency */, `${HI}3d` /* Financial Service */], name: /mortgage|home loan/i },
];

/** Kly niche -> FSQ category ids (OS Places taxonomy, 2026 release), matched on any of a place's fsq_category_ids. */
export const FSQ_CATEGORIES: Record<string, readonly string[]> = {
  roofers: [`${HI}61`],
  plumbers: [`${HI}5f`],
  electricians: [`${HI}52`],
  hvac: [`${HI}56`],
  landscapers: [`${HI}5b`],
  painters: [`${HI}5d`],
  dentists: DENTIST,
  hairdressers: ["4bf58dd8d48988d110951735"],
  bakeries: ["4bf58dd8d48988d16a941735"],
  gyms: ["4bf58dd8d48988d176941735", "52f2ab2ebcbc57f1066b8b47"],
  "plastic surgeons": [`${HI}d8`],
  chiropractors: ["52e81612bcbc57f1066b7a3a"],
  "physical therapists": ["5744ccdfe4b0c0459246b4af"],
  "law firms": LAW,
  "home remodelers": [`${HI}4c` /* Bathroom */, `${HI}5a` /* Kitchen */],
  "pool builders": [`${HI}63`],
  "garage door companies": [`${HI}54`],
  "pest control": [`${HI}5e`],
  "real estate agents": ["5032885091d4c4b30a586d66"],
  "car dealers": ["4eb1c1623b7b52c0e1adc2ec", "5e8f50bd03c7a9000c1e2fbc", "5e8f501a03c7a9000c1e2e88"],
  jewelers: ["4bf58dd8d48988d111951735"],
  "furniture stores": ["4bf58dd8d48988d1f8941735"],
  "flooring stores": ["52f2ab2ebcbc57f1066b8b2a", `${HI}4e`],
  "wedding venues": ["56aa371be4b08b9a8d5734c5", "4bf58dd8d48988d171941735"],
  veterinarians: ["4d954af4a243a5684765b473"],
  "martial arts studios": ["4bf58dd8d48988d101941735"],
  "yoga studios": ["4bf58dd8d48988d102941735"],
  "tattoo studios": ["4bf58dd8d48988d1de931735"],
  "dog groomers": [`${HI}79`],
  boutiques: ["4bf58dd8d48988d104951735"],
  "moving companies": [`${HI}5c`],
  "auto repair shops": ["52f2ab2ebcbc57f1066b8b44"],
  "tree services": [`${HI}64`],
  "fence companies": [`${HI}53`],
  "window installers": [`${HI}51`],
  "house cleaners": CLEANING,
  locksmiths: ["52f2ab2ebcbc57f1066b8b1e"],
  "nail salons": ["4f04aa0c2fb6e1c99f3db0b8"],
  barbershops: [`${HI}49`],
  "massage therapists": ["52f2ab2ebcbc57f1066b8b3c"],
  optometrists: ["522e32fae4b09b556e370f19"],
  florists: ["4bf58dd8d48988d11b951735"],
  "pet boarding": [`${HI}7a`],
  "dance studios": ["4bf58dd8d48988d134941735"],
  photographers: [`${HI}7c`, `${HI}7d`, "554a5e17498efabeda6cc559"],
  "marketing agencies": ["52e81612bcbc57f1066b7a3d", `${HI}77`, `${HI}8e`],
  "web design agencies": [`${HI}92`],
};

/** Every category id the import needs (for the SQL pre-filter). */
export const fsqCategoryIds = (): string[] =>
  [...new Set([...Object.values(FSQ_CATEGORIES).flat(), ...FSQ_REFINED.flatMap((r) => r.ids)])].sort();

/** A place's categories + name -> Kly niche (refined rules first), or null. */
export function fsqNiche(ids: readonly string[], name: string): string | null {
  for (const r of FSQ_REFINED) if (r.name.test(name) && ids.some((id) => r.ids.includes(id))) return r.niche;
  for (const id of ids) for (const [niche, cats] of Object.entries(FSQ_CATEGORIES)) if (cats.includes(id)) return niche;
  return null;
}

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const VALID_STATES = new Set(Object.values(STATES));
export function usState(region: string | null): string | null {
  const r = (region ?? "").trim();
  const s = /^[a-z]{2}$/i.test(r) ? r.toUpperCase() : STATES[r.toLowerCase()];
  return s && VALID_STATES.has(s) ? s : null;
}

/** Listed email, kept only when it is on the site's own domain (or a subdomain of it): no gmail, no agency/platform address. */
export function ownDomainEmail(email: string | null, domain: string): string | null {
  const e = (email ?? "").trim().toLowerCase().replace(/^mailto:/, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  const d = e.split("@")[1]!.replace(/^www\./, "");
  return d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`) ? e : null;
}

/** One raw FSQ OS Places row (as selected by the import). Dates are "YYYY-MM-DD". */
export interface FsqPlaceRow {
  fsq_place_id: string;
  name: string | null;
  website: string | null;
  email: string | null;
  tel: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  date_closed: string | null;
  date_refreshed: string | null;
  category_ids: readonly string[] | null;
  unresolved_flags: readonly string[] | null;
}

const DAY = 86_400_000;
/** Refreshed within a year of the release = 0.9, within 3 years = 0.6, older = dropped (FSQ has no confidence score). */
export function fsqConfidence(refreshed: string | null, releaseDt: string): number | null {
  const age = (Date.parse(releaseDt) - Date.parse(refreshed ?? "")) / DAY;
  if (!Number.isFinite(age)) return null;
  return age <= 365 ? 0.9 : age <= 3 * 365 ? 0.6 : null;
}

/** FSQ row -> KlyPlace (source "fsq"), or null when it isn't an open, current US business in our catalog with its OWN website. */
export function toFsqPlace(r: FsqPlaceRow, releaseDt: string): (KlyPlaceInput & { source: "fsq"; email: string | null }) | null {
  if (r.country !== "US" || r.date_closed || (r.unresolved_flags?.length ?? 0) > 0) return null;
  const name = r.name?.trim();
  const state = usState(r.region);
  if (!name || !r.locality?.trim() || !state || !r.website?.trim()) return null;
  const niche = fsqNiche(r.category_ids ?? [], name);
  const confidence = fsqConfidence(r.date_refreshed, releaseDt);
  if (!niche || confidence === null) return null;
  const raw = r.website.trim();
  const website = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const domain = domainOfUrl(website);
  if (!domain || isExcludedDomain(domain) || isListiclePath(website)) return null;
  return {
    id: `fsq:${r.fsq_place_id}`, niche, category: (r.category_ids ?? [])[0] ?? "", name: name.slice(0, 120), website, domain,
    phone: r.tel ? normalizeUsPhone(r.tel) : null, city: r.locality.trim(), cityKey: cityKey(r.locality), state, postcode: r.postcode,
    lon: r.longitude, lat: r.latitude, confidence, release: `fsq-${releaseDt}`, source: "fsq", email: ownDomainEmail(r.email, domain),
  };
}
