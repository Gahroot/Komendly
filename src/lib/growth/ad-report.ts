// Pure aggregation for the public data report /reports/facebook-ad-statistics.
// Input = completed AdRuns with their ready static ads (loaded read-only in ad-report-server.ts). Output = anonymous
// aggregate tables only: no business names, URLs or copy that appears on fewer than MIN_SITES_FOR_TERM sites.

export const REPORT_PATH = "/reports/facebook-ad-statistics";
/** Below this many distinct websites the page renders noindex and stays out of sitemap/llms.txt. */
export const MIN_INDEXABLE_SITES = 100;
/** A CTA phrase or hook word is only shown if it occurs on at least this many different websites (anonymity). */
export const MIN_SITES_FOR_TERM = 3;

export interface ReportAdInput { headline: string; hook: string; cta: string | null; awareness: string; ratios: string[] }
export interface ReportRunInput {
  id: string;
  kind: string; // standard | gift | weekly
  domain: string | null;
  ownerInternal: boolean;
  completedAt: Date;
  goal: string | null;
  colors: Array<{ hex?: unknown; role?: unknown }>;
  ads: ReportAdInput[];
}

export interface ReportTable { id: string; title: string; columns: string[]; rows: Array<Array<string | number>> }
export interface AdReport {
  sites: number;
  ads: number;
  from: string | null; // ISO date
  to: string | null;
  outreachShare: number; // share of sites from public-website outreach (gift) runs
  indexable: boolean;
  headline: { medianWords: number; medianChars: number; question: number; number: number; price: number; offer: number; firstPerson: number; you: number; under40Chars: number };
  hook: { question: number; firstPerson: number; you: number };
  cta: { medianWords: number; topVerb: string | null; topVerbShare: number };
  topColorFamily: string | null;
  topColorShare: number;
  topRatio: string | null;
  topRatioShare: number;
  tables: ReportTable[];
}

const BAD_DOMAIN = [/(^|\.)komendly\.com$/i, /(^|\.)nolangrout\.com$/i, /(^|\.)(example|tester)\.(com|org|net)$/i, /\.test$/i, /^localhost/i, /^\d+\.\d+\.\d+\.\d+/];

export function normDomain(d: string | null | undefined): string | null {
  const x = (d ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  return x && x.includes(".") ? x : null;
}

/**
 * Inclusion rule (also shown on the page):
 * - standard/weekly runs count only when the account is a real customer (not internal/test, same rule as the money dashboard);
 * - gift runs (made by our outreach from a real small business's public website) count, whoever triggered them;
 * - our own, test and example domains never count; one website = its latest completed run (no double counting).
 */
export function selectRuns(runs: ReportRunInput[]): ReportRunInput[] {
  const byDomain = new Map<string, ReportRunInput>();
  for (const r of runs) {
    const d = normDomain(r.domain);
    if (!d || BAD_DOMAIN.some((re) => re.test(d))) continue;
    if (r.kind !== "gift" && r.ownerInternal) continue;
    if (!r.ads.length) continue;
    const prev = byDomain.get(d);
    if (!prev || prev.completedAt < r.completedAt) byDomain.set(d, r);
  }
  return [...byDomain.values()];
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const share = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0); // percent, 1 decimal

export const isQuestion = (s: string) => /\?\s*["'”’]?\s*$/.test(s.trim()) || /\?/.test(s);
export const hasNumber = (s: string) => /\d/.test(s);
export const hasPrice = (s: string) => /[$€£¥]\s?\d|\d\s?(€|\$|usd|eur|gbp)\b/i.test(s);
export const hasOffer = (s: string) => /\b(free|\d+\s?% off|discount|save|deal|sale|offer|bonus|gratuit|promo|coupon)\b/i.test(s) || /\d+\s?%/.test(s);
export const isFirstPerson = (s: string) => /\b(i|i'm|i’m|i've|i’ve|i'd|my|me|we're|je|j'|mon|ma|mes)\b/i.test(s);
export const addressesYou = (s: string) => /\b(you|your|you're|you’re|yours|vous|votre|tu)\b/i.test(s);

const STOP = new Set("a an the and or but if of to in on at for with from by is are was were be been it its it's this that these those i i'm me my we our you your they them their he she his her not no just so than then too very can will would should could do does did have has had get got about into over out up down what when who how why which there here as all any more most some one want need know still keep before after again every like really even only also make don't can't i've i’m it’s don’t can’t le la les de des du un une et est pas pour que qui je en au à ce".split(" "));

/** Hue family of a hex colour (for "most common brand colours"). */
export function colorFamily(hex: string): string | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h6 = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h6.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l < 0.12) return "black";
  if (l > 0.93) return "white";
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return "gray";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return l < 0.4 ? "brown" : "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

function primaryColor(colors: ReportRunInput["colors"]): string | null {
  const hexes = colors.filter((c) => typeof c?.hex === "string");
  const pick = hexes.find((c) => c.role === "primary") ?? hexes.find((c) => c.role === "accent") ?? hexes[0];
  return pick ? colorFamily(String(pick.hex)) : null;
}

function countBy<T>(items: T[], key: (t: T) => string | null): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Terms counted per website (not per ad), kept only if used on >= MIN_SITES_FOR_TERM sites. */
function termsBySite(runs: ReportRunInput[], extract: (a: ReportAdInput) => string[]): Array<[string, number, number]> {
  const sites = new Map<string, number>(), uses = new Map<string, number>();
  for (const r of runs) {
    const seen = new Set<string>();
    for (const a of r.ads) for (const t of extract(a)) { uses.set(t, (uses.get(t) ?? 0) + 1); seen.add(t); }
    for (const t of seen) sites.set(t, (sites.get(t) ?? 0) + 1);
  }
  return [...sites.entries()].filter(([, s]) => s >= MIN_SITES_FOR_TERM).map(([t, s]) => [t, s, uses.get(t) ?? 0] as [string, number, number])
    .sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0].localeCompare(b[0]));
}

const normCta = (s: string) => s.trim().toLowerCase().replace(/[.!→>»]+$/g, "").replace(/\s+/g, " ");
const ctaVerb = (s: string | null) => (s ? normCta(s).split(" ")[0] || null : null);
const hookWords = (a: ReportAdInput) => [...new Set(words(a.hook.toLowerCase().replace(/[^\p{L}\p{N}'’ ]+/gu, " ")).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)))];

const LENGTH_BUCKETS: Array<[string, number, number]> = [["1–3 words", 1, 3], ["4–6 words", 4, 6], ["7–9 words", 7, 9], ["10–12 words", 10, 12], ["13+ words", 13, Infinity]];
const AWARENESS_LABEL: Record<string, string> = { unaware: "Unaware", problem_aware: "Problem-aware", solution_aware: "Solution-aware", product_aware: "Product-aware", most_aware: "Most aware" };

export function buildAdReport(allRuns: ReportRunInput[]): AdReport {
  const runs = selectRuns(allRuns);
  const ads = runs.flatMap((r) => r.ads);
  const n = ads.length, s = runs.length;
  const dates = runs.map((r) => r.completedAt.getTime()).sort((a, b) => a - b);
  const hl = ads.map((a) => a.headline.trim());
  const hlWords = hl.map((h) => words(h).length);
  const c = (pred: (x: string) => boolean, xs: string[]) => share(xs.filter(pred).length, xs.length);
  const hooks = ads.map((a) => a.hook);
  const ctas = ads.map((a) => a.cta).filter((x): x is string => !!x && !!x.trim());

  const verbs = countBy(ctas, ctaVerb);
  const families = countBy(runs, (r) => primaryColor(r.colors));
  const ratioCounts = countBy(ads.flatMap((a) => a.ratios.filter((x) => /^\d+:\d+$/.test(x))), (x) => x);
  const ratioTotal = ratioCounts.reduce((t, [, k]) => t + k, 0);
  const goals = countBy(runs, (r) => r.goal);
  const awareness = countBy(ads, (a) => a.awareness);
  const ctaPhrases = termsBySite(runs, (a) => (a.cta ? [normCta(a.cta)] : []));
  const ctaVerbsBySite = termsBySite(runs, (a) => { const v = ctaVerb(a.cta); return v ? [v] : []; });
  const hookTerms = termsBySite(runs, hookWords);

  const pct = (k: number, d: number) => `${share(k, d)}%`;
  const tables: ReportTable[] = [
    { id: "headline_length", title: "Headline length (words)", columns: ["Length", "Ads", "Share"], rows: LENGTH_BUCKETS.map(([label, lo, hi]) => { const k = hlWords.filter((w) => w >= lo && w <= hi).length; return [label, k, pct(k, n)]; }) },
    { id: "headline_features", title: "What headlines contain", columns: ["Feature", "Share of ads"], rows: [
      ["Phrased as a question", `${c(isQuestion, hl)}%`], ["Contains a number", `${c(hasNumber, hl)}%`], ["Mentions a price", `${c(hasPrice, hl)}%`],
      ["Mentions an offer (free, % off, discount, deal)", `${c(hasOffer, hl)}%`], ["Written in the first person (I / my / we're)", `${c(isFirstPerson, hl)}%`],
      ["Speaks to the reader (you / your)", `${c(addressesYou, hl)}%`], ["40 characters or fewer", `${c((h) => h.length <= 40, hl)}%`],
    ] },
    { id: "hook_style", title: "Opening hook style", columns: ["Style", "Share of ads"], rows: [
      ["Question", `${c(isQuestion, hooks)}%`], ["First person (the buyer's own thought)", `${c(isFirstPerson, hooks)}%`], ["Speaks to the reader (you / your)", `${c(addressesYou, hooks)}%`],
    ] },
    { id: "cta_verbs", title: "Most common first word of the call to action", columns: ["CTA verb", "Websites", "Ads", "Share of ads"], rows: ctaVerbsBySite.slice(0, 12).map(([v, sites]) => { const k = verbs.find(([x]) => x === v)?.[1] ?? 0; return [v, sites, k, pct(k, ctas.length)]; }) },
    { id: "cta_phrases", title: `Most common full CTA phrases (used on ${MIN_SITES_FOR_TERM}+ websites)`, columns: ["CTA", "Websites", "Ads"], rows: ctaPhrases.slice(0, 12).map(([t, sites, uses]) => [t, sites, uses]) },
    { id: "hook_words", title: `Most common words in hooks (used on ${MIN_SITES_FOR_TERM}+ websites, filler words removed)`, columns: ["Word", "Websites", "Ads"], rows: hookTerms.slice(0, 20).map(([t, sites, uses]) => [t, sites, uses]) },
    { id: "awareness", title: "Buyer awareness stage targeted", columns: ["Stage", "Ads", "Share"], rows: awareness.map(([k, v]) => [AWARENESS_LABEL[k] ?? k, v, pct(v, n)]) },
    { id: "campaign_goal", title: "Campaign goal picked for the website", columns: ["Goal", "Websites", "Share"], rows: goals.map(([k, v]) => [k.replace(/_/g, " "), v, pct(v, s)]) },
    { id: "brand_colors", title: "Main brand colour of the website (colour family)", columns: ["Colour family", "Websites", "Share"], rows: families.map(([k, v]) => [k, v, pct(v, s)]) },
    { id: "aspect_ratios", title: "Aspect ratio of finished ad images", columns: ["Ratio", "Images", "Share"], rows: ratioCounts.map(([k, v]) => [k, v, pct(v, ratioTotal)]) },
  ];

  return {
    sites: s, ads: n,
    from: dates.length ? new Date(dates[0]).toISOString().slice(0, 10) : null,
    to: dates.length ? new Date(dates[dates.length - 1]).toISOString().slice(0, 10) : null,
    outreachShare: share(runs.filter((r) => r.kind === "gift").length, s),
    indexable: s >= MIN_INDEXABLE_SITES,
    headline: {
      medianWords: median(hlWords), medianChars: median(hl.map((h) => h.length)), question: c(isQuestion, hl), number: c(hasNumber, hl), price: c(hasPrice, hl),
      offer: c(hasOffer, hl), firstPerson: c(isFirstPerson, hl), you: c(addressesYou, hl), under40Chars: c((h) => h.length <= 40, hl),
    },
    hook: { question: c(isQuestion, hooks), firstPerson: c(isFirstPerson, hooks), you: c(addressesYou, hooks) },
    cta: { medianWords: median(ctas.map((x) => words(x).length)), topVerb: ctaVerbsBySite[0]?.[0] ?? null, topVerbShare: share(verbs.find(([x]) => x === ctaVerbsBySite[0]?.[0])?.[1] ?? 0, ctas.length) },
    topColorFamily: families[0]?.[0] ?? null, topColorShare: share(families[0]?.[1] ?? 0, s),
    topRatio: ratioCounts[0]?.[0] ?? null, topRatioShare: share(ratioCounts[0]?.[1] ?? 0, ratioTotal),
    tables,
  };
}

const csvCell = (v: string | number) => { const x = String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };

/** All aggregate tables as one long CSV: table,label columns..., with a header block (sample + licence). */
export function reportCsv(r: AdReport, url: string): string {
  const lines = [
    ["table", "column_1", "column_2", "column_3", "column_4"].join(","),
    ["sample", "websites", r.sites, "ads", r.ads].map(csvCell).join(","),
    ["sample", "date_range", r.from ?? "", r.to ?? "", ""].map(csvCell).join(","),
    ["source", url, "Komendly", "CC BY 4.0", ""].map(csvCell).join(","),
  ];
  for (const t of r.tables) {
    lines.push([t.id, ...t.columns].map(csvCell).join(","));
    for (const row of t.rows) lines.push([t.id, ...row].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}
