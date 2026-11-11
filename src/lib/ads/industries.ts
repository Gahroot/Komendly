// Small-business industries for the /ad-examples SEO gallery. Pure and deterministic: classify a run's extraction by keyword rules.

export type IndustryKind = "local-service" | "local-venue" | "shop" | "professional" | "online";

export interface Industry {
  slug: string;
  singular: string; // "bakery"
  plural: string; // "bakeries"
  kind: IndustryKind;
  /** What customers come for, in plain words ("fresh bread, cakes and pastries"). Used by the guide template. */
  offer: string;
  /** Lowercase keywords/phrases matched on word boundaries. Multi-word phrases score higher. */
  keywords: readonly string[];
  /** Related blog tags (matched with tagSlug). */
  tags?: readonly string[];
}

const I = (slug: string, singular: string, plural: string, kind: IndustryKind, offer: string, keywords: string[], tags: string[] = []): Industry => ({ slug, singular, plural, kind, offer, keywords, tags });

export const INDUSTRIES: readonly Industry[] = [
  I("bakeries", "bakery", "bakeries", "local-venue", "fresh bread, cakes and pastries", ["bakery", "bakeries", "baked goods", "pastry", "pastries", "bread", "cakes", "cupcakes", "cookies", "brownies", "pies", "baked from scratch", "baked-from-scratch", "patisserie", "donuts"]),
  I("coffee-shops", "coffee shop", "coffee shops", "local-venue", "coffee, espresso drinks and a place to sit", ["coffee", "coffee shop", "cafe", "café", "espresso", "roaster", "roastery", "roasting", "coffee beans", "barista", "latte"]),
  I("restaurants", "restaurant", "restaurants", "local-venue", "a great meal out", ["restaurant", "dining", "dine", "menu", "reservations", "seafood", "pizza", "pizzeria", "bistro", "brunch", "takeout", "steakhouse", "sushi", "tacos", "catering"]),
  I("roofers", "roofer", "roofers", "local-service", "roof repair and replacement", ["roof", "roofs", "roofing", "roofer", "shingles", "gutters", "roof repair", "roof replacement"]),
  I("plumbers", "plumber", "plumbers", "local-service", "plumbing repairs and installs", ["plumbing", "plumber", "plumbers", "drain", "drains", "water heater", "leak", "leaks", "pipes", "lead pipe", "sewer"]),
  I("hvac", "HVAC company", "HVAC companies", "local-service", "heating and cooling repair", ["hvac", "air conditioning", "heating and cooling", "furnace", "heat pump", "ac repair", "ductwork"]),
  I("electricians", "electrician", "electricians", "local-service", "electrical repairs and installs", ["electrician", "electricians", "electrical", "wiring", "panel upgrade", "ev charger", "lighting installation", "outdoor lighting", "landscape lighting"]),
  I("landscapers", "landscaper", "landscapers", "local-service", "lawn care and landscape design", ["landscaping", "landscape design", "landscaper", "lawn", "lawn care", "grounds maintenance", "hardscape", "hardscaping", "garden design", "tree service", "irrigation"]),
  I("cleaning-services", "cleaning service", "cleaning services", "local-service", "home and office cleaning", ["cleaning", "cleaners", "maid", "house cleaning", "janitorial", "carpet cleaning", "pressure washing", "deep clean"]),
  I("dentists", "dentist", "dentists", "local-venue", "dental care for the whole family", ["dentist", "dentists", "dental", "dentistry", "orthodontist", "orthodontics", "teeth", "invisalign", "smile"]),
  I("chiropractors", "chiropractor", "chiropractors", "local-venue", "chiropractic care and pain relief", ["chiropractor", "chiropractic", "spinal", "adjustment", "back pain", "physical therapy", "physiotherapy"]),
  I("med-spas", "med spa", "med spas", "local-venue", "aesthetic treatments", ["med spa", "medspa", "medical spa", "botox", "fillers", "aesthetics", "laser hair removal", "facials", "microneedling"]),
  I("salons", "salon", "salons", "local-venue", "hair, beauty and nail services", ["salon", "salons", "hair salon", "hairstylist", "stylist", "nail", "nails", "hair color", "blowout", "lashes", "beauty services"]),
  I("barbers", "barber", "barbershops", "local-venue", "haircuts and shaves", ["barber", "barbers", "barbershop", "barber shop", "fade", "beard trim", "haircuts"]),
  I("gyms", "gym", "gyms", "local-venue", "training and fitness classes", ["gym", "fitness", "personal training", "personal trainer", "crossfit", "pilates", "strength training", "bootcamp", "workout"]),
  I("yoga-studios", "yoga studio", "yoga studios", "local-venue", "yoga and movement classes", ["yoga", "hot yoga", "yoga studio", "meditation", "vinyasa"]),
  I("real-estate-agents", "real estate agent", "real estate agents", "professional", "help buying and selling homes", ["real estate", "realtor", "realty", "home buyers", "home sellers", "buying and selling homes", "listings", "property valuation", "first-time buyers", "homes for sale"]),
  I("law-firms", "law firm", "law firms", "professional", "legal advice and representation", ["law firm", "lawyer", "lawyers", "attorney", "attorneys", "legal", "estate planning", "wills", "trusts", "personal injury", "pllc", "litigation"]),
  I("accountants", "accountant", "accountants and bookkeepers", "professional", "bookkeeping, tax and accounting", ["accountant", "accounting", "bookkeeping", "bookkeeper", "cpa", "tax preparation", "taxes", "quickbooks", "payroll"]),
  I("photographers", "photographer", "photographers", "professional", "photo sessions", ["photographer", "photography", "photo session", "photoshoot", "portraits", "headshots", "engagement photos"]),
  I("florists", "florist", "florists", "shop", "fresh flowers and arrangements", ["florist", "flowers", "floral", "bouquet", "bouquets", "flower delivery", "cut flower"]),
  I("pet-groomers", "pet groomer", "pet groomers", "local-service", "grooming for dogs and cats", ["pet grooming", "dog grooming", "groomer", "grooming", "pet", "pets", "dog", "dogs", "doggy daycare", "veterinary", "vet"]),
  I("auto-repair", "auto repair shop", "auto repair shops", "local-service", "car repair and maintenance", ["auto repair", "mechanic", "car repair", "oil change", "brakes", "tires", "auto body", "collision", "transmission"]),
  I("contractors", "contractor", "contractors", "local-service", "remodels and home improvement", ["contractor", "general contractor", "remodel", "remodeling", "renovation", "home improvement", "construction", "kitchen remodel", "bathroom remodel", "handyman", "windows", "siding", "decks"]),
  I("interior-designers", "interior designer", "interior designers", "professional", "interior design and decor", ["interior design", "interior designer", "decor", "home staging", "window treatments", "blinds", "shades", "shutters", "drapery", "furniture"]),
  I("wedding-venues", "wedding venue", "wedding venues", "local-venue", "a place to celebrate", ["wedding venue", "venue", "event venue", "banquet", "receptions", "ballroom", "barn weddings"]),
  I("skincare-brands", "skincare brand", "skincare and e-commerce brands", "online", "products people order online", ["skincare", "skin care", "serum", "moisturizer", "cosmetics", "makeup", "beauty products", "online store", "e-commerce", "ecommerce", "shop online", "free shipping"]),
  I("supplements", "supplement brand", "supplement brands", "online", "supplements and wellness products", ["supplement", "supplements", "vitamins", "protein", "gummies", "wellness shot", "sleep shot", "collagen", "probiotic", "nutrition"]),
  I("clothing-boutiques", "clothing boutique", "clothing boutiques", "shop", "clothing and accessories", ["boutique", "clothing", "apparel", "fashion", "dresses", "jewelry", "accessories", "t-shirts", "streetwear"]),
  I("saas", "SaaS company", "SaaS companies", "online", "software that saves people time", ["saas", "software", "platform", "app", "dashboard", "analytics", "integrations", "api", "free trial", "automation", "recorder", "for mac", "workflows"]),
  I("coaches", "coach or consultant", "coaches and consultants", "professional", "coaching and consulting", ["coach", "coaching", "consultant", "consulting", "mentor", "mentorship", "business development", "life coach", "workshops"]),
  I("tutors", "tutoring business", "tutoring businesses", "professional", "tutoring and test prep", ["tutoring", "tutor", "tutors", "test prep", "test preparation", "sat prep", "act prep", "homework help", "math tutoring", "reading tutoring"]),
  I("daycares", "daycare", "daycares", "local-venue", "childcare parents can trust", ["daycare", "day care", "childcare", "child care", "preschool", "pre-k", "early learning", "nursery"]),
  I("movers", "moving company", "moving companies", "local-service", "stress-free moves", ["moving company", "movers", "moving", "relocation", "packing services", "storage units"]),
  I("pest-control", "pest control company", "pest control companies", "local-service", "pest removal and prevention", ["pest control", "exterminator", "termites", "termite", "rodents", "bed bugs", "mosquito", "pests"]),
  I("pool-services", "pool service", "pool services", "local-service", "pool cleaning and repair", ["pool", "pools", "pool cleaning", "pool service", "pool repair", "hot tub", "spa repair"]),
  I("solar-installers", "solar installer", "solar installers", "local-service", "solar panels and lower power bills", ["solar", "solar panels", "solar installation", "battery storage", "renewable energy"]),
  I("insurance-agents", "insurance agent", "insurance agents", "professional", "the right insurance cover", ["insurance", "insurance agent", "auto insurance", "home insurance", "life insurance", "health insurance", "coverage", "policy quotes"]),
  I("mortgage-brokers", "mortgage broker", "mortgage brokers", "professional", "home loans and refinancing", ["mortgage", "mortgages", "home loan", "home loans", "refinance", "refinancing", "loan officer", "pre-approval", "lender"]),
  I("travel-agencies", "travel agency", "travel agencies", "professional", "trips planned for you", ["travel agency", "travel agent", "vacation", "vacations", "cruise", "cruises", "tours", "honeymoon", "itinerary", "travel"]),
  I("event-planners", "event planner", "event planners", "professional", "events planned end to end", ["event planner", "event planning", "wedding planner", "party planning", "corporate events", "event coordination"]),
];

export const INDUSTRY_BY_SLUG: ReadonlyMap<string, Industry> = new Map(INDUSTRIES.map((i) => [i.slug, i]));

export function getIndustry(slug: string): Industry | undefined {
  return INDUSTRY_BY_SLUG.get(slug);
}

/** Loose input: AdRun.extraction (JSON) and/or BrandProfile fields. Unknown shapes are ignored. */
export interface ClassifyInput {
  brandName?: unknown;
  mainOffer?: unknown;
  audience?: unknown;
  facts?: unknown;
  pains?: unknown;
  domain?: unknown;
  url?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const listText = (v: unknown): string =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? str((x as Record<string, unknown>).claim) || str((x as Record<string, unknown>).text) : "")).join(" ") : "";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function count(text: string, kw: string): number {
  const re = new RegExp(`(?:^|[^a-z0-9])${escape(kw)}(?=$|[^a-z0-9])`, "g");
  return text.match(re)?.length ?? 0;
}

/** Score per industry: name/offer/domain hits weigh 3, audience 1.5, facts/pains 0.5; phrases (multi-word) weigh x1.5. */
export function scoreIndustries(input: ClassifyInput): Array<{ slug: string; score: number }> {
  const domain = (str(input.domain) || str(input.url)).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
  const fields: Array<[string, number]> = [
    [`${str(input.brandName)} ${str(input.mainOffer)}`.toLowerCase(), 3],
    [str(input.audience).toLowerCase(), 1.5],
    [`${listText(input.facts)} ${listText(input.pains)}`.toLowerCase(), 0.5],
  ];
  const scores = INDUSTRIES.map((ind) => {
    let score = 0;
    for (const kw of ind.keywords) {
      const phrase = kw.includes(" ") ? 1.5 : 1;
      for (const [text, w] of fields) score += Math.min(count(text, kw), 3) * w * phrase;
      if (domain.includes(kw.replace(/[^a-z0-9]/g, ""))) score += 2;
    }
    return { slug: ind.slug, score };
  });
  return scores.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || INDUSTRIES.findIndex((i) => i.slug === a.slug) - INDUSTRIES.findIndex((i) => i.slug === b.slug));
}

/** Minimum score to trust a classification (one offer/name keyword hit = 3). */
export const MIN_INDUSTRY_SCORE = 3;

export function classifyIndustry(input: ClassifyInput): Industry | null {
  const top = scoreIndustries(input)[0];
  return top && top.score >= MIN_INDUSTRY_SCORE ? (INDUSTRY_BY_SLUG.get(top.slug) ?? null) : null;
}

/** Industry pages render always but stay noindex (and out of sitemap/llms.txt) below this many consented ads. */
export const MIN_INDEXABLE_INDUSTRY_ADS = 3;

export const AWARENESS_LABEL: Record<string, string> = {
  unaware: "Unaware",
  problem_aware: "Problem aware",
  solution_aware: "Solution aware",
  product_aware: "Product aware",
  most_aware: "Most aware",
};

const AWARENESS_WHY: Record<string, string> = {
  unaware: "It stops the scroll for people who aren't looking yet, opening on a moment they recognise.",
  problem_aware: "It speaks to a problem the viewer already feels, before naming the fix.",
  solution_aware: "It's for people comparing options, so it shows why this one is the easy choice.",
  product_aware: "It's for people who know the brand, so it leans on specifics and a reason to act now.",
  most_aware: "It's for people ready to buy, so it gets out of the way: offer and call to action.",
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** 'Why it works' in 1-2 lines, built only from the ad's own fields (no invented results). */
export function whyItWorks(ad: { awareness: string; angle: string; hook: string }): string {
  const angle = ad.angle.trim().replace(/\.$/, "");
  const lead = angle ? `Angle: ${clip(angle, 110)}.` : "";
  return [lead, AWARENESS_WHY[ad.awareness] ?? ""].filter(Boolean).join(" ");
}

export interface IndustryGuide {
  intro: string;
  sections: Array<{ title: string; points: string[] }>;
  faq: Array<{ q: string; a: string }>;
}

const SHOW: Record<IndustryKind, (i: Industry) => string[]> = {
  "local-venue": (i) => [`The real space, team and ${i.offer}: your own photos beat stock every time.`, "Where you are, in words locals use (neighbourhood, street, landmark).", "One clear reason to visit this week, and how to book or find you."],
  "local-service": (i) => [`The finished job: before/after photos of ${i.offer}, taken by you.`, "Your service area and how fast you respond, if your site says so.", "A face: the owner or crew builds trust before anyone lets you in their home."],
  shop: (i) => [`The product itself, close up: ${i.offer} people can almost touch.`, "Who it's for or the occasion (gifts, holidays, everyday treats).", "How to get it: delivery area, pickup or order online."],
  professional: (i) => [`The person behind the service: ${i.offer} is bought on trust.`, "The situation your client is in, told in their words.", "What the first step looks like (a call, a consult, a quote) and what it costs, if you publish it."],
  online: (i) => [`The product in use: ${i.offer}, shown doing its job.`, "The before-and-after moment for the buyer, in their own words.", "The offer and the risk-reversal you really have (trial, returns, guarantee)."],
};

const HOOKS = (i: Industry): string[] => [
  `A private thought your customer has right before they need ${i.offer} ("is it worth it?", "who do I even call?").`,
  "A specific detail from your own website: a signature product, a promise, a local name.",
  "A question that sorts the right people in, and the wrong people out.",
];

const OFFERS = (i: Industry): string[] => [
  "Only promote offers you actually run: a first-visit deal, a free quote, a seasonal special.",
  `Make the next step small and concrete for a ${i.singular}: book, call, order, visit.`,
  "Skip claims you can't back up. Real reviews and real photos do more than superlatives.",
];

/** Evergreen, truthful guide + FAQ for an industry page (templated; no stats, no promises). */
export function industryGuide(i: Industry): IndustryGuide {
  return {
    intro: `These are real Facebook and Instagram ads made by ${i.plural} with Komendly, each built from the business's own website and shared with the owner's permission. Use them as a swipe file: notice what each ad shows, who it speaks to, and how it asks for the click.`,
    sections: [
      { title: `What to show in a ${i.singular} ad`, points: SHOW[i.kind](i) },
      { title: "Hooks that tend to work", points: HOOKS(i) },
      { title: "Offers and calls to action", points: OFFERS(i) },
    ],
    faq: [
      { q: `What makes a good Facebook ad for a ${i.singular}?`, a: `One clear idea per ad, a real photo or visual of ${i.offer}, words your customers would use themselves, and one simple next step. Test a few different angles rather than one "perfect" ad.` },
      { q: `How many ads should a ${i.singular} run at once?`, a: "Start with several distinct angles (for example a problem, an offer and a reminder for people who already know you), then keep the ones that earn clicks and replace the rest." },
      { q: "Are these real ads?", a: "Yes. Every ad on this page was generated by Komendly from a real business website, and the business gave us permission to show it. We don't show their results, only the creative." },
      { q: `Can I make ads like these for my ${i.singular} business?`, a: "Yes. Paste your website and Komendly makes 10 ready-to-run static ads plus an animated one for free, using your own brand, photos and offers." },
    ],
  };
}

const G = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Blog tag slugs relevant to an industry: its own names/tags first, then generic ad-making tags. */
export function industryTagSlugs(i: Industry): string[] {
  const own = [i.singular, i.plural, i.slug, ...(i.tags ?? [])].map(G);
  const generic = ["facebook-ads", "meta-ads", "instagram-ads", "ad-creative", "ad-creatives", "ad-examples", "local-business"];
  return Array.from(new Set([...own, ...generic]));
}

/** Related industries that have ads: same kind first, then the rest (list order), excluding itself. */
export function relatedIndustries(i: Industry, available: ReadonlySet<string>, limit = 6): Industry[] {
  const pool = INDUSTRIES.filter((x) => x.slug !== i.slug && available.has(x.slug));
  return [...pool.filter((x) => x.kind === i.kind), ...pool.filter((x) => x.kind !== i.kind)].slice(0, limit);
}

export function galleryCtaHref(slug: string, content = "page"): string {
  const q = new URLSearchParams({ utm_source: "seo", utm_medium: "gallery", utm_campaign: slug, utm_content: content });
  return `/free-ads?${q.toString()}`;
}
