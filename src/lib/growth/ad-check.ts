// Meta Ad Check (growth system `ad_check`): free grader at /tools/meta-ad-check, private report at /ad-check/<token>.
// Pure TS (no Next/Prisma/Node imports): imported by web and engine. Every point maps to one observable Ad Library
// fact about the scanned page (no benchmarks): the rubric below is published on the tool page as-is.
// Flow: web POST /api/ad-check -> AdJob type `adlib_scan` (payload AdCheckPayload) -> engine/src/growth/ad-check.ts
// scans (engine/src/growth/adlib-scan.ts) and writes AdJob.result = AdCheckResult -> page polls /api/ad-check/<token>.
import type { AdlibAd, AdlibPageScan } from "./adlib-scan";
import { adLibraryPageUrl } from "./adlib-scan";

export const AD_CHECK_JOB_TYPE = "adlib_scan";
export const AD_CHECK_TOOL_SLUG = "meta-ad-check";
/** A live ad running longer than this many days is flagged as possibly fatigued. */
export const FATIGUE_DAYS = 45;
/** "Fresh" = at least one live ad started within this many days. */
export const FRESH_DAYS = 30;
export const MAX_RIVALS = 3;

export type AdCheckId = "live" | "volume" | "fatigue" | "fresh" | "formats";

/** Published rubric (100 points). `rule` is shown on the tool page verbatim. */
export const AD_CHECK_RUBRIC: ReadonlyArray<{ id: AdCheckId; label: string; max: number; rule: string }> = [
  { id: "live", label: "Ads running now", max: 20, rule: "20 points if the Meta Ad Library shows at least 1 active ad for your Page in the US." },
  { id: "volume", label: "Several ads at once", max: 20, rule: "20 points for 3 or more active ads, 10 points for 2, 0 for 1 or none." },
  { id: "fatigue", label: "No tired ads", max: 25, rule: `25 points if none of your active ads started more than ${FATIGUE_DAYS} days ago. Any older one is flagged as possible ad fatigue.` },
  { id: "fresh", label: "A recent new ad", max: 15, rule: `15 points if at least one active ad started in the last ${FRESH_DAYS} days.` },
  { id: "formats", label: "Format mix", max: 20, rule: "20 points if your active ads use 2 or more formats (image, video, carousel), 10 points for 1 format." },
];

export interface AdCheckPayload {
  token: string;
  /** Raw user input (Facebook Page URL or website). */
  input: string;
  /** Optional trade (Kly niche) and US state for the rival comparison when the engine can't infer them. */
  trade?: string;
  state?: string;
  purpose: "ad_check";
}

export interface AdCheckCheck { id: AdCheckId; label: string; points: number; max: number; pass: boolean; fact: string }

export interface AdCheckRival {
  pageName: string;
  pageId: string;
  liveCount: number;
  longestRunDays: number | null;
  adLibraryUrl: string;
}

export interface AdCheckReport {
  version: 1;
  found: boolean;
  pageId: string;
  pageName: string;
  pageUrl?: string;
  website?: string;
  adLibraryUrl: string;
  /** Active ads Meta reports for the Page (may exceed `ads.length`, the ones embedded in the first result page). */
  liveCount: number;
  oldestDays: number | null;
  oldestStartedAt: string | null;
  formatMix: Record<AdlibAd["format"], number>;
  fatigued: Array<{ adArchiveId: string; runDays: number; startedAt: string; snapshotUrl: string }>;
  score: number;
  checks: AdCheckCheck[];
  trade?: string;
  state?: string;
  rivals: AdCheckRival[];
  ads: AdlibAd[];
  scannedAt: string;
  /** Komendly-written summary lines; only present when they passed the review wrapper. */
  summary?: string[];
}

export type AdCheckResult = { ok: true; report: AdCheckReport } | { ok: false; reason: "not_found" | "unavailable"; input: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Pure: grade one scan. `total` = Meta's active-ad count for the Page (defaults to the ads parsed). */
export function gradeScan(scan: AdlibPageScan, total = scan.liveAds.length): Pick<AdCheckReport, "liveCount" | "oldestDays" | "oldestStartedAt" | "formatMix" | "fatigued" | "score" | "checks"> {
  const ads = scan.liveAds;
  const liveCount = Math.max(total, ads.length);
  const oldest = ads.reduce<AdlibAd | null>((o, a) => (!o || a.runDays > o.runDays ? a : o), null);
  const newest = ads.reduce<AdlibAd | null>((o, a) => (!o || a.runDays < o.runDays ? a : o), null);
  const formatMix: Record<AdlibAd["format"], number> = { image: 0, video: 0, carousel: 0, unknown: 0 };
  for (const a of ads) formatMix[a.format]++;
  const formats = (["image", "video", "carousel"] as const).filter((f) => formatMix[f] > 0);
  const fatigued = ads.filter((a) => a.runDays > FATIGUE_DAYS).map((a) => ({ adArchiveId: a.adArchiveId, runDays: a.runDays, startedAt: a.startedAt, snapshotUrl: a.snapshotUrl }));
  const has = liveCount > 0 && ads.length > 0;
  const max = (id: AdCheckId) => AD_CHECK_RUBRIC.find((r) => r.id === id)!.max;
  const label = (id: AdCheckId) => AD_CHECK_RUBRIC.find((r) => r.id === id)!.label;
  const c = (id: AdCheckId, points: number, fact: string): AdCheckCheck => ({ id, label: label(id), points, max: max(id), pass: points === max(id), fact });
  const checks: AdCheckCheck[] = [
    c("live", has ? 20 : 0, has ? `${plural(liveCount, "active ad")} in the US Ad Library.` : "No active ads found in the US Ad Library."),
    c("volume", liveCount >= 3 ? 20 : liveCount === 2 ? 10 : 0, `${plural(liveCount, "active ad")} at the time of the scan.`),
    c("fatigue", has && fatigued.length === 0 ? 25 : 0, !has ? "No active ads to check."
      : fatigued.length ? `${plural(fatigued.length, "active ad")} started more than ${FATIGUE_DAYS} days ago (oldest: ${oldest!.runDays} days, since ${oldest!.startedAt}).`
      : `Every active ad started ${FATIGUE_DAYS} days ago or less (oldest: ${oldest!.runDays} days).`),
    c("fresh", newest && newest.runDays <= FRESH_DAYS ? 15 : 0, newest ? `Newest active ad started ${newest.runDays} days ago (${newest.startedAt}).` : "No active ads to check."),
    c("formats", formats.length >= 2 ? 20 : formats.length === 1 ? 10 : 0, formats.length ? `Formats in use: ${formats.map((f) => `${f} (${formatMix[f]})`).join(", ")}.` : "No active ads to check."),
  ];
  return { liveCount: has ? liveCount : 0, oldestDays: oldest?.runDays ?? null, oldestStartedAt: oldest?.startedAt ?? null, formatMix, fatigued, score: checks.reduce((s, x) => s + x.points, 0), checks };
}

/** Pure: a rival's comparison row (counts and longest runner only; rivals are never scored). */
export function rivalRow(scan: AdlibPageScan, total = scan.liveAds.length): AdCheckRival {
  return {
    pageName: scan.pageName, pageId: scan.pageId, liveCount: Math.max(total, scan.liveAds.length),
    longestRunDays: scan.liveAds.length ? Math.max(...scan.liveAds.map((a) => a.runDays)) : null, adLibraryUrl: adLibraryPageUrl(scan.pageId),
  };
}

/** Pure: full report from the subject scan and up to MAX_RIVALS rival scans. */
export function buildAdCheckReport(scan: AdlibPageScan, total: number, rivals: AdCheckRival[], ctx: { trade?: string; state?: string } = {}): AdCheckReport {
  const g = gradeScan(scan, total);
  const r: AdCheckReport = {
    version: 1, found: true, pageId: scan.pageId, pageName: scan.pageName, adLibraryUrl: adLibraryPageUrl(scan.pageId), ...g,
    rivals: rivals.filter((x) => x.pageId !== scan.pageId).slice(0, MAX_RIVALS), ads: scan.liveAds, scannedAt: scan.scannedAt,
  };
  if (scan.pageUrl) r.pageUrl = scan.pageUrl;
  if (scan.website) r.website = scan.website;
  if (ctx.trade) r.trade = ctx.trade;
  if (ctx.state) r.state = ctx.state;
  return r;
}

/** Komendly-written summary lines (deterministic, built only from report facts). Sent through the review wrapper. */
export function reportSummaryLines(r: AdCheckReport): string[] {
  const out: string[] = [`Komendly Meta Ad Check for ${r.pageName || "this Page"}: ${r.score}/100, from public Meta Ad Library data scanned ${r.scannedAt.slice(0, 10)}.`];
  if (!r.liveCount) {
    out.push("The US Ad Library shows no active ads for this Page right now.");
  } else {
    out.push(`It shows ${plural(r.liveCount, "active ad")}; the longest-running one started ${r.oldestDays} days ago.`);
    if (r.fatigued.length) out.push(`${plural(r.fatigued.length, "ad has", "ads have")} run longer than ${FATIGUE_DAYS} days, which our rubric flags as possible ad fatigue. Replacing long runners with new creative is the usual fix.`);
  }
  if (r.rivals.length) {
    const most = Math.max(...r.rivals.map((x) => x.liveCount));
    out.push(`${plural(r.rivals.length, "local advertiser")} in the same trade and state ${r.rivals.length === 1 ? "was" : "were"} scanned too; the most active one shows ${plural(most, "active ad")}.`);
  }
  out.push("Komendly can make 10 free replacement ads from your website, no card.");
  return out;
}

/** Ground truth handed to the AI reviewer with the summary (anything else counts as invented). */
export function reportFacts(r: AdCheckReport): string {
  return [
    `Page: ${r.pageName} (${r.pageId}); scanned ${r.scannedAt}; score ${r.score}/100.`,
    ...r.checks.map((c) => `${c.label}: ${c.points}/${c.max}. ${c.fact}`),
    `Active ads: ${r.liveCount}; oldest ${r.oldestDays ?? "n/a"} days; fatigued (> ${FATIGUE_DAYS} days): ${r.fatigued.length}.`,
    ...r.rivals.map((x, i) => `Rival ${i + 1}: ${x.liveCount} active ads, longest ${x.longestRunDays ?? "n/a"} days.`),
    "Offer: free pack = 10 ads, no card (20 via a referral link); Ozzy Ad Department $97 the first month then $197/month, cancel anytime; ads go live in the customer's own Meta account, losers replaced weekly.",
  ].join("\n");
}

/** What the signed-out report shows (the email gate = normal sign-up unlocks ads and rival names). */
export type AdCheckPublicReport = Omit<AdCheckReport, "ads" | "rivals" | "fatigued"> & {
  ads: AdlibAd[]; rivals: Array<Omit<AdCheckRival, "pageName" | "pageId" | "adLibraryUrl"> & Partial<Pick<AdCheckRival, "pageName" | "pageId" | "adLibraryUrl">>>;
  fatigued: AdCheckReport["fatigued"]; gated: boolean;
};

export function gateReport(r: AdCheckReport, signedIn: boolean): AdCheckPublicReport {
  if (signedIn) return { ...r, gated: false };
  return {
    ...r, gated: true, ads: [], fatigued: r.fatigued.map((f) => ({ ...f, adArchiveId: "", snapshotUrl: "" })),
    rivals: r.rivals.map((x) => ({ liveCount: x.liveCount, longestRunDays: x.longestRunDays })),
  };
}

/** Competitor ad watch prefill (<AdWatchOptin defaultPages>): the checked Page, then the rivals the visitor may see
 * (gated reports hide rival page ids, so they only prefill once unlocked). Facebook Page URL when known, else page id. */
export function adWatchPagesFromReport(r: AdCheckPublicReport, max = 5): string[] {
  const own = r.pageUrl && /facebook\.com\//i.test(r.pageUrl) ? r.pageUrl : r.pageId;
  const rivals = r.rivals.map((x) => x.pageId ?? "").filter(Boolean);
  return [...new Set([own, ...rivals].filter(Boolean))].slice(0, max);
}

/** Trades offered in the optional rival-comparison picker (Kly niche names, as stored on KlyPlace adlib rows). */
export const AD_CHECK_TRADES: readonly string[] = [
  "roofers", "hvac", "plumbers", "electricians", "home remodelers", "landscapers", "tree services", "painters", "pest control",
  "garage door companies", "gutter companies", "foundation repair", "solar installers", "pool builders", "fence companies",
  "concrete contractors", "window installers", "flooring stores", "house cleaners", "carpet cleaners", "junk removal", "moving companies",
  "auto repair shops", "auto detailers", "dentists", "orthodontists", "chiropractors", "med spas", "physical therapists", "optometrists",
  "veterinarians", "personal injury lawyers", "law firms", "real estate agents", "gyms", "hairdressers", "barbershops", "nail salons",
];

export const US_STATES: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export function cleanTrade(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return AD_CHECK_TRADES.includes(s) ? s : undefined;
}
export function cleanState(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return US_STATES.includes(s) ? s : undefined;
}

/** Report tokens: 32 url-safe chars (unguessable; the report page is private). */
export const isAdCheckToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{32}$/.test(t);
