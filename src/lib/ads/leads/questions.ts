// Per-trade Meta lead-form question sets (homeowner? timeline? ZIP? service needed?), keyed by Komendly niche
// (INDUSTRIES slug, src/lib/ads/industries.ts). Pure data + builders for the Meta publish code (lead-form `questions`).
// Custom question keys are stable: the lead alert email maps them back to labels (questionLabel).
// Contact fields are name + email by default; Komendly never calls or texts leads, the owner decides (includePhone).

export type LeadFormQuestionType = "CUSTOM" | "FULL_NAME" | "EMAIL" | "PHONE" | "ZIP";
export interface LeadFormQuestion { type: LeadFormQuestionType; key?: string; label?: string; options?: Array<{ key: string; value: string }> }
export interface TradeQuestionSet { niche: string; questions: LeadFormQuestion[] }

const opts = (...values: string[]) => values.map((value) => ({ key: value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), value }));

export const Q_KEYS = { homeowner: "kmd_homeowner", timeline: "kmd_timeline", service: "kmd_service", visit: "kmd_new_or_returning" } as const;

const LABELS: Record<string, string> = {
  [Q_KEYS.homeowner]: "Do you own the property?",
  [Q_KEYS.timeline]: "When do you need this done?",
  [Q_KEYS.service]: "What do you need help with?",
  [Q_KEYS.visit]: "Have you been here before?",
};

const SERVICES: Record<string, string[]> = {
  roofers: ["Roof repair", "Roof replacement", "Storm damage inspection", "Gutters"],
  plumbers: ["Leak or drain repair", "Water heater", "Sewer line", "Fixture install"],
  hvac: ["AC repair", "Heating repair", "New system", "Maintenance plan"],
  electricians: ["Panel upgrade", "EV charger", "Lighting or fixtures", "Repair or troubleshooting"],
  landscapers: ["Lawn care", "Cleanup", "Landscape design", "Hardscaping"],
  "cleaning-services": ["Recurring cleaning", "Deep clean", "Move-in or move-out", "Office cleaning"],
  contractors: ["Kitchen remodel", "Bathroom remodel", "Addition", "Deck or siding"],
  "pest-control": ["General pests", "Termites", "Rodents", "Mosquitoes"],
  "pool-services": ["Weekly cleaning", "Opening or closing", "Pump or filter repair", "Green pool cleanup"],
  "solar-installers": ["Solar panels", "Battery storage", "Panel maintenance"],
  "pressure-washing": ["Driveway or concrete", "House wash", "Deck or fence", "Roof wash"],
  handyman: ["Mounting or shelves", "Drywall or paint", "Door or fixture repair", "Furniture assembly"],
  painters: ["Interior painting", "Exterior painting", "Cabinets", "Deck or fence staining"],
  "garage-door": ["Spring or opener repair", "New garage door", "Opener install", "Tune-up"],
  "junk-removal": ["Household junk", "Cleanout", "Furniture or appliance", "Construction debris"],
  "tree-services": ["Tree removal", "Trimming", "Stump grinding", "Storm cleanup"],
  "appliance-repair": ["Washer or dryer", "Refrigerator", "Dishwasher", "Oven or range"],
  "interior-designers": ["Full room design", "E-design", "Furniture and window treatments", "Home staging"],
  movers: ["Local move", "Long-distance move", "Packing", "Storage"],
  locksmiths: ["Lockout", "Rekey", "New locks", "Car key"],
  "auto-repair": ["Diagnostics", "Brakes", "Maintenance", "Other repair"],
  "mobile-detailing": ["Interior detail", "Exterior detail", "Full detail", "Ceramic coating"],
  dentists: ["Cleaning and exam", "Whitening", "Clear aligners", "Implants or crowns"],
  chiropractors: ["Back or neck pain", "Sports injury", "Posture", "Massage"],
  "med-spas": ["Botox or fillers", "Laser hair removal", "Facial or peel", "Microneedling"],
  salons: ["Cut and color", "Highlights", "Blowout", "Nails or lashes"],
  barbers: ["Haircut", "Beard trim", "Shave", "Kids' cut"],
  gyms: ["Membership", "Group classes", "Personal training", "Kids or teen program"],
  "massage-therapists": ["Relaxation", "Deep tissue", "Sports", "Prenatal"],
  "real-estate-agents": ["Buying a home", "Selling a home", "Home valuation"],
  "law-firms": ["Estate planning", "Personal injury", "Family law", "Business law"],
  accountants: ["Tax preparation", "Bookkeeping", "Payroll", "Business advice"],
  "insurance-agents": ["Home", "Auto", "Life", "Business"],
  "mortgage-brokers": ["Buying a home", "Refinancing", "Pre-approval"],
};

/** Trades where the job is on the customer's property (ask homeowner?). */
const PROPERTY = new Set(["roofers", "plumbers", "hvac", "electricians", "landscapers", "contractors", "pest-control", "pool-services", "solar-installers", "pressure-washing", "painters", "garage-door", "tree-services", "interior-designers"]);
/** Trades with emergencies (timeline starts at "Today"). */
const URGENT = new Set(["plumbers", "hvac", "locksmiths", "garage-door", "appliance-repair", "towing", "auto-glass", "tree-services"]);
/** Venue-style businesses: ask new vs returning instead of homeowner. */
const VENUE = new Set(["dentists", "chiropractors", "med-spas", "salons", "barbers", "gyms", "yoga-studios", "massage-therapists", "optometrists", "veterinarians", "tattoo-shops"]);

export const TRADE_QUESTION_NICHES: readonly string[] = [...new Set([...Object.keys(SERVICES), ...PROPERTY, ...URGENT, ...VENUE])].sort();

/** Lead-form questions for a niche (unknown/missing niche = the generic set). Order: qualifiers first, then contact. */
export function leadFormQuestions(niche: string | null | undefined, o: { includePhone?: boolean } = {}): TradeQuestionSet {
  const n = (niche ?? "").trim().toLowerCase();
  const services = SERVICES[n];
  const q: LeadFormQuestion[] = [
    services
      ? { type: "CUSTOM", key: Q_KEYS.service, label: LABELS[Q_KEYS.service], options: opts(...services, "Something else") }
      : { type: "CUSTOM", key: Q_KEYS.service, label: LABELS[Q_KEYS.service] },
  ];
  if (PROPERTY.has(n)) q.push({ type: "CUSTOM", key: Q_KEYS.homeowner, label: LABELS[Q_KEYS.homeowner], options: opts("Yes, I own it", "No, I rent", "I manage it for someone") });
  if (VENUE.has(n)) q.push({ type: "CUSTOM", key: Q_KEYS.visit, label: LABELS[Q_KEYS.visit], options: opts("First visit", "I've been before") });
  q.push({ type: "CUSTOM", key: Q_KEYS.timeline, label: LABELS[Q_KEYS.timeline], options: URGENT.has(n) ? opts("Today", "This week", "Within a month", "Just planning") : opts("As soon as possible", "Within 2 weeks", "Within a month", "Just getting prices") });
  q.push({ type: "ZIP" }, { type: "FULL_NAME" }, { type: "EMAIL" });
  if (o.includePhone) q.push({ type: "PHONE" });
  return { niche: services || PROPERTY.has(n) || URGENT.has(n) || VENUE.has(n) ? n : "generic", questions: q };
}

const STANDARD: Record<string, string> = { full_name: "Name", first_name: "First name", last_name: "Last name", email: "Email", phone_number: "Phone", zip_code: "ZIP", post_code: "ZIP", city: "City", state: "State", street_address: "Address", company_name: "Company", job_title: "Job title" };

/** Human label for a lead field name (our custom keys, Meta standard fields, else the name tidied up). */
export function questionLabel(name: string): string {
  return LABELS[name] ?? STANDARD[name] ?? (name.replace(/[_?]+/g, " ").trim().replace(/^./, (c) => c.toUpperCase()) || "Answer");
}

const OPTION_VALUES = new Map(Object.values(SERVICES).flat().concat("Something else", "Yes, I own it", "No, I rent", "I manage it for someone", "First visit", "I've been before", "Today", "This week", "Within a month", "Just planning", "As soon as possible", "Within 2 weeks", "Just getting prices").flatMap((v) => opts(v).map((o) => [o.key, o.value] as const)));

/** Answer text: our option keys back to their display value (Meta may return the key); other values as given. */
export function answerText(values: readonly string[]): string {
  return values.map((v) => OPTION_VALUES.get(v.trim()) ?? v.trim()).filter(Boolean).join(", ");
}
