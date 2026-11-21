// Pure aggregation for the public data report /reports/local-service-meta-ads and the monthly
// /ad-examples/longest-running/<trade> leaderboards. Input = advertiser rows collected from the public Meta Ad Library
// (scripts/build-adlib-report.ts reads the JSONL and writes adlib-report-data.json). Output = anonymous aggregates only:
// no business names, page URLs or websites. Leaderboard entries carry a redacted copy excerpt + trade + state + the
// public "running since" date and Ad Library link, never the advertiser's name. Pure TS (no Next/Prisma/Node imports).

export const ADLIB_REPORT_PATH = "/reports/local-service-meta-ads";
export const LEADERBOARD_BASE = "/ad-examples/longest-running";
/** Below this many advertisers the report renders noindex and stays out of sitemap/llms.txt. */
export const MIN_INDEXABLE_ADVERTISERS = 500;
/** A trade or state row is only published with at least this many advertisers. */
export const MIN_GROUP = 20;
/** A trade leaderboard is indexable (and listed) only with at least this many advertisers behind it. */
export const MIN_LEADERBOARD_ADVERTISERS = 25;
/** A word or offer signal is only shown when at least this many different advertisers use it (anonymity). */
export const MIN_ADVERTISERS_FOR_TERM = 3;
export const LEADERBOARD_SIZE = 10;
/** A page-name word used by at least this many advertisers' ads is ordinary vocabulary, not an identifier. */
const COMMON_WORD_ADVERTISERS = 8;

export interface AdlibRow {
  page_name?: string | null;
  page_url?: string | null;
  website?: string | null;
  domain?: string | null;
  niche: string;
  city?: string | null;
  state: string;
  active_ads: number;
  first_seen: string;
  ad_text_sample?: string | null;
  library_url?: string | null;
  search_term?: string | null;
  /** Optional: "video" | "image" | ... when the collector recorded it. */
  media_type?: string | null;
}

export interface TradeDef { niche: string; slug: string; label: string; singular: string; playbook?: string }

/** Trades as collected (niche) -> public slug/label and the matching /ad-examples/<playbook> page. */
export const TRADES: readonly TradeDef[] = [
  { niche: "auto repair", slug: "auto-repair", label: "Auto repair shops", singular: "auto repair", playbook: "auto-repair" },
  { niche: "plumbing", slug: "plumbers", label: "Plumbers", singular: "plumbing", playbook: "plumbers" },
  { niche: "dentist", slug: "dentists", label: "Dentists", singular: "dental", playbook: "dentists" },
  { niche: "med spa", slug: "med-spas", label: "Med spas", singular: "med spa", playbook: "med-spas" },
  { niche: "roofing", slug: "roofers", label: "Roofers", singular: "roofing", playbook: "roofers" },
  { niche: "laser hair removal", slug: "laser-hair-removal", label: "Laser hair removal clinics", singular: "laser hair removal", playbook: "med-spas" },
  { niche: "hvac", slug: "hvac", label: "HVAC companies", singular: "HVAC", playbook: "hvac" },
  { niche: "orthodontist/invisalign", slug: "orthodontists", label: "Orthodontists (Invisalign)", singular: "orthodontist", playbook: "dentists" },
  { niche: "car dealership", slug: "car-dealerships", label: "Car dealerships", singular: "car dealership" },
  { niche: "personal injury lawyer", slug: "personal-injury-lawyers", label: "Personal injury lawyers", singular: "personal injury lawyer", playbook: "law-firms" },
  { niche: "botox/fillers", slug: "botox-fillers", label: "Botox & filler injectors", singular: "Botox and filler", playbook: "med-spas" },
  { niche: "martial arts", slug: "martial-arts", label: "Martial arts schools", singular: "martial arts" },
  { niche: "cosmetic dentistry/implants", slug: "cosmetic-dentists", label: "Cosmetic & implant dentists", singular: "cosmetic dentistry", playbook: "dentists" },
  { niche: "window tint", slug: "window-tint", label: "Window tint shops", singular: "window tint" },
  { niche: "yoga/pilates studio", slug: "yoga-pilates-studios", label: "Yoga & Pilates studios", singular: "yoga and Pilates", playbook: "yoga-studios" },
  { niche: "solar", slug: "solar-installers", label: "Solar installers", singular: "solar", playbook: "solar-installers" },
  { niche: "auto detailing", slug: "auto-detailing", label: "Auto detailers", singular: "auto detailing", playbook: "mobile-detailing" },
  { niche: "pest control", slug: "pest-control", label: "Pest control companies", singular: "pest control", playbook: "pest-control" },
  { niche: "electrician", slug: "electricians", label: "Electricians", singular: "electrician", playbook: "electricians" },
  { niche: "chiropractor", slug: "chiropractors", label: "Chiropractors", singular: "chiropractic", playbook: "chiropractors" },
  { niche: "tire shop", slug: "tire-shops", label: "Tire shops", singular: "tire shop", playbook: "auto-repair" },
  { niche: "gym/fitness studio", slug: "gyms", label: "Gyms & fitness studios", singular: "gym", playbook: "gyms" },
];

const nicheKey = (s: string) => s.trim().toLowerCase();
export function tradeForNiche(niche: string): TradeDef {
  const k = nicheKey(niche);
  const slug = k.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return TRADES.find((t) => t.niche === k) ?? { niche: k, slug, label: k.charAt(0).toUpperCase() + k.slice(1), singular: k };
}
export const leaderboardPath = (slug: string) => `${LEADERBOARD_BASE}/${slug}`;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "2026-08-19" or "Jun 5, 2024" (Ad Library display format) -> "YYYY-MM-DD", else null. */
export function parseFirstSeen(s: string | null | undefined): string | null {
  const x = (s ?? "").trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(x);
  const us = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/.exec(x);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us && MONTHS.includes((us[1] ?? "").toLowerCase())) [y, m, d] = [Number(us[3]), MONTHS.indexOf((us[1] ?? "").toLowerCase()) + 1, Number(us[2])];
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}
const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
};
const share = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0); // percent, 1 decimal
const mean1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

const normUrl = (u: string | null | undefined) => (u ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^(www\.|m\.)/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

interface Clean { row: AdlibRow; trade: TradeDef; state: string; since: string; days: number; text: string }

/** Valid US advertiser rows, one per Facebook page (first occurrence wins), with days running at collection. */
export function cleanRows(rows: AdlibRow[], collectedOn: string): Clean[] {
  const seen = new Set<string>();
  const out: Clean[] = [];
  for (const row of rows) {
    const state = (row.state ?? "").trim().toUpperCase();
    const since = parseFirstSeen(row.first_seen);
    if (!row.niche?.trim() || !/^[A-Z]{2}$/.test(state) || !since || !Number.isFinite(row.active_ads) || row.active_ads < 1) continue;
    const days = dayDiff(since, collectedOn);
    if (days < 0) continue;
    const key = normUrl(row.page_url) || normUrl(row.domain ?? row.website) || `${row.page_name}|${state}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ row, trade: tradeForNiche(row.niche), state, since, days, text: (row.ad_text_sample ?? "").trim() });
  }
  return out;
}

// --------------------------------------------------------------------------------------- copy signals & words

export interface Signal { id: string; label: string; re: RegExp }
export const SIGNALS: readonly Signal[] = [
  { id: "free", label: "Offers something free (estimate, consult, inspection…)", re: /\bfree\b/i },
  { id: "price", label: "Shows a dollar price", re: /\$\s?\d/ },
  { id: "percent", label: "Shows a percentage (e.g. % off, 0% APR)", re: /\d\s?%/ },
  { id: "deal", label: "Uses deal words (special, deal, discount, save, sale, promo, coupon)", re: /\b(specials?|deals?|discounts?|save|savings|sale|promo|coupons?)\b/i },
  { id: "financing", label: "Mentions financing or payment plans", re: /\b(financing|finance|payment plans?|monthly payments?|apr)\b/i },
  { id: "urgency", label: "Uses time pressure (limited time, ends, hurry, spots left)", re: /\b(limited[- ]time|today only|ends|expires?|hurry|last chance|don'?t miss|spots? left|this month only|while (it|they|supplies) last)\b/i },
  { id: "new_customer", label: "Targets new customers / patients", re: /\bnew (patients?|clients?|customers?|members?|students?)\b/i },
  { id: "proof", label: "Cites reviews, ratings or awards", re: /\b(reviews?|rated|5[- ]star|five[- ]star|award|voted|best of)\b|★|⭐/i },
  { id: "trust", label: "Mentions a warranty or guarantee", re: /\b(warrant(y|ies)|guarantee[ds]?)\b/i },
  { id: "local", label: "Says family-owned or locally owned", re: /\b(family[- ]owned|locally[- ]owned|family[- ]run)\b/i },
  { id: "question", label: "Asks the reader a question", re: /\?/ },
  { id: "emoji", label: "Uses emoji", re: /\p{Extended_Pictographic}/u },
];
const OFFER_IDS = new Set(["free", "price", "percent", "deal"]);
const hasOffer = (t: string) => SIGNALS.some((s) => OFFER_IDS.has(s.id) && s.re.test(t));

const STOP = new Set(("a an the and or but if of to in on at for with from by is are was were be been being it its it's this that these those i i'm me my we we're we've our ours us you you're your yours they them their he she his her not no just so than then too very can will would should could do does did done have has had get got gets about into over out up down what when who how why which there here as all any more most some one want need know still keep before after again every like really even only also make don't can't it’s don’t can’t you’ll you'll we'll we’ll let let's let’s now new go see visit today call click learn more amp etc via per off way day days year years time area areas near").split(" "));
/** Words of one ad sample (lowercase, deduped), minus filler, numbers and the advertiser's own name/domain tokens. */
export function adWords(text: string, nameTokens: Set<string>): string[] {
  const ws = text.toLowerCase().replace(/https?:\/\/\S+|\S+@\S+|\b[\w-]+\.(com|net|org|us|co)\b/g, " ").replace(/[^\p{L}\p{N}'’ ]+/gu, " ").split(/\s+/)
    .map((w) => w.replace(/^['’]+|['’]+$/g, "")).filter((w) => w.length > 2 && !STOP.has(w) && !/\d/.test(w) && !nameTokens.has(w));
  return [...new Set(ws)];
}
function nameTokens(r: AdlibRow): Set<string> {
  const stem = (r.domain ?? r.website ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0] ?? "";
  return new Set([...(r.page_name ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u), stem].filter((w) => w.length > 2));
}

/** Words that describe the trade rather than identify a business: kept when redacting page-name words. */
export const GENERIC_NAME_WORDS: ReadonlySet<string> = new Set(("the and of for llc inc pllc dds dmd ltd company group center centre clinic studio studios shop shops service services pro pros "
  + "auto automotive car cars truck repair repairs care collision body tire tires glass detailing detail tint tinting window windows dealer dealership motors sales "
  + "dental dentistry dentist dentists smile smiles orthodontics orthodontist ortho family cosmetic implant implants "
  + "med medical spa medspa aesthetics aesthetic laser skin beauty wellness health clinic injectables botox "
  + "roofing roof roofers plumbing plumber plumbers heating air cooling hvac electric electrical electrician electricians solar energy power pest control termite "
  + "home homes construction contracting contractors exteriors restoration "
  + "law firm injury lawyer lawyers attorney attorneys legal "
  + "yoga pilates fitness gym martial arts academy karate jiu jitsu taekwondo mma "
  + "chiropractic chiropractor spine physical therapy north south east west").split(" "));

/** Leaderboard excerpt: no name, website, URL, email or phone number; trimmed at a word boundary. */
/**
 * `common` = words used by many different advertisers (dataset vocabulary): such page-name words ("Towing", "Comfort")
 * describe the trade, so they are kept; rare ones ("Lukes") identify the business and are replaced.
 */
export function redactExcerpt(text: string, r: Pick<AdlibRow, "page_name" | "domain" | "website" | "city">, max = 160, common: ReadonlySet<string> = new Set()): string {
  let t = text.replace(/\s+/g, " ").trim();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const name = (r.page_name ?? "").trim();
  const names = [name, name.replace(/,?\s*(llc|inc\.?|pllc|pc|p\.c\.|dds|md|ltd|co\.?)$/i, "").trim()].filter((n) => n.length > 2);
  for (const n of names) t = t.replace(new RegExp(esc(n).replace(/['’]/g, "['’]"), "gi"), "[business]");
  const stem = (r.domain ?? r.website ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0] ?? "";
  t = t.replace(/https?:\/\/\S+|\bwww\.\S+|\b[\w-]+\.(com|net|org|us|co|biz|info)\b\S*/gi, "[website]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]");
  if (stem.length > 3) t = t.replace(new RegExp(`\\b${esc(stem)}\\b`, "gi"), "[business]");
  // Distinctive words of the page name ("Lukes" in "Lukes Auto Service"), street addresses and the city.
  for (const w of name.toLowerCase().split(/[^\p{L}\p{N}'’]+/u).map((x) => x.replace(/['’]s?$/, ""))) {
    if (w.length < 3 || GENERIC_NAME_WORDS.has(w) || common.has(w) || /^\d+$/.test(w)) continue;
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(['’]s)?(?![\\p{L}\\p{N}])`, "giu"), "[business]");
  }
  // Any capitalised word that is one of the advertiser's own name/domain words, sits inside the domain stem or is a
  // near-misspelling of a distinctive name word ("Garrmamone" for "Garramone") is the business, even if common.
  const own = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !GENERIC_NAME_WORDS.has(w));
  t = t.replace(/(?<![\p{L}\p{N}\[])\p{Lu}[\p{L}\p{N}]*/gu, (w) => {
    const l = w.toLowerCase().replace(/['’]s$/, "");
    if (GENERIC_NAME_WORDS.has(l) || l.length < 3) return w;
    const hit = own.includes(l) || (l.length >= 4 && stem.length > l.length && stem.includes(l) && !common.has(l))
      || (l.length >= 5 && [...own, stem].some((o) => o.length >= 5 && !common.has(o) && editDistance(l, o) <= 2));
    return hit ? "[business]" : w;
  });
  t = t.replace(/\b\d{2,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][\w'.-]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Hwy|Highway|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway|Ct|Court|Pike|Plaza|Suite|Ste)\b\.?(?:\s*(?:#|Suite|Ste\.?)\s*\w+)?/g, "[address]");
  const city = (r.city ?? "").trim();
  if (city.length > 2) t = t.replace(new RegExp(`(?<![\\p{L}])${esc(city)}(?![\\p{L}])`, "giu"), "[city]");
  t = t.replace(/\[business\](?:[\s&,'’-]*\[business\])+/g, "[business]");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[\s,;:.!-]+$/, "")}…`;
}

/** Levenshtein distance (small words only; used for misspelt business names). */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** Capitalised words that are fine mid-sentence: places at state level, calendar words, platforms. */
export const PROPER_OK: ReadonlySet<string> = new Set(("i i'm i've i'll ok usa us america american americans facebook instagram google meta youtube tiktok covid "
  + "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec "
  + "monday tuesday wednesday thursday friday saturday sunday christmas thanksgiving halloween easter memorial labor veterans "
  + "alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky "
  + "louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada hampshire jersey mexico york carolina "
  + "dakota ohio oklahoma oregon pennsylvania rhode island tennessee texas utah vermont virginia washington wisconsin wyoming new "
  + "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc").split(" "));

const knownWord = (w: string, english: ReadonlySet<string>) => {
  const l = w.toLowerCase();
  const forms = [l, l.replace(/['’](s|re|ve|ll|d|m|t)$/, ""), l.replace(/s$/, ""), l.replace(/es$/, ""), l.replace(/ies$/, "y")];
  return forms.some((f) => f.length > 0 && (english.has(f) || PROPER_OK.has(f) || GENERIC_NAME_WORDS.has(f)));
};

/**
 * Capitalised words in the middle of a sentence that are not ordinary vocabulary (`english` = a common-English word
 * list and/or the dataset's shared vocabulary): likely another business, person or place name. Excerpts with any are
 * not published. Words after sentence punctuation, emoji, bullets or line starts are ignored (ordinary capitals).
 */
export function unknownProperNouns(excerpt: string, english: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const re = /[\p{L}][\p{L}\p{N}'’]*/gu;
  let m: RegExpExecArray | null;
  let last = 0;
  let first = true;
  while ((m = re.exec(excerpt))) {
    const gap = excerpt.slice(last, m.index);
    last = m.index + m[0].length;
    const word = m[0];
    const startOfSentence = first || /[.!?:;…•|\n"“(\]-]|[^\p{L}\p{N}\s,'’&/+]/u.test(gap) && !/^[\s,&/+]*$/.test(gap);
    first = false;
    if (startOfSentence || !/^\p{Lu}/u.test(word)) continue;
    for (const part of word.split(/['’]/)[0]!.split(/(?=\p{Lu}\p{Ll})/u)) {
      if (part.length >= 2 && !knownWord(part, english)) { out.push(word); break; }
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------------- the report

export interface Bucket { label: string; advertisers: number; share: number }
export interface TradeRow { slug: string; label: string; playbook: string | null; advertisers: number; medianLiveAds: number; meanLiveAds: number; multiAdShare: number; medianDays: number; over90Share: number; over365Share: number; offerShare: number; topSignal: string | null; topSignalShare: number }
export interface StateRow { state: string; advertisers: number; medianLiveAds: number; medianDays: number; over90Share: number }
export interface LeaderEntry { rank: number; since: string; days: number; state: string; excerpt: string; libraryUrl: string }
export interface Leaderboard { slug: string; label: string; singular: string; playbook: string | null; advertisers: number; medianDays: number; indexable: boolean; entries: LeaderEntry[] }
export interface AdlibReport {
  version: 1;
  collectedOn: string; // YYYY-MM-DD
  generatedAt: string;
  advertisers: number;
  trades: number;
  states: number;
  indexable: boolean;
  firstSeenFrom: string | null;
  firstSeenTo: string | null;
  liveAds: { n: number; median: number; mean: number; p75: number; p90: number; multiAdShare: number; buckets: Bucket[] };
  runDays: { n: number; median: number; p25: number; p75: number; over30Share: number; over90Share: number; over365Share: number; buckets: Bucket[] };
  /** Video vs image split; null when the collection did not record the format. */
  media: { n: number; videoShare: number; imageShare: number; otherShare: number } | null;
  signals: { n: number; offerShare: number; rows: Array<{ id: string; label: string; advertisers: number; share: number }> };
  words: { n: number; rows: Array<{ word: string; advertisers: number; share: number }> };
  byTrade: TradeRow[];
  byState: StateRow[];
  leaderboards: Leaderboard[];
}

const LIVE_BUCKETS: Array<[string, number, number]> = [["1 live ad", 1, 1], ["2 live ads", 2, 2], ["3–5 live ads", 3, 5], ["6–10 live ads", 6, 10], ["11+ live ads", 11, Infinity]];
const DAY_BUCKETS: Array<[string, number, number]> = [["Under 30 days", 0, 29], ["30–89 days", 30, 89], ["90–179 days", 90, 179], ["180–364 days", 180, 364], ["1–2 years", 365, 729], ["2+ years", 730, Infinity]];
const buckets = (xs: number[], defs: Array<[string, number, number]>): Bucket[] =>
  defs.map(([label, lo, hi]) => { const k = xs.filter((x) => x >= lo && x <= hi).length; return { label, advertisers: k, share: share(k, xs.length) }; });

function signalShares(cs: Clean[]) {
  return SIGNALS.map((s) => { const k = cs.filter((c) => s.re.test(c.text)).length; return { id: s.id, label: s.label, advertisers: k, share: share(k, cs.length) }; });
}

const isAdSpecific = (u: string) => /facebook\.com\/ads\/library\/?\?(.*&)?id=\d+/.test(u);

/** `english` = a common-English word list (lowercase). Without it only the dataset's shared vocabulary counts as ordinary words (stricter). */
export function buildAdlibReport(rows: AdlibRow[], collectedOn: string, now = new Date(), opts: { english?: ReadonlySet<string> } = {}): AdlibReport {
  const cs = cleanRows(rows, collectedOn);
  const n = cs.length;
  const live = cs.map((c) => c.row.active_ads);
  const days = cs.map((c) => c.days);
  const sinces = cs.map((c) => c.since).sort();
  const withText = cs.filter((c) => c.text.length > 0);

  const mediaRows = cs.map((c) => (c.row.media_type ?? "").toLowerCase().trim()).filter(Boolean);
  const media = mediaRows.length >= MIN_GROUP
    ? { n: mediaRows.length, videoShare: share(mediaRows.filter((m) => m.includes("video")).length, mediaRows.length), imageShare: share(mediaRows.filter((m) => m.includes("image") || m.includes("photo")).length, mediaRows.length), otherShare: share(mediaRows.filter((m) => !m.includes("video") && !m.includes("image") && !m.includes("photo")).length, mediaRows.length) }
    : null;

  const sig = signalShares(withText).filter((s) => s.advertisers >= MIN_ADVERTISERS_FOR_TERM).sort((a, b) => b.advertisers - a.advertisers);
  const wordSites = new Map<string, number>();
  for (const c of withText) for (const w of adWords(c.text, nameTokens(c.row))) wordSites.set(w, (wordSites.get(w) ?? 0) + 1);
  const words = [...wordSites.entries()].filter(([, k]) => k >= MIN_ADVERTISERS_FOR_TERM).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25).map(([word, k]) => ({ word, advertisers: k, share: share(k, withText.length) }));

  const rawSites = new Map<string, number>();
  for (const c of withText) for (const w of adWords(c.text, new Set())) rawSites.set(w, (rawSites.get(w) ?? 0) + 1);
  const common = new Set([...rawSites.entries()].filter(([, k]) => k >= COMMON_WORD_ADVERTISERS).map(([w]) => w));
  const vocab = new Set([...common, ...(opts.english ?? [])]);

  const groups = new Map<string, Clean[]>();
  for (const c of cs) groups.set(c.trade.slug, [...(groups.get(c.trade.slug) ?? []), c]);
  const byTrade: TradeRow[] = [...groups.values()].filter((g) => g.length >= MIN_GROUP).map((g) => {
    const t = g[0]!.trade, lv = g.map((c) => c.row.active_ads), dd = g.map((c) => c.days), txt = g.filter((c) => c.text);
    const top = signalShares(txt).filter((s) => s.id !== "emoji" && s.advertisers >= MIN_ADVERTISERS_FOR_TERM).sort((a, b) => b.advertisers - a.advertisers)[0];
    return {
      slug: t.slug, label: t.label, playbook: t.playbook ?? null, advertisers: g.length, medianLiveAds: median(lv), meanLiveAds: mean1(lv), multiAdShare: share(lv.filter((x) => x > 1).length, g.length),
      medianDays: median(dd), over90Share: share(dd.filter((x) => x >= 90).length, g.length), over365Share: share(dd.filter((x) => x >= 365).length, g.length),
      offerShare: share(txt.filter((c) => hasOffer(c.text)).length, txt.length), topSignal: top?.label ?? null, topSignalShare: top?.share ?? 0,
    };
  }).sort((a, b) => b.advertisers - a.advertisers || a.label.localeCompare(b.label));

  const st = new Map<string, Clean[]>();
  for (const c of cs) st.set(c.state, [...(st.get(c.state) ?? []), c]);
  const byState: StateRow[] = [...st.entries()].filter(([, g]) => g.length >= MIN_GROUP).map(([state, g]) => {
    const dd = g.map((c) => c.days);
    return { state, advertisers: g.length, medianLiveAds: median(g.map((c) => c.row.active_ads)), medianDays: median(dd), over90Share: share(dd.filter((x) => x >= 90).length, g.length) };
  }).sort((a, b) => b.advertisers - a.advertisers || a.state.localeCompare(b.state));

  const leaderboards: Leaderboard[] = [...groups.values()].filter((g) => g.length >= MIN_GROUP).map((g) => {
    const t = g[0]!.trade;
    const entries = g.filter((c) => c.text.length >= 30 && /facebook\.com\/ads\/library/.test(c.row.library_url ?? ""))
      .sort((a, b) => b.days - a.days || Number(isAdSpecific(b.row.library_url!)) - Number(isAdSpecific(a.row.library_url!)) || a.text.localeCompare(b.text))
      .map((c) => ({ c, excerpt: redactExcerpt(c.text, c.row, 160, common) }))
      .filter((x) => unknownProperNouns(x.excerpt, vocab).length === 0)
      .slice(0, LEADERBOARD_SIZE)
      .map(({ c, excerpt }, i) => ({ rank: i + 1, since: c.since, days: c.days, state: c.state, excerpt, libraryUrl: c.row.library_url!.trim() }));
    return { slug: t.slug, label: t.label, singular: t.singular, playbook: t.playbook ?? null, advertisers: g.length, medianDays: median(g.map((c) => c.days)), indexable: g.length >= MIN_LEADERBOARD_ADVERTISERS && entries.length >= 5, entries };
  }).sort((a, b) => b.advertisers - a.advertisers || a.label.localeCompare(b.label));

  return {
    version: 1,
    collectedOn,
    generatedAt: now.toISOString(),
    advertisers: n,
    trades: groups.size,
    states: st.size,
    indexable: n >= MIN_INDEXABLE_ADVERTISERS,
    firstSeenFrom: sinces[0] ?? null,
    firstSeenTo: sinces.at(-1) ?? null,
    liveAds: { n, median: median(live), mean: mean1(live), p75: quantile(live, 0.75), p90: quantile(live, 0.9), multiAdShare: share(live.filter((x) => x > 1).length, n), buckets: buckets(live, LIVE_BUCKETS) },
    runDays: { n, median: median(days), p25: quantile(days, 0.25), p75: quantile(days, 0.75), over30Share: share(days.filter((x) => x >= 30).length, n), over90Share: share(days.filter((x) => x >= 90).length, n), over365Share: share(days.filter((x) => x >= 365).length, n), buckets: buckets(days, DAY_BUCKETS) },
    media,
    signals: { n: withText.length, offerShare: share(withText.filter((c) => hasOffer(c.text)).length, withText.length), rows: sig },
    words: { n: withText.length, rows: words },
    byTrade,
    byState,
    leaderboards,
  };
}

export function getLeaderboard(r: AdlibReport, slug: string): Leaderboard | undefined {
  return r.leaderboards.find((l) => l.slug === slug);
}

const csvCell = (v: string | number) => { const x = String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
const line = (...cells: Array<string | number>) => cells.map(csvCell).join(",");

/** All aggregate tables as one long CSV (no leaderboard excerpts, no names). */
export function adlibReportCsv(r: AdlibReport, url: string): string {
  const out = [
    line("table", "label", "advertisers", "value_1", "value_2", "value_3", "value_4"),
    line("sample", "advertisers", r.advertisers, `trades ${r.trades}`, `states ${r.states}`, `collected ${r.collectedOn}`, ""),
    line("source", url, "", "Public Meta Ad Library, collected by Komendly", "CC BY 4.0", "", ""),
    line("live_ads", "median", r.liveAds.n, r.liveAds.median, `mean ${r.liveAds.mean}`, `p75 ${r.liveAds.p75}`, `p90 ${r.liveAds.p90}`),
    ...r.liveAds.buckets.map((b) => line("live_ads_distribution", b.label, b.advertisers, `${b.share}%`, "", "", "")),
    line("days_running", "median", r.runDays.n, r.runDays.median, `p25 ${r.runDays.p25}`, `p75 ${r.runDays.p75}`, `90+ days ${r.runDays.over90Share}%`),
    ...r.runDays.buckets.map((b) => line("days_running_distribution", b.label, b.advertisers, `${b.share}%`, "", "", "")),
    ...(r.media ? [line("media", "video vs image", r.media.n, `video ${r.media.videoShare}%`, `image ${r.media.imageShare}%`, `other ${r.media.otherShare}%`, "")] : []),
    ...r.signals.rows.map((s) => line("copy_signal", s.label, s.advertisers, `${s.share}%`, `of ${r.signals.n}`, "", "")),
    ...r.words.rows.map((w) => line("common_word", w.word, w.advertisers, `${w.share}%`, `of ${r.words.n}`, "", "")),
    line("by_trade", "trade", "advertisers", "median_live_ads", "median_days_running", "share_90plus_days", "share_with_offer"),
    ...r.byTrade.map((t) => line("by_trade", t.label, t.advertisers, t.medianLiveAds, t.medianDays, `${t.over90Share}%`, `${t.offerShare}%`)),
    line("by_state", "state", "advertisers", "median_live_ads", "median_days_running", "share_90plus_days", ""),
    ...r.byState.map((s) => line("by_state", s.state, s.advertisers, s.medianLiveAds, s.medianDays, `${s.over90Share}%`, "")),
  ];
  return out.join("\n") + "\n";
}

// ------------------------------------------------------------------------------- review-gate text and facts

const daysLabel = (d: number) => (d >= 730 ? `${Math.floor(d / 365)}+ years` : d >= 365 ? "1+ year" : `${d} days`);
export const leaderboardTitle = (l: Pick<Leaderboard, "singular">) => `Longest-running ${l.singular} ads on Facebook & Instagram`;

/** Plain text of the report page's generated claims (what the review gate checks before new data goes live). */
export function adlibReportText(r: AdlibReport): string {
  return [
    `State of Local Service Meta Ads: ${r.advertisers} US local service advertisers from the public Meta Ad Library, collected ${r.collectedOn} by Komendly. ${r.trades} trades, ${r.states} states. Aggregates only, no business named.`,
    `Live ads per advertiser: median ${r.liveAds.median}, mean ${r.liveAds.mean} (n=${r.liveAds.n}); ${r.liveAds.multiAdShare}% run two or more.`,
    `Days the sampled ad had been running: median ${r.runDays.median} (n=${r.runDays.n}); ${r.runDays.over90Share}% 90+ days; ${r.runDays.over365Share}% a year or more.`,
    `Ads mentioning an offer: ${r.signals.offerShare}% (n=${r.signals.n}).`,
    ...r.signals.rows.map((s) => `${s.label}: ${s.share}% (${s.advertisers} of ${r.signals.n}).`),
    ...r.byTrade.map((t) => `${t.label} (n=${t.advertisers}): median ${t.medianLiveAds} live ads, median ${t.medianDays} days running, ${t.over90Share}% 90+ days, ${t.offerShare}% mention an offer.`),
    ...r.byState.map((s) => `${s.state} (n=${s.advertisers}): median ${s.medianDays} days running.`),
    "Methodology: keyword searches of the Ad Library, US, active ads only; agencies, national brands, directories and political ads skipped. Not affiliated with Meta. No spend or results are reported.",
  ].join("\n");
}

/** Plain text of one leaderboard page (excerpts are public ad copy, redacted; no advertiser names). */
export function leaderboardText(l: Leaderboard, collectedOn: string): string {
  return [
    `${leaderboardTitle(l)} (${collectedOn}). Factual list of still-active ads from the public Meta Ad Library, by start date. Out of ${l.advertisers} ${l.singular} advertisers sampled; median ad age ${l.medianDays} days. Advertiser names are not shown; links go to the public Ad Library.`,
    ...l.entries.map((e) => `#${e.rank} ${e.state}: running since ${e.since} (${daysLabel(e.days)}). Ad copy excerpt: "${e.excerpt}"`),
  ].join("\n");
}

/** Ground truth for the review gate: the aggregate numbers plus rules for this data. */
export function adlibFacts(r: AdlibReport): string {
  return [
    "Source: public Meta Ad Library, collected by Komendly. Excerpts are quotes of public ad copy with names, websites, phones, addresses and cities replaced by [business]/[website]/[phone]/[address]/[city].",
    adlibReportText(r),
    ...r.leaderboards.map((l) => `${l.label}: ${l.advertisers} advertisers, median ${l.medianDays} days; leaderboard start dates ${l.entries.map((e) => `${e.state} ${e.since} (${e.days} days)`).join(", ")}.`),
  ].join("\n");
}

export const ADLIB_GATE_RULES: readonly string[] = [
  "Leaderboards are neutral and factual ('running since <date>'); no judgement, praise or criticism of any advertiser, and no advertiser names.",
  "Numbers must match the facts exactly, each with its sample size where stated.",
];
