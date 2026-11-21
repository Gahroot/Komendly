// "Are my ads working?" weekly results report (growth system meta_results, flag sys_meta_results).
// Pure TS (no Next/Prisma; fetch is injected): imported by the engine loop (engine/src/growth/meta-results.ts) and the web
// (weekly drop card). Every number comes from the Meta Marketing API (ads_read); nothing is estimated or invented.
// No insights for our ads = no report (callers then show nothing). Never promises results.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const RESULTS_EVENT = "meta_results_report";
/** Lead actions in Meta's preference order (they overlap, so only the first one present is counted). */
export const LEAD_ACTION_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped"] as const;
/** Ad-level effective statuses that mean "this ad was turned off" (campaign/ad set pauses are not a swap). */
const AD_OFF = new Set(["PAUSED", "ARCHIVED", "DELETED"]);

export interface AdInsightRow { metaAdId: string; spend: number; impressions: number; clicks: number; results: number; dateStart: string | null; dateStop: string | null }
export interface MetaAdStatus { id: string; effectiveStatus: string; updatedTime: string | null }
/** One of our published Meta ads (MetaPublish.metaAdId), grouped by the Komendly ad it came from. */
export interface OurMetaAd { metaAdId: string; key: string; label: string; publishedAt: string }

export interface ReportAd { key: string; label: string; spend: number; impressions: number; clicks: number; results: number }
export interface ResultsReport {
  since: string;
  until: string;
  currency: string;
  totals: { spend: number; impressions: number; clicks: number; results: number };
  ads: ReportAd[];
  kept: string[];
  swapped: string[];
  added: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
type ActionRow = { action_type?: unknown; value?: unknown };

/** Leads in one insights row: the first lead action type Meta reported (never summed across overlapping types). */
export function leadResults(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  for (const t of LEAD_ACTION_TYPES) {
    const a = (actions as ActionRow[]).find((x) => x && x.action_type === t);
    if (a) return Math.round(num(a.value));
  }
  return 0;
}

/** Parse ad-level insights rows (fields ad_id, spend, impressions, inline_link_clicks, actions, date_start, date_stop). */
export function parseInsightRows(json: unknown): AdInsightRow[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((r: Record<string, unknown>) => {
    if (!r || typeof r.ad_id !== "string") return [];
    return [{
      metaAdId: r.ad_id,
      spend: num(r.spend),
      impressions: Math.round(num(r.impressions)),
      clicks: Math.round(num(r.inline_link_clicks)),
      results: leadResults(r.actions),
      dateStart: typeof r.date_start === "string" ? r.date_start : null,
      dateStop: typeof r.date_stop === "string" ? r.date_stop : null,
    }];
  });
}

/**
 * Pure: the report from API rows. Rows are summed per Komendly ad (one ad is published once per ratio).
 * kept = still ACTIVE and delivered this week; swapped = turned off at ad level during the window after delivering;
 * added = published during the window. null when our ads had no impressions (show nothing).
 */
export function buildResultsReport(i: { currency: string; rows: AdInsightRow[]; statuses: MetaAdStatus[]; ours: OurMetaAd[]; windowStart: Date }): ResultsReport | null {
  const byMeta = new Map(i.ours.map((o) => [o.metaAdId, o]));
  const rows = i.rows.filter((r) => byMeta.has(r.metaAdId));
  const ads = new Map<string, ReportAd>();
  for (const r of rows) {
    const o = byMeta.get(r.metaAdId)!;
    const a = ads.get(o.key) ?? { key: o.key, label: o.label, spend: 0, impressions: 0, clicks: 0, results: 0 };
    a.spend += r.spend; a.impressions += r.impressions; a.clicks += r.clicks; a.results += r.results;
    ads.set(o.key, a);
  }
  const list = [...ads.values()].filter((a) => a.impressions > 0).sort((a, b) => b.spend - a.spend || b.impressions - a.impressions);
  if (!list.length) return null;
  const totals = list.reduce((t, a) => ({ spend: t.spend + a.spend, impressions: t.impressions + a.impressions, clicks: t.clicks + a.clicks, results: t.results + a.results }), { spend: 0, impressions: 0, clicks: 0, results: 0 });
  const statusOf = new Map(i.statuses.map((s) => [s.id, s]));
  const start = i.windowStart.getTime();
  const keys = [...new Set(i.ours.map((o) => o.key))];
  const metaOf = (k: string) => i.ours.filter((o) => o.key === k);
  const labelOf = (k: string) => metaOf(k)[0]!.label;
  const delivered = (k: string) => (ads.get(k)?.impressions ?? 0) > 0;
  const active = (k: string) => metaOf(k).some((o) => statusOf.get(o.metaAdId)?.effectiveStatus === "ACTIVE");
  const offThisWeek = (k: string) => metaOf(k).every((o) => {
    const s = statusOf.get(o.metaAdId);
    return !!s && AD_OFF.has(s.effectiveStatus);
  }) && metaOf(k).some((o) => { const t = statusOf.get(o.metaAdId)?.updatedTime; return !!t && Date.parse(t) >= start; });
  const isNew = (k: string) => metaOf(k).some((o) => Date.parse(o.publishedAt) >= start);
  const dates = rows.flatMap((r) => [r.dateStart, r.dateStop]).filter((d): d is string => !!d).sort();
  return {
    since: dates[0] ?? "",
    until: dates[dates.length - 1] ?? "",
    currency: /^[A-Z]{3}$/.test(i.currency) ? i.currency : "USD",
    totals,
    ads: list,
    kept: keys.filter((k) => active(k) && delivered(k) && !isNew(k)).map(labelOf),
    swapped: keys.filter((k) => delivered(k) && offThisWeek(k)).map(labelOf),
    added: keys.filter((k) => active(k) && isNew(k)).map(labelOf),
  };
}

const money = (n: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
const int = (n: number) => new Intl.NumberFormat("en-US").format(n);
const pct = (clicks: number, imps: number) => `${((clicks / imps) * 100).toFixed(2)}%`;
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const quote = (s: string) => `"${s.trim().replace(/\s+/g, " ").slice(0, 80)}"`;
const plural = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`;

export interface ResultsText { headline: string; ads: string[]; changes: string[]; note: string }

/** Plain English from the report. Only states the API's numbers; no advice that implies an outcome. */
export function resultsText(r: ResultsReport): ResultsText {
  const t = r.totals;
  const span = r.since && r.until ? `${day(r.since)} to ${day(r.until)}` : "the last 7 days";
  const clicks = `${plural(t.clicks, "link click", "link clicks")} (${pct(t.clicks, t.impressions)} of views)`;
  const tail = t.results > 0
    ? ` and ${plural(t.results, "lead", "leads")}, about ${money(t.spend / t.results, r.currency)} per lead`
    : ". Meta reported no leads from them in that time";
  const headline = `${span}: your Komendly ads spent ${money(t.spend, r.currency)}, were shown ${plural(t.impressions, "time", "times")} and got ${clicks}${tail}.`;
  const ads = r.ads.map((a) => {
    const leads = a.results > 0 ? `, ${plural(a.results, "lead", "leads")} at ${money(a.spend / a.results, r.currency)} each` : ", no leads";
    return `${quote(a.label)}: ${money(a.spend, r.currency)} spent, ${plural(a.impressions, "view", "views")}, ${plural(a.clicks, "click", "clicks")} (${pct(a.clicks, a.impressions)})${leads}.`;
  });
  const changes = [
    ...(r.kept.length ? [`Kept running: ${r.kept.map(quote).join(", ")}.`] : []),
    ...(r.swapped.length ? [`Swapped out this week: ${r.swapped.map(quote).join(", ")}.`] : []),
    ...(r.added.length ? [`New this week: ${r.added.map(quote).join(", ")}.`] : []),
  ];
  return { headline: headline.charAt(0).toUpperCase() + headline.slice(1), ads, changes, note: "These numbers come straight from your Meta ad account; Meta can still adjust the last day or two." };
}

/** Email block (headline, top 3 ads, kept/swapped), or [] when there is no report. */
export function resultsParagraphs(r: ResultsReport | null): string[] {
  if (!r) return [];
  const t = resultsText(r);
  return [`Are your ads working? ${t.headline}`, ...(t.ads.length > 1 ? [`By ad: ${t.ads.slice(0, 3).join(" ")}`] : []), ...t.changes, t.note];
}

/** Oldest stored report the card still shows (8 days: one weekly cycle plus slack). */
export function latestReportSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - 8 * 86_400_000);
}

/** Parse a stored report (AdsEvent props.report); null when malformed. */
export function parseStoredReport(v: unknown): ResultsReport | null {
  const r = v as ResultsReport | null;
  if (!r || typeof r !== "object" || !r.totals || !Array.isArray(r.ads) || !r.ads.length || !Array.isArray(r.kept) || !Array.isArray(r.swapped) || !Array.isArray(r.added)) return null;
  if (!(r.totals.impressions > 0) || typeof r.currency !== "string") return null;
  return r;
}

// ---- Marketing API reads (ads_read). Read-only; throw on HTTP errors so the caller records the failure. ----

const act = (a: string) => (a.startsWith("act_") ? a : `act_${a}`);

async function getJson(f: FetchLike, url: string): Promise<unknown> {
  const res = await f(url, { signal: AbortSignal.timeout(15_000) });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`meta_insights_${res.status}: ${(json as { error?: { message?: string } }).error?.message ?? "request failed"}`);
  return json;
}

/** Last-7-day (date_preset last_7d, account time zone) ad-level insights for the given ad ids. */
export async function fetchAdInsights(f: FetchLike, o: { token: string; adAccountId: string; graphVersion: string; adIds: string[] }): Promise<AdInsightRow[]> {
  if (!o.adIds.length) return [];
  const out: AdInsightRow[] = [];
  for (let i = 0; i < o.adIds.length; i += 50) {
    const params = new URLSearchParams({
      level: "ad",
      date_preset: "last_7d",
      fields: "ad_id,spend,impressions,inline_link_clicks,actions,date_start,date_stop",
      filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: o.adIds.slice(i, i + 50) }]),
      limit: "500",
      access_token: o.token,
    });
    let url: string | undefined = `https://graph.facebook.com/${o.graphVersion}/${act(o.adAccountId)}/insights?${params}`;
    for (let page = 0; url && page < 10; page++) {
      const json = await getJson(f, url);
      out.push(...parseInsightRows(json));
      url = (json as { paging?: { next?: string } }).paging?.next;
    }
  }
  return out;
}

/** Current effective status of each ad (batched ?ids=). */
export async function fetchAdStatuses(f: FetchLike, o: { token: string; graphVersion: string; adIds: string[] }): Promise<MetaAdStatus[]> {
  const out: MetaAdStatus[] = [];
  for (let i = 0; i < o.adIds.length; i += 50) {
    const params = new URLSearchParams({ ids: o.adIds.slice(i, i + 50).join(","), fields: "id,effective_status,updated_time", access_token: o.token });
    const json = (await getJson(f, `https://graph.facebook.com/${o.graphVersion}/?${params}`)) as Record<string, { id?: string; effective_status?: string; updated_time?: string }>;
    for (const v of Object.values(json ?? {})) {
      if (v && typeof v.id === "string" && typeof v.effective_status === "string") out.push({ id: v.id, effectiveStatus: v.effective_status, updatedTime: v.updated_time ?? null });
    }
  }
  return out;
}

export async function fetchAccountCurrency(f: FetchLike, o: { token: string; adAccountId: string; graphVersion: string }): Promise<string> {
  const json = (await getJson(f, `https://graph.facebook.com/${o.graphVersion}/${act(o.adAccountId)}?${new URLSearchParams({ fields: "currency", access_token: o.token })}`)) as { currency?: string };
  return json.currency ?? "USD";
}
