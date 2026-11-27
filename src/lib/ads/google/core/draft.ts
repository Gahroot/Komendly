// Draft builder: site extraction -> RSA headlines/descriptions/paths, keywords, service-area geo queries and a budget
// suggestion. Text comes from the AI gateway when it answers (grounded ONLY in the extraction), else from the rules
// below; both go through the same filters: Google limits (text.ts), no cut-off phrases (a line that doesn't fit is
// dropped, never truncated), no generic keywords, numbers/prices only when they appear in the extracted facts.
// Framework-free (the engine imports this folder): the AI call is injected as a GatewayTextFn.
import type { GatewayRequest, GatewayTextFn } from "../../../ai-gateway/core";
import { LIMITS, type GeoPick, type KeywordPick, type SearchCopy } from "./types";
import { cleanText, dedupe, displayWidth, pathText } from "./text";

export interface DraftAdInput { headline?: string | null; body?: string | null; cta?: string | null }
export interface DraftRunInput {
  brandName: string;
  landingPage: string;
  mainOffer?: string | null;
  audience?: string | null;
  /** Products/services the business sells (lowercase phrases). Derived from the text when missing. */
  services?: string[];
  location?: string | null; // "Austin, TX"
  /** Service areas named on the site ("Dallas-Fort Worth Metroplex"). Derived from the text when missing. */
  serviceAreas?: string[];
  facts?: string[];
  /** Verbatim site quotes: only used to check that numbers/prices in a line really appear on the site. */
  quotes?: string[];
}

// ---------- word lists ----------

/** Words that can't carry a keyword or headline on their own (spends money on searches that aren't buyers). */
const GENERIC = new Set([
  "money", "free", "best", "cheap", "cheapest", "affordable", "estimate", "estimates", "quote", "quotes", "save", "saving", "savings",
  "energy", "financing", "finance", "deal", "deals", "discount", "discounts", "offer", "offers", "price", "prices", "cost", "costs",
  "custom", "available", "quality", "high", "professional", "services", "service", "products", "product", "solutions", "great",
  "top", "local", "near", "me", "today", "now", "new", "more", "get", "call", "contact", "us", "info", "information", "details",
  "work", "job", "jobs", "help", "home", "company", "business", "team", "expert", "experts", "staff", "area", "areas",
]);
/** Words a complete phrase never ends on (a sign it was cut). */
const DANGLING = new Set(["a", "an", "the", "and", "or", "but", "of", "to", "for", "with", "from", "in", "on", "at", "by", "as", "into", "your", "our", "my", "their", "its", "that", "which", "who", "would", "will", "can", "is", "are", "be", "so", "than", "if", "&", "+", "-", "/"]);
const BAD_START = new Set(["with", "and", "or", "but", "to", "from", "of", "so", "than", "that", "which", "who", "would", "&"]);
const PRONOUNS = new Set(["i", "we", "you", "me", "my", "our", "your", "us", "they", "their"]);
const ACTIONS = ["installation", "install", "installs", "repair", "repairs", "replacement", "cleaning", "inspection", "inspections", "maintenance", "remodeling", "removal"];
const AREA_SUFFIX = /\s+(metroplex|metro area|metropolitan area|metro|area|region|and surrounding areas?)$/i;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const lower = (s: string) => s.toLowerCase();

function titleCase(s: string): string {
  return s.replace(/(^|[\s/-])(\p{Ll})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/\b(And|Or|Of|The|In|For|With|To|A|An|On|At)\b/g, (w, _x, i: number) => (i === 0 ? w : w.toLowerCase()));
}

function singular(w: string): string {
  if (/(ss|us|is|ing)$/i.test(w)) return w;
  if (/ies$/i.test(w)) return w.slice(0, -3) + "y";
  if (/(ches|shes|xes)$/i.test(w)) return w.slice(0, -2);
  return w.replace(/s$/i, "");
}

// ---------- checks every line passes (AI or rules) ----------

/** Numbers, percents and prices in `line` must appear in the source text as written. */
export function numbersGrounded(line: string, source: string): boolean {
  const src = source.toLowerCase().replace(/\s+/g, " ");
  const tokens = line.match(/[$€£]?\d[\d,.]*%?/g) ?? [];
  return tokens.every((t) => src.includes(t.toLowerCase().replace(/[.,]$/, "")));
}

/** Ends on a word a finished phrase never ends on, or on a joiner/comma: it was cut mid-phrase. */
export function isFragment(s: string): boolean {
  const t = s.trim();
  if (!t || /[,;:\-/&+(]$/.test(t)) return true;
  if ((t.match(/\(/g)?.length ?? 0) !== (t.match(/\)/g)?.length ?? 0)) return true;
  if ((t.match(/"/g)?.length ?? 0) % 2 === 1) return true;
  const last = lower(words(t).pop()!.replace(/[.!?]+$/, ""));
  return DANGLING.has(last);
}

const allGeneric = (s: string) => words(lower(s).replace(/[^\p{L}\p{N}\s]/gu, " ")).every((w) => GENERIC.has(w) || DANGLING.has(w));

/** A whole headline (never trimmed): cleaned, <= 30 wide, 2+ words (or the brand), complete, specific, grounded. */
export function headlineOk(raw: string, o: { source: string; brand?: string }): string | null {
  if (/!/.test(raw) || /[@#^*~=<>{}[\]|\\]/.test(raw)) return null;
  const s = cleanText(raw).replace(/[.]+$/, "").trim();
  if (!s || displayWidth(s) > LIMITS.headline) return null;
  const isBrand = !!o.brand && lower(s) === lower(o.brand);
  // "Money" (one word) and "With Free Estimates" (starts on a joiner) are pieces of a sentence, not headlines.
  if (!isBrand && (words(s).length < 2 || BAD_START.has(lower(words(s)[0]!)) || (words(s).length < 3 && allGeneric(s)))) return null;
  if (isFragment(s) || !numbersGrounded(s, o.source)) return null;
  if (/^(i|we|my|our)\b/i.test(s) && !isBrand) return null; // social-style first person ("I want windows that...")
  return s;
}

/** A whole description sentence (never trimmed): cleaned, <= 90 wide, 4+ words, complete, grounded. */
export function descriptionOk(raw: string, o: { source: string }): string | null {
  if (/[@#^*~=<>{}[\]|\\]/.test(raw)) return null;
  let s = cleanText(raw, { allowExclamation: true }).trim();
  if (!s) return null;
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  if (displayWidth(s) > LIMITS.description || words(s).length < 4) return null;
  if (isFragment(s.replace(/[.!?]+$/, "")) || !numbersGrounded(s, o.source)) return null;
  return s;
}

/** Keyword text: lowercase letters/digits/spaces only, 2-4 words, and the service part isn't generic. */
export function keywordOk(raw: string): string | null {
  if (/[.,!?;:"()]/.test(raw.replace(/\.$/, ""))) return null; // a sentence piece, not a search phrase
  const s = lower(cleanText(raw)).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const ws = words(s);
  if (ws.length < 2 || ws.length > 4 || s.length > LIMITS.keywordChars) return null;
  const core = ws.filter((w, i) => !(w === "near" && ws[i + 1] === "me") && !(w === "me" && ws[i - 1] === "near"));
  if (!core.length || core.every((w) => GENERIC.has(w)) || ws.some((w) => DANGLING.has(w))) return null;
  if (core.some((w) => PRONOUNS.has(w))) return null;
  return s;
}

/** A product/service phrase the business sells: 1-4 words, letters/hyphens only, specific. */
export function servicePhraseOk(raw: string): string | null {
  const s = lower(raw).replace(/\s+/g, " ").replace(/^(the|a|an|our|your|all|other|and|or)\s+/, "").replace(/[.]+$/, "").trim();
  if (!s || !/^[\p{L}][\p{L}\s'-]*$/u.test(s)) return null;
  const ws = words(s);
  if (ws.length > 4 || ws.some((w) => PRONOUNS.has(w) || DANGLING.has(w))) return null;
  if (ws.every((w) => GENERIC.has(w))) return null;
  return s;
}

// ---------- reading the extraction ----------

interface Service { text: string; action: string | null }

const STOP = /\s+(?:to|with|so|that|which|while|because|plus|since|including|backed|from)\s+|[.;:()!?]/i;

function listItems(segment: string): string[] {
  return segment.split(/,|\band\b|&|\//i).map((x) => x.trim()).filter(Boolean);
}

/** Services named after "installation of / repair of / offers ..." in the offer and facts; else the offer split as a list. */
export function servicesFromText(texts: string[]): Service[] {
  const out: Service[] = [];
  const add = (raw: string, action: string | null) => {
    const t = servicePhraseOk(raw.replace(/\b(high[- ]quality|quality|professional|expert)\b/gi, "").trim());
    if (t && !out.some((s) => s.text === t)) out.push({ text: t, action });
  };
  const re = new RegExp(`\\b(${ACTIONS.join("|")})\\s+(?:of|for|on)\\s+([^]*)`, "i");
  for (const raw of texts) {
    const m = raw.match(re);
    if (!m) continue;
    const action = lower(m[1]!).replace(/^install(s)?$/, "installation").replace(/^repairs$/, "repair").replace(/^inspections$/, "inspection");
    for (const item of listItems(m[2]!.split(STOP)[0] ?? "")) add(item, action);
  }
  if (!out.length) {
    for (const raw of texts.slice(0, 1)) for (const item of listItems((raw.replace(/\(.*?\)/g, "").split(STOP)[0]) ?? "")) add(item, null);
  }
  return out.slice(0, 8);
}

const CAP = "\\p{Lu}[\\p{L}.'’]*";
const PLACE = `${CAP}(?:(?:[ /-]|\\s(?:of|and)\\s)${CAP})*`;

/** Places the site says it serves or is based in ("serving the Dallas-Fort Worth Metroplex", "located in Frisco, Texas"). */
export function areasFromText(texts: string[], o: { servedOnly?: boolean } = {}): string[] {
  const out: string[] = [];
  const serve = new RegExp(`\\b(?:[Ss]erv(?:e|es|ed|ing|ice|ices|icing)|[Cc]over(?:s|ing)?|[Aa]cross|[Tt]hroughout)\\s+(?:all\\s+of\\s+)?(?:the\\s+)?(?:[Gg]reater\\s+)?(${PLACE})`, "gu");
  const based = new RegExp(`\\b(?:[Ll]ocated|[Bb]ased|[Hh]eadquartered)\\s+in\\s+(${PLACE}(?:,\\s*${PLACE})?)`, "gu");
  for (const re of o.servedOnly ? [serve] : [serve, based]) for (const t of texts) for (const m of t.matchAll(re)) {
    const a = m[1]!.replace(/[.'’]+$/, "").trim();
    if (a.length >= 3 && !/^(The|Our|Your|All)$/.test(a)) out.push(a);
  }
  return dedupe(out).slice(0, 4);
}

/** "Dallas-Fort Worth Metroplex" -> ["Dallas", "Fort Worth"]; "Frisco, Texas" -> ["Frisco"]. */
export function citiesOf(area: string): string[] {
  const base = area.split(",")[0]!.replace(AREA_SUFFIX, "").replace(/\bFt\.?\s/g, "Fort ").trim();
  return base.split(/\s*[-/]\s*|\s+and\s+/).map((c) => c.trim()).filter((c) => c.length >= 3 && c.length <= 30 && /^\p{Lu}/u.test(c));
}

/** City part of a location string ("Austin, TX" -> "Austin"). */
export function cityOf(location: string | null | undefined): string | null {
  const c = (location ?? "").split(",")[0]?.trim();
  return c && c.length <= 40 ? c : null;
}

function sourceText(run: DraftRunInput): string {
  return [run.brandName, run.mainOffer ?? "", run.audience ?? "", run.location ?? "", ...(run.facts ?? []), ...(run.quotes ?? []), ...(run.serviceAreas ?? [])].join(" \n ");
}

function servicesOf(run: DraftRunInput): Service[] {
  const given = (run.services ?? []).map((s) => servicePhraseOk(s)).filter((s): s is string => !!s);
  const found = servicesFromText([run.mainOffer ?? "", ...(run.facts ?? [])].filter(Boolean));
  const out: Service[] = [];
  for (const s of [...given.map((text) => ({ text, action: found.find((f) => f.text === text)?.action ?? found.find((f) => f.action)?.action ?? null })), ...found]) {
    if (!out.some((o) => o.text === s.text)) out.push(s);
  }
  return out.slice(0, 8);
}

function areasOf(run: DraftRunInput): string[] {
  return dedupe([...(run.serviceAreas ?? []), ...areasFromText([...(run.facts ?? []), run.mainOffer ?? "", run.audience ?? ""])]).slice(0, 4);
}

function citiesFor(run: DraftRunInput): string[] {
  const own = cityOf(run.location);
  return dedupe([...areasOf(run).flatMap(citiesOf), ...(own ? [own] : [])]).slice(0, 3);
}

/** Back-compat: service phrases as plain strings. */
export function servicesFrom(run: DraftRunInput): string[] {
  return servicesOf(run).map((s) => s.text);
}

/** Search phrase for a service: multi-word as is ("replacement windows"); one word gets its action ("door installation"). */
function serviceCore(s: Service): string | null {
  const t = s.text.replace(/-/g, " ");
  if (words(t).length >= 2) return t;
  return s.action ? `${singular(t)} ${s.action}` : null;
}

// ---------- rules drafter ----------

const FILLER_HEADLINES = ["Visit Our Website", "Get in Touch Today", "See What We Offer", "Talk to Our Team", "Learn More Online"];
const FILLER_DESCRIPTIONS = [
  "Visit our website to see what we offer and get in touch with our team.",
  "Have a question? Reach out today and we will get back to you.",
];

export function draftSearchCopy(run: DraftRunInput, ads: DraftAdInput[] = []): SearchCopy {
  const source = sourceText(run);
  const brand = cleanText(run.brandName).replace(/[.]+$/, "");
  const services = servicesOf(run);
  const areas = areasOf(run);
  const cities = citiesFor(run);
  const city = cities[0] ?? null;
  const factText = (run.facts ?? []).join(" ");
  const cores = services.map((s) => titleCase(serviceCore(s) ?? s.text));
  const h: string[] = [brand, ...cores];
  // Offers and trust points, only when a fact says so (whole short clauses, never cut).
  for (const f of run.facts ?? []) {
    const clause = f.split(/;|\.\s/)[0]!.trim();
    if (words(clause).length <= 5) h.push(titleCase(clause));
  }
  const served = areasFromText(run.facts ?? [], { servedOnly: true });
  for (const f of run.facts ?? []) {
    const y = f.match(/\bsince (\d{4})\b/i)?.[1];
    if (!y) continue;
    for (const a of areasFromText([f], { servedOnly: true })) h.push(`Serving ${a.replace(AREA_SUFFIX, "")} Since ${y}`);
    h.push(`In Business Since ${y}`);
  }
  for (const a of [...served, ...areas.filter((x) => (run.serviceAreas ?? []).includes(x))]) h.push(`Serving ${a.split(",")[0]!.replace(AREA_SUFFIX, "")}`);
  if (/locally owned/i.test(factText)) h.push("Locally Owned Business");
  if (city) for (const c of cores.slice(0, 3)) h.push(`${c} in ${city}`);
  for (const a of ads) if (a.cta) h.push(titleCase(a.cta));
  h.push(`Contact ${brand}`);
  if (city) for (const c of cores.slice(3)) h.push(`${c} in ${city}`);
  let headlines = dedupe(h.map((x) => headlineOk(x, { source, brand })).filter((x): x is string => !!x)).slice(0, LIMITS.headlinesMax);
  if (headlines.length < 5) headlines = dedupe([...headlines, ...FILLER_HEADLINES]).slice(0, Math.max(5, headlines.length));
  return { headlines, descriptions: draftDescriptions(run, services, areas), ...draftPaths(services, city) };
}

function joinList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function draftDescriptions(run: DraftRunInput, services: Service[], areas: string[]): string[] {
  const source = sourceText(run);
  const brand = cleanText(run.brandName).replace(/[.]+$/, "");
  const d: string[] = [];
  if (run.mainOffer) d.push(run.mainOffer);
  // "Fidelity Windows installs replacement windows, doors and siding in Dallas-Fort Worth." with as many services as fit.
  const where = areas[0] ? ` in ${areas[0].split(",")[0]!.replace(AREA_SUFFIX, "")}` : "";
  for (let n = Math.min(services.length, 5); n >= 1; n--) {
    const line = `${brand} offers ${joinList(services.slice(0, n).map((s) => s.text))}${where}.`;
    if (descriptionOk(line, { source })) { d.push(line); break; }
  }
  for (const f of run.facts ?? []) d.push(f);
  let out = dedupe(d.map((x) => descriptionOk(x, { source })).filter((x): x is string => !!x)).slice(0, LIMITS.descriptionsMax);
  if (out.length < LIMITS.descriptionsMin) out = dedupe([...out, ...FILLER_DESCRIPTIONS]).slice(0, LIMITS.descriptionsMax);
  return out;
}

function draftPaths(services: Service[], city: string | null): { path1: string; path2: string } {
  let path1 = "";
  for (const s of services) {
    const full = s.text.replace(/\s+/g, "-");
    const head = words(s.text).pop() ?? "";
    const p = pathText(full) === full && full.length <= LIMITS.path ? full : pathText(head) === head ? head : "";
    if (p) { path1 = p; break; }
  }
  const path2 = city ? pathText(city) : "";
  return { path1, path2: path1 && path2 && path2 !== path1 && pathText(city) === lower(city!).replace(/\s+/g, "-") ? path2 : "" };
}

/** Phrase/exact keywords: what the business sells, + "near me" and service-area cities. Max 15, deduped, no generic words. */
export function draftKeywords(run: DraftRunInput, ideas: string[] = []): KeywordPick[] {
  const cores = servicesOf(run).map(serviceCore).filter((c): c is string => !!c && !!keywordOk(c));
  const cities = citiesFor(run).map(lower);
  const out: KeywordPick[] = [];
  const add = (t: string, match: KeywordPick["match"]) => {
    const text = keywordOk(t);
    if (text && out.length < 15 && !out.some((k) => k.text === text && k.match === match)) out.push({ text, match });
  };
  for (const c of cores) add(c, "PHRASE");
  if (cities[0]) for (const c of cores.slice(0, 4)) add(`${c} ${cities[0]}`, "PHRASE");
  for (const c of cores.slice(0, 4)) add(`${c} near me`, "PHRASE");
  if (cities[0]) for (const c of cores.slice(0, 2)) add(`${c} ${cities[0]}`, "EXACT");
  if (cities[0]) for (const c of cores.slice(4)) add(`${c} ${cities[0]}`, "PHRASE");
  for (const city of cities.slice(1)) for (const c of cores.slice(0, 3)) add(`${c} ${city}`, "PHRASE");
  for (const i of ideas.slice(0, 10)) add(i, "PHRASE");
  add(run.brandName, "PHRASE");
  return out;
}

// ---------- AI drafter (via the AI gateway; injected) ----------

export interface GoogleDraft { search: SearchCopy; keywords: KeywordPick[]; serviceAreas: string[]; source: "ai" | "rules" }

const AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headlines", "descriptions", "services", "serviceAreas"],
  properties: {
    headlines: { type: "array", items: { type: "string" } },
    descriptions: { type: "array", items: { type: "string" } },
    services: { type: "array", items: { type: "string" } },
    serviceAreas: { type: "array", items: { type: "string" } },
  },
} as const;

export function googleDraftRequest(run: DraftRunInput): GatewayRequest {
  const system = [
    "You write Google Ads Responsive Search Ads for small local businesses. Reply with JSON only.",
    "Use ONLY the facts given. Never invent claims, awards, guarantees, years, prices, percentages or numbers: a number may appear only if it is in the facts exactly as written.",
    "Never promise results. Google editorial rules: no '!' in headlines, no ALL CAPS words, no emoji, no repeated or gimmicky punctuation, no first person ('I', 'we want').",
    "headlines: 12-15, each a complete phrase of at most 30 characters (count them), Title Case, all different. Mix: the business name, each service, service + city, offers from the facts, trust points from the facts. Never end on a word like 'from', 'with', 'and', 'the'.",
    "descriptions: 4, each one complete sentence of at most 90 characters, ending with a period.",
    "services: the products/services the business sells, 1-4 words each, lowercase, as people would search them (e.g. 'replacement windows'). Not offers like 'free estimates' or 'financing'.",
    "serviceAreas: the places the facts say the business serves or is located in, written as in the facts.",
  ].join("\n");
  const prompt = JSON.stringify({
    businessName: run.brandName, website: run.landingPage, mainOffer: run.mainOffer ?? "", audience: run.audience ?? "", location: run.location ?? "",
    facts: (run.facts ?? []).slice(0, 25),
  }, null, 1);
  return { system, prompt, jsonSchema: AI_SCHEMA as unknown as Record<string, unknown> };
}

const strList = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);

/** Validate the AI's JSON line by line (drop, never trim). Null when too little survives. */
export function parseAiDraft(raw: unknown, run: DraftRunInput): { headlines: string[]; descriptions: string[]; services: string[]; serviceAreas: string[] } | null {
  let j = raw;
  if (typeof j === "string") { try { j = JSON.parse(j.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return null; } }
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const source = sourceText(run);
  const headlines = dedupe(strList(o.headlines, 30).map((h) => headlineOk(h, { source, brand: run.brandName })).filter((x): x is string => !!x)).slice(0, LIMITS.headlinesMax);
  const descriptions = dedupe(strList(o.descriptions, 10).map((d) => descriptionOk(d, { source })).filter((x): x is string => !!x)).slice(0, LIMITS.descriptionsMax);
  const services = dedupe(strList(o.services, 12).map((s) => servicePhraseOk(s)).filter((x): x is string => !!x)).slice(0, 8);
  const src = lower(source);
  const serviceAreas = dedupe(strList(o.serviceAreas, 6).map((a) => cleanText(a)).filter((a) => a.length >= 3 && src.includes(lower(a)))).slice(0, 4);
  if (headlines.length < LIMITS.headlinesMin || descriptions.length < LIMITS.descriptionsMin) return null;
  return { headlines, descriptions, services, serviceAreas };
}

/** AI first (when `text` is given), rules as the fallback and to fill up; both pass the same filters. */
export async function draftGoogleCopy(run: DraftRunInput, ads: DraftAdInput[], text?: GatewayTextFn): Promise<GoogleDraft> {
  let ai: ReturnType<typeof parseAiDraft> = null;
  if (text) {
    try {
      const r = await text(googleDraftRequest(run));
      ai = parseAiDraft(r.json ?? r.text, run);
    } catch {
      ai = null;
    }
  }
  const enriched: DraftRunInput = ai
    ? { ...run, services: dedupe([...(ai.services), ...(run.services ?? [])]), serviceAreas: dedupe([...(run.serviceAreas ?? []), ...ai.serviceAreas]) }
    : run;
  const rules = draftSearchCopy(enriched, ads);
  const keywords = draftKeywords(enriched);
  const serviceAreas = areasOf(enriched);
  if (!ai) return { search: rules, keywords, serviceAreas, source: "rules" };
  const fillers = new Set([...FILLER_HEADLINES, ...FILLER_DESCRIPTIONS].map(lower));
  const headlines = dedupe([...ai.headlines, ...rules.headlines.filter((h) => !fillers.has(lower(h)))]).slice(0, LIMITS.headlinesMax);
  const descriptions = dedupe([...ai.descriptions, ...rules.descriptions.filter((d) => !fillers.has(lower(d)))]).slice(0, LIMITS.descriptionsMax);
  return { search: { ...rules, headlines, descriptions }, keywords, serviceAreas, source: "ai" };
}

// ---------- geo suggestion from the service area ----------

/** Geo-suggest queries for the service areas, most specific first ("Dallas-Fort Worth", "Dallas-Ft. Worth", "Dallas"...). */
export function geoQueries(areas: string[], location?: string | null): string[] {
  const q: string[] = [];
  for (const a of areas) {
    const base = a.replace(AREA_SUFFIX, "").trim();
    q.push(a, base, base.replace(/\bFort\b/g, "Ft."), base.replace(/\//g, "-"));
    q.push(...citiesOf(a));
  }
  if (location) q.push(location);
  return dedupe(q.map((x) => x.trim()).filter((x) => x.length >= 3)).slice(0, 8);
}

const geoTokens = (s: string) => words(lower(s).replace(/\bft\b\.?/g, "fort").replace(/[^\p{L}\p{N}]+/gu, " ").replace(AREA_SUFFIX, ""))
  .filter((w) => !["the", "greater", "metroplex", "metro", "area", "region", "of", "and"].includes(w));
const TYPE_RANK = ["DMA Region", "City", "County", "Metro", "Region", "State", "Province", "Municipality", "Borough", "Neighborhood", "Postal Code", "Airport"];

/** Best Google location for an area name; null unless it covers 2/3+ of the area's words. */
export function pickBestGeo(area: string, picks: GeoPick[]): { pick: GeoPick; score: number } | null {
  const want = geoTokens(area.split(",")[0]!);
  if (!want.length) return null;
  let best: { pick: GeoPick; score: number; rank: number; extra: number } | null = null;
  for (const p of picks) {
    if (p.kind !== "location") continue;
    const all = new Set(geoTokens(p.name));
    const head = geoTokens(p.name.split(",")[0]!).filter((w) => w.length > 2);
    const score = want.filter((w) => all.has(w)).length / want.length;
    const rank = TYPE_RANK.indexOf(p.type) < 0 ? TYPE_RANK.length : TYPE_RANK.indexOf(p.type);
    const extra = head.filter((w) => !want.includes(w)).length;
    if (!best || score > best.score || (score === best.score && (extra < best.extra || (extra === best.extra && rank < best.rank)))) best = { pick: p, score, rank, extra };
  }
  return best && best.score >= 0.66 ? { pick: best.pick, score: best.score } : null;
}

/** Runs geo-suggest for the area queries (injected search) and returns the best match, or null. */
export async function suggestServiceArea(areas: string[], location: string | null | undefined, search: (q: string) => Promise<GeoPick[]>, maxCalls = 4): Promise<GeoPick | null> {
  const target = areas[0] ?? location ?? "";
  if (!target) return null;
  let best: { pick: GeoPick; score: number } | null = null;
  let calls = 0;
  for (const q of geoQueries(areas, location)) {
    if (calls++ >= maxCalls) break;
    let picks: GeoPick[] = [];
    try { picks = await search(q); } catch { continue; }
    const m = pickBestGeo(target, picks);
    if (m && (!best || m.score > best.score)) best = m;
    if (best && best.score >= 1) break;
  }
  return best?.pick ?? null;
}

// ---------- budget ----------

/** Daily budget suggestion + floor in the account currency (major units). Unknown currencies use the USD numbers. */
const BUDGETS: Record<string, { suggested: number; min: number }> = {
  USD: { suggested: 20, min: 5 }, CAD: { suggested: 25, min: 7 }, AUD: { suggested: 30, min: 8 }, NZD: { suggested: 30, min: 8 },
  EUR: { suggested: 20, min: 5 }, GBP: { suggested: 15, min: 4 }, CHF: { suggested: 20, min: 5 }, SGD: { suggested: 25, min: 7 },
  SEK: { suggested: 200, min: 50 }, NOK: { suggested: 200, min: 50 }, DKK: { suggested: 150, min: 35 }, PLN: { suggested: 80, min: 20 },
  JPY: { suggested: 3000, min: 750 }, INR: { suggested: 1500, min: 400 }, BRL: { suggested: 100, min: 25 }, MXN: { suggested: 350, min: 90 },
  ZAR: { suggested: 350, min: 90 }, AED: { suggested: 75, min: 20 }, HKD: { suggested: 150, min: 40 },
};

export function budgetSuggestion(currency: string | null | undefined): { suggestedDaily: number; currency: string; min: number } {
  const cur = (currency || "USD").toUpperCase();
  const b = BUDGETS[cur] ?? BUDGETS.USD!;
  return { suggestedDaily: b.suggested, currency: cur, min: b.min };
}

export function toMicros(major: number): number {
  return Math.round(major * 100) * 10_000; // round to cents, then micros (Google requires multiples of the currency's minor unit)
}
