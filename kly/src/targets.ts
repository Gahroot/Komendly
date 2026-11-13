// Who Kly prospects: a catalog of niches (OSM selectors + audience + value tier) and the metros it searches.
// Segment arms are niche-level ({ niche, cities, audience }) so Kly learns which KINDS of business pay; each discovery
// picks one city from the list. Value tiers only describe the niche (high-ticket / heavy ad spenders); the bandit
// decides with real revenue.

export type Audience = "local" | "agency";
export type Tier = "core" | "high_value" | "agency";

export interface NicheDef {
  niche: string;
  audience: Audience;
  tier: Tier;
  /** Overpass selectors (each gets the bbox appended). Name regexes must stay simple (no backslashes). */
  osm: string[];
}

// Key-existence filter first (indexed), then the name regex: much faster on big metro bounding boxes.
const byName = (re: string): string => `nwr["website"]["name"~"${re}",i]`;

export const NICHES: NicheDef[] = [
  // Core local services (the original set)
  { niche: "roofers", audience: "local", tier: "core", osm: ['nwr["craft"="roofer"]', 'nwr["shop"="roofing"]'] },
  { niche: "plumbers", audience: "local", tier: "core", osm: ['nwr["craft"="plumber"]'] },
  { niche: "electricians", audience: "local", tier: "core", osm: ['nwr["craft"="electrician"]'] },
  { niche: "hvac", audience: "local", tier: "core", osm: ['nwr["craft"="hvac"]', 'nwr["shop"="hvac"]'] },
  { niche: "landscapers", audience: "local", tier: "core", osm: ['nwr["craft"="gardener"]', 'nwr["landscaping"]'] },
  { niche: "painters", audience: "local", tier: "core", osm: ['nwr["craft"="painter"]'] },
  { niche: "dentists", audience: "local", tier: "high_value", osm: ['nwr["amenity"="dentist"]'] },
  { niche: "hairdressers", audience: "local", tier: "core", osm: ['nwr["shop"="hairdresser"]'] },
  { niche: "bakeries", audience: "local", tier: "core", osm: ['nwr["shop"="bakery"]'] },
  { niche: "gyms", audience: "local", tier: "core", osm: ['nwr["leisure"="fitness_centre"]'] },
  // High-ticket / heavy Meta-ad spenders
  { niche: "med spas", audience: "local", tier: "high_value", osm: ['nwr["shop"="beauty"]["beauty"~"skin|laser|spa|aesthet|injectable",i]', 'nwr["amenity"="clinic"]["website"]["name"~"aesthet|med ?spa|skin|laser|botox",i]', byName("med ?spa|medspa|aesthetic|botox|laser clinic")] },
  { niche: "plastic surgeons", audience: "local", tier: "high_value", osm: ['nwr["healthcare:speciality"~"plastic_surgery"]', byName("plastic surg|cosmetic surg")] },
  { niche: "orthodontists", audience: "local", tier: "high_value", osm: ['nwr["healthcare:speciality"="orthodontics"]', byName("orthodont")] },
  { niche: "chiropractors", audience: "local", tier: "high_value", osm: ['nwr["healthcare"="chiropractor"]', byName("chiropract")] },
  { niche: "physical therapists", audience: "local", tier: "high_value", osm: ['nwr["healthcare"="physiotherapist"]'] },
  { niche: "personal injury lawyers", audience: "local", tier: "high_value", osm: ['nwr["office"="lawyer"]["name"~"injury|accident|trial",i]'] },
  { niche: "law firms", audience: "local", tier: "high_value", osm: ['nwr["office"="lawyer"]'] },
  { niche: "home remodelers", audience: "local", tier: "high_value", osm: [byName("remodel|renovat|kitchen and bath")] },
  { niche: "solar installers", audience: "local", tier: "high_value", osm: ['nwr["craft"="photovoltaic"]', byName("solar")] },
  { niche: "pool builders", audience: "local", tier: "high_value", osm: [byName("pools|pool build|pool and spa")] },
  { niche: "garage door companies", audience: "local", tier: "high_value", osm: [byName("garage door")] },
  { niche: "pest control", audience: "local", tier: "high_value", osm: ['nwr["craft"="pest_control"]', byName("pest|termite|exterminat")] },
  { niche: "real estate agents", audience: "local", tier: "high_value", osm: ['nwr["office"="estate_agent"]'] },
  { niche: "mortgage brokers", audience: "local", tier: "high_value", osm: [byName("mortgage|home loans")] },
  { niche: "car dealers", audience: "local", tier: "high_value", osm: ['nwr["shop"="car"]'] },
  { niche: "jewelers", audience: "local", tier: "high_value", osm: ['nwr["shop"="jewelry"]'] },
  { niche: "furniture stores", audience: "local", tier: "high_value", osm: ['nwr["shop"="furniture"]'] },
  { niche: "flooring stores", audience: "local", tier: "high_value", osm: ['nwr["shop"="flooring"]'] },
  { niche: "wedding venues", audience: "local", tier: "high_value", osm: [byName("wedding|event venue|banquet")] },
  { niche: "veterinarians", audience: "local", tier: "high_value", osm: ['nwr["amenity"="veterinary"]'] },
  { niche: "martial arts studios", audience: "local", tier: "core", osm: ['nwr["sport"~"martial_arts|karate|taekwondo|judo|jiu-jitsu|brazilian_jiu-jitsu"]'] },
  { niche: "yoga studios", audience: "local", tier: "core", osm: ['nwr["sport"="yoga"]'] },
  { niche: "tattoo studios", audience: "local", tier: "core", osm: ['nwr["shop"="tattoo"]'] },
  { niche: "dog groomers", audience: "local", tier: "core", osm: ['nwr["shop"="pet_grooming"]'] },
  { niche: "auto detailers", audience: "local", tier: "core", osm: [byName("detailing|auto spa|ceramic coating")] },
  { niche: "boutiques", audience: "local", tier: "core", osm: ['nwr["shop"="boutique"]', 'nwr["shop"="clothes"]["name"~"boutique",i]'] },
  { niche: "moving companies", audience: "local", tier: "core", osm: ['nwr["office"="moving_company"]', byName("moving|movers")] },
  // More local consumer services (high call volume for voice; phones are usually on OSM tags / the own site)
  { niche: "auto repair shops", audience: "local", tier: "core", osm: ['nwr["shop"="car_repair"]'] },
  { niche: "tree services", audience: "local", tier: "core", osm: ['nwr["craft"="arborist"]', byName("tree service|tree care|arborist|tree removal")] },
  { niche: "fence companies", audience: "local", tier: "core", osm: [byName("fence|fencing")] },
  { niche: "concrete contractors", audience: "local", tier: "core", osm: [byName("concrete")] },
  { niche: "window installers", audience: "local", tier: "high_value", osm: ['nwr["craft"="window_construction"]', byName("windows and doors|window replacement|windows")] },
  { niche: "house cleaners", audience: "local", tier: "core", osm: [byName("cleaning|maids|maid service")] },
  { niche: "carpet cleaners", audience: "local", tier: "core", osm: [byName("carpet clean|steam clean")] },
  { niche: "junk removal", audience: "local", tier: "core", osm: [byName("junk|hauling")] },
  { niche: "locksmiths", audience: "local", tier: "core", osm: ['nwr["shop"="locksmith"]', 'nwr["craft"="locksmith"]'] },
  { niche: "nail salons", audience: "local", tier: "core", osm: ['nwr["shop"="beauty"]["beauty"="nails"]'] },
  { niche: "barbershops", audience: "local", tier: "core", osm: ['nwr["shop"="hairdresser"]["hairdresser"="barber"]', byName("barber")] },
  { niche: "massage therapists", audience: "local", tier: "core", osm: ['nwr["shop"="massage"]'] },
  { niche: "optometrists", audience: "local", tier: "high_value", osm: ['nwr["shop"="optician"]', 'nwr["healthcare"="optometrist"]'] },
  { niche: "florists", audience: "local", tier: "core", osm: ['nwr["shop"="florist"]'] },
  { niche: "pet boarding", audience: "local", tier: "core", osm: ['nwr["amenity"="animal_boarding"]'] },
  { niche: "dance studios", audience: "local", tier: "core", osm: ['nwr["leisure"="dance"]', 'nwr["amenity"="dancing_school"]'] },
  { niche: "photographers", audience: "local", tier: "core", osm: ['nwr["craft"="photographer"]', 'nwr["shop"="photo"]["website"]'] },
  { niche: "foundation repair", audience: "local", tier: "high_value", osm: [byName("foundation repair|basement waterproof|waterproofing")] },
  { niche: "gutter companies", audience: "local", tier: "core", osm: [byName("gutter")] },
  { niche: "appliance repair", audience: "local", tier: "core", osm: [byName("appliance repair")] },
  // Agencies: they make ads for many clients, so one customer = many brands (Agency plan).
  { niche: "marketing agencies", audience: "agency", tier: "agency", osm: ['nwr["office"="advertising_agency"]', 'nwr["office"="marketing"]', byName("marketing agency|digital marketing|social media marketing|media agency|ad agency")] },
  { niche: "web design agencies", audience: "agency", tier: "agency", osm: [byName("web design|website design|creative agency|creative studio|branding agency")] },
];

/** ~200 largest US cities (each its own Nominatim bbox), covering the top ~150 metros plus big suburbs. */
export const METROS = [
  "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Phoenix, AZ", "Philadelphia, PA",
  "San Antonio, TX", "San Diego, CA", "Dallas, TX", "Austin, TX", "Jacksonville, FL", "Fort Worth, TX", "San Jose, CA",
  "Columbus, OH", "Charlotte, NC", "Indianapolis, IN", "San Francisco, CA", "Seattle, WA", "Denver, CO",
  "Oklahoma City, OK", "Nashville, TN", "Washington, DC", "El Paso, TX", "Las Vegas, NV", "Boston, MA", "Detroit, MI",
  "Portland, OR", "Louisville, KY", "Memphis, TN", "Baltimore, MD", "Milwaukee, WI", "Albuquerque, NM", "Tucson, AZ",
  "Fresno, CA", "Sacramento, CA", "Mesa, AZ", "Atlanta, GA", "Kansas City, MO", "Colorado Springs, CO", "Omaha, NE",
  "Raleigh, NC", "Miami, FL", "Virginia Beach, VA", "Long Beach, CA", "Oakland, CA", "Minneapolis, MN",
  "Bakersfield, CA", "Tulsa, OK", "Tampa, FL", "Arlington, TX", "Wichita, KS", "Aurora, CO", "New Orleans, LA",
  "Cleveland, OH", "Honolulu, HI", "Anaheim, CA", "Henderson, NV", "Orlando, FL", "Lexington, KY", "Stockton, CA",
  "Riverside, CA", "Corpus Christi, TX", "Irvine, CA", "Cincinnati, OH", "Santa Ana, CA", "Newark, NJ", "St. Paul, MN",
  "Pittsburgh, PA", "Greensboro, NC", "Durham, NC", "Lincoln, NE", "Jersey City, NJ", "Plano, TX", "Anchorage, AK",
  "North Las Vegas, NV", "St. Louis, MO", "Madison, WI", "Chandler, AZ", "Gilbert, AZ", "Reno, NV", "Buffalo, NY",
  "Chula Vista, CA", "Fort Wayne, IN", "Lubbock, TX", "Toledo, OH", "St. Petersburg, FL", "Laredo, TX", "Irving, TX",
  "Chesapeake, VA", "Glendale, AZ", "Winston-Salem, NC", "Port St. Lucie, FL", "Scottsdale, AZ", "Garland, TX",
  "Boise, ID", "Norfolk, VA", "Spokane, WA", "Richmond, VA", "Fremont, CA", "Huntsville, AL", "Frisco, TX",
  "Cape Coral, FL", "Santa Clarita, CA", "San Bernardino, CA", "Tacoma, WA", "Hialeah, FL", "Baton Rouge, LA",
  "Modesto, CA", "Fontana, CA", "McKinney, TX", "Moreno Valley, CA", "Des Moines, IA", "Fayetteville, NC",
  "Salt Lake City, UT", "Yonkers, NY", "Worcester, MA", "Rochester, NY", "Sioux Falls, SD", "Little Rock, AR",
  "Amarillo, TX", "Tallahassee, FL", "Grand Prairie, TX", "Columbus, GA", "Augusta, GA", "Peoria, AZ", "Oxnard, CA",
  "Knoxville, TN", "Overland Park, KS", "Birmingham, AL", "Grand Rapids, MI", "Vancouver, WA", "Montgomery, AL",
  "Huntington Beach, CA", "Providence, RI", "Brownsville, TX", "Tempe, AZ", "Akron, OH", "Glendale, CA",
  "Chattanooga, TN", "Fort Lauderdale, FL", "Newport News, VA", "Mobile, AL", "Ontario, CA", "Clarksville, TN",
  "Cary, NC", "Elk Grove, CA", "Shreveport, LA", "Eugene, OR", "Aurora, IL", "Salem, OR", "Santa Rosa, CA",
  "Rancho Cucamonga, CA", "Pembroke Pines, FL", "Fort Collins, CO", "Springfield, MO", "Oceanside, CA",
  "Garden Grove, CA", "Lancaster, CA", "Murfreesboro, TN", "Palmdale, CA", "Corona, CA", "Killeen, TX", "Salinas, CA",
  "Roseville, CA", "Denton, TX", "Surprise, AZ", "Macon, GA", "Paterson, NJ", "Lakewood, CO", "Hayward, CA",
  "Charleston, SC", "Alexandria, VA", "Hollywood, FL", "Springfield, MA", "Kansas City, KS", "Sunnyvale, CA",
  "Bellevue, WA", "Joliet, IL", "Naperville, IL", "Escondido, CA", "Bridgeport, CT", "Savannah, GA", "Olathe, KS",
  "Mesquite, TX", "Pasadena, TX", "McAllen, TX", "Rockford, IL", "Gainesville, FL", "Syracuse, NY", "Pomona, CA",
  "Visalia, CA", "Thornton, CO", "Waco, TX", "Jackson, MS", "Columbia, SC", "Fullerton, CA", "Torrance, CA",
  "Victorville, CA", "Midland, TX", "Orange, CA",
];

const BY_NICHE = new Map(NICHES.map((n) => [n.niche, n]));

export function nicheDef(niche: string): NicheDef | undefined {
  return BY_NICHE.get(niche.trim().toLowerCase());
}

/** Agencies get their own copy and qualifier; anything named like an agency counts too (strategist-proposed niches). */
export function audienceOf(niche: string): Audience {
  return nicheDef(niche)?.audience ?? (/agenc|marketing|web design|creative studio/i.test(niche) ? "agency" : "local");
}
