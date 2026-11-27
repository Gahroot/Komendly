// Lead source "adlib": US local businesses that are ALREADY running Meta ads, collected from the public Meta Ad Library
// into JSONL (one object per advertiser) and imported into KlyPlace (source "adlib") by scripts/import-adlib.ts. They are
// warm prospects (they pay for ads today), so the finder runs this source before every other one (planSources) and,
// when the segment's city has none left, hands out the niche's adlib places from any city so they are used soon.
// Leads keep OutboundLead.source = "adlib" so their funnel can be measured separately.
import { domainOfUrl } from "../../src/lib/ads/outbound/policy";
import { usState } from "./fsq";
import { categoryToNiche, cityKey, OVERTURE_CATEGORIES, type KlyPlaceInput } from "./places";
import { signalsOf, type LeadSignal } from "./signals";
import { cityParts, isExcludedDomain, isListiclePath, type Candidate, type LeadSource } from "./sources";

/** One advertiser line from the Ad Library pull. */
export interface AdlibRow {
  page_name?: string | null;
  page_id?: string | number | null;
  page_url?: string | null;
  website?: string | null;
  domain?: string | null;
  niche?: string | null;
  city?: string | null;
  state?: string | null;
  active_ads?: number | string | null;
  first_seen?: string | null;
  ad_text_sample?: string | null;
  library_url?: string | null;
  search_term?: string | null;
}

/** Free-text trade -> Kly niche, most specific first (e.g. orthodontist before dentist, barber before hair). */
const NICHE_PATTERNS: readonly [RegExp, string][] = [
  [/personal.?injury|accident (lawyer|attorney)|injury (lawyer|attorney|law)/, "personal injury lawyers"],
  [/\b(law ?firm|lawyer|attorney|legal)/, "law firms"],
  [/orthodont|braces|invisalign/, "orthodontists"],
  [/plastic surg|cosmetic surg/, "plastic surgeons"],
  [/med ?spa|medspa|aesthetic|botox|injectable|laser hair|filler/, "med spas"],
  [/dentist|dental/, "dentists"],
  [/chiropract/, "chiropractors"],
  [/physical therap|physiotherap/, "physical therapists"],
  [/optometr|eye ?care|optician|eyewear/, "optometrists"],
  [/veterinar|\bvet\b|animal hospital/, "veterinarians"],
  [/garage door/, "garage door companies"],
  [/carpet clean|upholstery clean/, "carpet cleaners"],
  [/foundation|waterproof|crawl ?space/, "foundation repair"],
  [/gutter/, "gutter companies"],
  [/roof/, "roofers"],
  [/plumb|water heater|drain|sewer/, "plumbers"],
  [/electric/, "electricians"],
  [/hvac|heating|air condition|\bac\b|furnace|cooling|heat pump/, "hvac"],
  [/tree (service|care|removal|trimming)|arborist/, "tree services"],
  [/landscap|lawn|hardscap|irrigation/, "landscapers"],
  [/auto detail|car detail|detailing|ceramic coating|paint protection/, "auto detailers"],
  [/paint/, "painters"],
  [/remodel|renovat|kitchen|bathroom|general contractor|home improvement|basement finish/, "home remodelers"],
  [/solar/, "solar installers"],
  [/pool/, "pool builders"],
  [/pest|termite|extermin/, "pest control"],
  [/real ?estate|realtor|realty/, "real estate agents"],
  [/mortgage|home loan/, "mortgage brokers"],
  [/car dealer|auto dealer|dealership|used car/, "car dealers"],
  [/auto repair|auto body|collision|mechanic|car repair|brake|transmission/, "auto repair shops"],
  [/jewel/, "jewelers"],
  [/furniture|mattress/, "furniture stores"],
  [/floor|carpet|tile/, "flooring stores"],
  [/wedding|event venue|banquet/, "wedding venues"],
  [/martial art|karate|jiu.?jitsu|taekwondo|\bmma\b|boxing|kickbox/, "martial arts studios"],
  [/yoga|pilates/, "yoga studios"],
  [/tattoo/, "tattoo studios"],
  [/pet board|dog board|kennel|doggy day ?care|pet sitting/, "pet boarding"],
  [/groom/, "dog groomers"],
  [/boutique|clothing|apparel/, "boutiques"],
  [/moving|movers/, "moving companies"],
  [/fenc/, "fence companies"],
  [/concrete|masonry|paving|driveway/, "concrete contractors"],
  [/window/, "window installers"],
  [/junk|hauling|dumpster/, "junk removal"],
  [/clean|maid|janitor/, "house cleaners"],
  [/locksmith/, "locksmiths"],
  [/nail/, "nail salons"],
  [/barber/, "barbershops"],
  [/hair|salon/, "hairdressers"],
  [/massage/, "massage therapists"],
  [/florist|flower/, "florists"],
  [/danc/, "dance studios"],
  [/photograph/, "photographers"],
  [/appliance/, "appliance repair"],
  [/bakery|bakeries|cake|cupcake/, "bakeries"],
  [/gym|fitness|crossfit|personal train/, "gyms"],
  [/web design|website design/, "web design agencies"],
  [/marketing|advertising agency/, "marketing agencies"],
];

// Built on first use: places.ts and finder.ts import each other, so module-level reads could see them uninitialised.
let lookups: { niches: Set<string>; byCategory: Map<string, string> } | null = null;
const nicheLookups = () => (lookups ??= { niches: new Set(Object.keys(OVERTURE_CATEGORIES)), byCategory: categoryToNiche() });

/** Ad Library "niche" (a Kly niche, an Overture category, a slug or free text) -> Kly niche, or null when unmapped. */
export function adlibNiche(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  const spaced = s.replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  const { niches, byCategory } = nicheLookups();
  if (niches.has(spaced)) return spaced;
  const cat = byCategory.get(s.replace(/[\s-]+/g, "_"));
  if (cat) return cat;
  for (const [re, niche] of NICHE_PATTERNS) if (re.test(spaced)) return niche;
  return null;
}

/** Why a row was dropped (counted by the import). */
export type AdlibSkip = "no_niche" | "no_domain" | "excluded_domain" | "no_location" | "no_name";

/** Ad Library row -> KlyPlace (source "adlib"), or the reason it can't be one. */
export function toAdlibPlace(r: AdlibRow, release: string): (KlyPlaceInput & { source: "adlib" }) | { skip: AdlibSkip } {
  const niche = adlibNiche(r.niche) ?? adlibNiche(r.search_term);
  if (!niche) return { skip: "no_niche" };
  const rawSite = (r.website ?? "").trim() || (r.domain ?? "").trim();
  if (!rawSite) return { skip: "no_domain" };
  const website = /^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`;
  const domain = domainOfUrl(website);
  if (!domain || !domain.includes(".")) return { skip: "no_domain" };
  if (isExcludedDomain(domain) || isListiclePath(website)) return { skip: "excluded_domain" };
  const state = usState(r.state ?? null);
  const city = (r.city ?? "").trim();
  if (!state || !city) return { skip: "no_location" };
  const name = (r.page_name ?? "").trim();
  if (!name) return { skip: "no_name" };
  const pageId = String(r.page_id ?? "").trim();
  const ads = Number(r.active_ads);
  return {
    id: `adlib:${pageId || domain}`, niche, category: (r.niche ?? "").trim().slice(0, 80) || niche, name: name.slice(0, 120),
    website: `https://${new URL(website).host}/`, domain, phone: null, city, cityKey: cityKey(city), state, postcode: null, lon: null, lat: null,
    // More running ads = warmer: hand those out first (0.5 .. 1).
    confidence: Number.isFinite(ads) && ads > 0 ? Math.min(1, 0.5 + ads * 0.05) : 0.5,
    release, source: "adlib",
  };
}

/** AdsEvent name the import writes per advertiser (props: { domain, signals }): KlyPlace has no metadata column. */
export const LEAD_SIGNAL_EVENT = "lead_signal" as const;

/** Latest stored signals per domain (read-only; empty on any DB error so discovery never breaks on it). */
export async function adlibSignalsFor(db: NonNullable<Parameters<LeadSource["find"]>[2]["db"]>, domains: readonly string[]): Promise<Map<string, LeadSignal[]>> {
  const out = new Map<string, LeadSignal[]>();
  const ds = [...new Set(domains.filter(Boolean))];
  if (!ds.length) return out;
  try {
    const evs = await db.adsEvent.findMany({ where: { name: LEAD_SIGNAL_EVENT, OR: ds.map((d) => ({ props: { path: ["domain"], equals: d } })) }, orderBy: { createdAt: "asc" }, select: { props: true } });
    for (const e of evs) {
      const p = e.props as { domain?: string; signals?: unknown } | null;
      if (p?.domain) out.set(p.domain, signalsOf({ signals: p.signals }));
    }
  } catch { /* signals are optional */ }
  return out;
}

/** KlyPlace sources handled by adlibSource: Ad Library advertisers and signal-detected places ("signal:new_shopify" ...). */
export const WARM_SOURCE: { OR: Array<{ source: string } | { source: { startsWith: string } }> } = { OR: [{ source: "adlib" }, { source: { startsWith: "signal:" } }] };

/** Adlib places handed out per call (fewer than Overture: these are scarce, and unprocessed ones are lost). */
export const ADLIB_PER_CALL = 25;

export const adlibSource: LeadSource = {
  id: "adlib",
  async find(niche, city, ctx) {
    const db = ctx.db;
    if (!db) return [];
    const { name, state } = cityParts(city);
    const select = { id: true, name: true, website: true, phone: true, city: true, state: true, lon: true, email: true } as const;
    const orderBy = [{ confidence: "desc" as const }, { id: "asc" as const }];
    const here = await db.klyPlace.findMany({ where: { ...WARM_SOURCE, niche, cityKey: cityKey(name), ...(state ? { state } : {}), usedAt: null }, orderBy, take: ADLIB_PER_CALL, select });
    // Warm advertisers shouldn't wait for their city's turn: top up from the same niche anywhere.
    const rest = here.length < ADLIB_PER_CALL
      ? await db.klyPlace.findMany({ where: { ...WARM_SOURCE, niche, usedAt: null, id: { notIn: here.map((r) => r.id) } }, orderBy, take: ADLIB_PER_CALL - here.length, select })
      : [];
    const rows = [...here, ...rest];
    if (rows.length) await db.klyPlace.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { usedAt: new Date(ctx.rt.now()) } });
    const sigs = await adlibSignalsFor(db, rows.map((r) => domainOfUrl(r.website) ?? ""));
    return rows.map((r): Candidate => ({ name: r.name, website: r.website, city: r.city, state: r.state, lon: r.lon, phone: r.phone, source: "adlib", ...(r.email ? { email: r.email } : {}), ...(sigs.get(domainOfUrl(r.website) ?? "")?.length ? { signals: sigs.get(domainOfUrl(r.website) ?? "") } : {}) }));
  },
};
