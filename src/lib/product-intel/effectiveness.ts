// Advertising effectiveness ledger: ties creative attributes to MEASURED delivery outcomes (CTR, CPL, leads) with sample
// sizes, shrinkage and honest labels. Pure. Never estimates results for ads that have no delivery data.

export const EFFECTIVENESS_EVENT = "creative_effectiveness";
export type HookType = "question" | "callout" | "number" | "pain" | "offer" | "statement";
export type Attribute = "trade" | "angle" | "hookType" | "format" | "length" | "offer" | "template";

export interface PerfRow {
  adId: string;
  trade: string | null;
  angle: string | null;
  hook: string | null;
  headline: string | null;
  format: string | null; // ratio or kind, e.g. "4:5" | "motion"
  offer: string | null;
  template: string | null;
  impressions: number;
  clicks: number;
  leads: number;
  spendMinor: number;
}

export function classifyHook(text: string | null | undefined): HookType {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return "statement";
  if (t.includes("?")) return "question";
  if (/\b\d+(\.\d+)?%?|\$\d/.test(t)) return "number";
  if (/\b(free|off|save|offer|quote|estimate|today)\b/.test(t)) return "offer";
  if (/\b(tired|sick of|stop|still|struggling|too many|never|can't|cant|worried)\b/.test(t)) return "pain";
  if (/\b(you|your|you're|homeowner|owners?)\b/.test(t.split(/\s+/).slice(0, 6).join(" "))) return "callout";
  return "statement";
}
export const lengthBucket = (headline: string | null): string => {
  const n = (headline ?? "").trim().split(/\s+/).filter(Boolean).length;
  return n === 0 ? "none" : n <= 5 ? "short (1-5 words)" : n <= 9 ? "medium (6-9 words)" : "long (10+ words)";
};

const MIN_IMPRESSIONS = 1000; // per attribute value before it is called measured
const MIN_ADS = 2;
const PRIOR_IMPRESSIONS = 500; // shrinkage strength toward the overall CTR

export interface LedgerEntry {
  attribute: Attribute;
  value: string;
  ads: number;
  impressions: number;
  clicks: number;
  leads: number;
  spendMinor: number;
  ctr: number | null; // raw
  shrunkCtr: number | null;
  cplMinor: number | null; // spend / leads, only with >=1 lead
  confidence: "measured" | "insufficient";
  note: string;
}
export interface Ledger {
  hasLiveData: boolean;
  statement: string;
  overall: { ads: number; impressions: number; clicks: number; leads: number; spendMinor: number; ctr: number | null } | null;
  entries: LedgerEntry[];
}

export function buildLedger(rows: PerfRow[]): Ledger {
  const live = rows.filter((r) => r.impressions > 0);
  if (!live.length) return { hasLiveData: false, statement: "No customer ads have delivered yet, so nothing is measured. No creative attribute is claimed to work or not work.", overall: null, entries: [] };
  const sum = (rs: PerfRow[]) => rs.reduce((a, r) => ({ impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, leads: a.leads + r.leads, spendMinor: a.spendMinor + r.spendMinor }), { impressions: 0, clicks: 0, leads: 0, spendMinor: 0 });
  const tot = sum(live);
  const base = tot.clicks / tot.impressions;
  const attrs: Array<[Attribute, (r: PerfRow) => string | null]> = [
    ["trade", (r) => r.trade], ["angle", (r) => r.angle], ["hookType", (r) => classifyHook(r.hook ?? r.headline)],
    ["format", (r) => r.format], ["length", (r) => lengthBucket(r.headline)], ["offer", (r) => r.offer], ["template", (r) => r.template],
  ];
  const entries: LedgerEntry[] = [];
  for (const [attribute, get] of attrs) {
    const groups = new Map<string, PerfRow[]>();
    for (const r of live) { const v = get(r)?.trim(); if (v) (groups.get(v) ?? groups.set(v, []).get(v)!).push(r); }
    for (const [value, rs] of groups) {
      const s = sum(rs);
      const measured = s.impressions >= MIN_IMPRESSIONS && rs.length >= MIN_ADS;
      entries.push({
        attribute, value, ads: rs.length, ...s,
        ctr: s.clicks / s.impressions,
        shrunkCtr: (s.clicks + base * PRIOR_IMPRESSIONS) / (s.impressions + PRIOR_IMPRESSIONS),
        cplMinor: s.leads > 0 ? Math.round(s.spendMinor / s.leads) : null,
        confidence: measured ? "measured" : "insufficient",
        note: measured ? `${s.impressions} impressions across ${rs.length} ads.` : `Too early: ${s.impressions} impressions across ${rs.length} ad(s); need ${MIN_IMPRESSIONS}+ across ${MIN_ADS}+ ads.`,
      });
    }
  }
  const measuredN = entries.filter((e) => e.confidence === "measured").length;
  return {
    hasLiveData: true,
    statement: measuredN ? `${measuredN} attribute values have enough delivery to read; the rest are marked insufficient. CTR is shrunk toward the overall rate. Correlation, not proof of cause.` : `Ads have delivered (${tot.impressions} impressions) but no attribute has enough data yet. Treat everything as too early to tell.`,
    overall: { ads: live.length, ...tot, ctr: base },
    entries: entries.sort((a, b) => (a.confidence === b.confidence ? (b.shrunkCtr ?? 0) - (a.shrunkCtr ?? 0) : a.confidence === "measured" ? -1 : 1)),
  };
}

export interface HookLibraryItem { attribute: "hookType" | "angle"; value: string; shrunkCtr: number; ads: number; impressions: number }
/** Hooks/angles the generator may prefer later: only measured values that beat the overall CTR. Empty without live data. */
export function hookLibrary(l: Ledger, max = 5): HookLibraryItem[] {
  if (!l.overall) return [];
  return l.entries
    .filter((e) => (e.attribute === "hookType" || e.attribute === "angle") && e.confidence === "measured" && (e.shrunkCtr ?? 0) > (l.overall!.ctr ?? 0))
    .slice(0, max).map((e) => ({ attribute: e.attribute as "hookType" | "angle", value: e.value, shrunkCtr: e.shrunkCtr!, ads: e.ads, impressions: e.impressions }));
}
