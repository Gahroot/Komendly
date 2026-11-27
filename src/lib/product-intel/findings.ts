// Aggregate stored creative_score rows into systematic findings, and map findings to change PROPOSALS for the owner.
// Nothing here edits a prompt or template; proposals are text for a human to accept.
import { CREATIVE_FINDING_EVENT, type Issue, type Severity } from "./creative";

export { CREATIVE_FINDING_EVENT };
export interface ScoreRow {
  runId: string;
  trade: string | null;
  template: string | null;
  model: string | null;
  promptVersion: string | null;
  packScore: number;
  ads: Array<{ adId: string; score: number; issues: Issue[] }>;
  packIssues: Issue[];
}
export type Dimension = "trade" | "template" | "model" | "promptVersion" | "all";
export interface Finding {
  cause: string;
  dimension: Dimension;
  key: string;
  count: number;
  n: number;
  rate: number;
  baselineRate: number;
  severity: Severity;
  exampleRunIds: string[];
  suggestedFix: string;
  confidence: "measured" | "insufficient";
}

export const FIXES: Record<string, string> = {
  headline_long: "Plan prompt: cap headlines at 8-10 words and ask for the shortest version that still names the reader.",
  headline_hard_to_read: "Plan prompt: prefer short everyday words; avoid words over 8 letters in headlines.",
  headline_all_caps: "Template: stop upper-casing headlines in this layout.",
  no_callout: "Plan prompt: require the first six words to name the reader (trade, city, or 'you/your') before the benefit.",
  cta_missing: "Plan prompt: every ad needs a CTA naming what the click gets; reject plans with an empty cta.",
  cta_weak: "Plan prompt: extend the banned-CTA list and require a CTA that names the offer.",
  cta_repetitive: "Plan prompt: assign a distinct CTA per slot (already requested; enforce in validation).",
  angle_repetitive: "Plan prompt: strengthen the per-slot angle diversity instruction for this trade.",
  banned_claim: "Plan prompt: add the flagged phrasing to the forbidden list; claims must map to brand facts.",
  number_without_source: "Plan prompt: numbers and prices only when a brand fact supplies them.",
  offer_absent: "Plan prompt: weave the brand's main offer into at least half of the ads.",
  trade_irrelevant: "Plan prompt: include the trade's own words (jobs, tools, customer problems) in the hook.",
  city_absent: "Plan prompt: use the city/service area in the call-out where the brand lists one.",
  low_resolution: "Render: check export size for this ratio/template.",
  empty_image: "Render: investigate blank/failed renders for this template (add a QC pixel-variance gate later).",
  low_contrast: "Template: strengthen the text scrim or text colour contrast for this layout.",
  safe_zone: "Template: increase the outer padding / safe margins for this layout.",
  brand_colors_missing: "Template: apply brand primary/accent colours to at least one element.",
  logo_missing: "Onboarding: ask for a logo, or crop one from the site (see jobs/blank-logo).",
  duplicate_image: "Template/plan: vary layout or imagery between slots; two ads look alike.",
  duplicate_copy: "Plan prompt: forbid near-identical headlines across slots.",
  image_unavailable: "Pipeline: stored image missing or unreadable; check asset expiry and storage keys.",
  ai_callout: "Plan prompt: sharpen call-out instruction (name the buyer in the first line).",
  ai_value: "Plan prompt: state one concrete value without promising results.",
  ai_cta: "Plan prompt: make the next step specific and low-effort.",
  ai_likelihood: "Plan prompt: add believable proof from brand facts (never invented) to raise perceived likelihood.",
  ai_effort: "Plan prompt: say how quick/easy the next step is, from brand facts.",
  ai_firstFiveSeconds: "Plan prompt: open with a sharper scroll-stopping hook (pain or question in the buyer's words).",
};
const rank: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const MIN_COUNT = 3;
const MIN_N = 8;

function dimValues(r: ScoreRow): Array<[Dimension, string]> {
  return [["all", "all"], ["trade", r.trade ?? "unknown"], ["template", r.template ?? "unknown"], ["model", r.model ?? "unknown"], ["promptVersion", r.promptVersion ?? "unversioned"]];
}

/** Findings: an issue that hits >=3 ads (>=8 ads in the group) and is clearly worse than the overall rate (or, for 'all', >=25%). */
export function aggregateFindings(rows: ScoreRow[]): Finding[] {
  type Agg = { n: number; byCause: Map<string, { count: number; sev: Severity; runs: Set<string> }> };
  const groups = new Map<string, Agg>();
  const touch = (dim: Dimension, key: string, runId: string, issues: Issue[], isAd: boolean) => {
    const g = groups.get(`${dim}\u0000${key}`) ?? groups.set(`${dim}\u0000${key}`, { n: 0, byCause: new Map() }).get(`${dim}\u0000${key}`)!;
    if (isAd) g.n++;
    for (const i of issues) {
      const c = g.byCause.get(i.code) ?? g.byCause.set(i.code, { count: 0, sev: "low", runs: new Set() }).get(i.code)!;
      c.count++;
      if (rank[i.severity] > rank[c.sev]) c.sev = i.severity;
      c.runs.add(runId);
    }
  };
  for (const r of rows) for (const [d, k] of dimValues(r)) {
    for (const a of r.ads) touch(d, k, r.runId, a.issues, true);
    if (r.packIssues.length) touch(d, k, r.runId, r.packIssues, false);
  }
  const all = groups.get("all\u0000all");
  const out: Finding[] = [];
  for (const [gk, g] of groups) {
    const [dim, key] = gk.split("\u0000") as [Dimension, string];
    for (const [cause, c] of g.byCause) {
      const rate = g.n ? c.count / g.n : 0;
      const base = all && all.n ? (all.byCause.get(cause)?.count ?? 0) / all.n : 0;
      const systematic = dim === "all" ? rate >= 0.25 : rate >= Math.max(0.25, base * 1.5);
      if (c.count < MIN_COUNT || !systematic) continue;
      out.push({ cause, dimension: dim, key, count: c.count, n: g.n, rate: round(rate), baselineRate: round(base), severity: c.sev, exampleRunIds: [...c.runs].slice(0, 5), suggestedFix: FIXES[cause] ?? "Review manually.", confidence: g.n >= MIN_N ? "measured" : "insufficient" });
    }
  }
  return out.filter((f) => f.confidence === "measured").sort((a, b) => rank[b.severity] * b.count - rank[a.severity] * a.count);
}
const round = (n: number) => Math.round(n * 1000) / 1000;

export interface Proposal { id: string; target: "plan_prompt" | "template" | "render" | "onboarding" | "pipeline"; title: string; change: string; evidence: string; severity: Severity; exampleRunIds: string[]; status: "proposed" }
const targetOf = (fix: string): Proposal["target"] => fix.startsWith("Plan prompt") ? "plan_prompt" : fix.startsWith("Template") ? "template" : fix.startsWith("Render") ? "render" : fix.startsWith("Onboarding") ? "onboarding" : "pipeline";

/** Pure mapper: findings -> owner proposals (one per cause, strongest evidence first). Never applied automatically. */
export function proposalsFromFindings(findings: Finding[], max = 8): Proposal[] {
  const byCause = new Map<string, Finding[]>();
  for (const f of findings) (byCause.get(f.cause) ?? byCause.set(f.cause, []).get(f.cause)!).push(f);
  const out: Proposal[] = [];
  for (const [cause, fs] of byCause) {
    const top = [...fs].sort((a, b) => b.count - a.count)[0]!;
    const where = fs.filter((f) => f.dimension !== "all").map((f) => `${f.dimension}=${f.key} (${f.count}/${f.n})`).slice(0, 4).join(", ");
    out.push({ id: `${cause}:${top.dimension}:${top.key}`, target: targetOf(top.suggestedFix), title: `Fix "${cause.replace(/_/g, " ")}"`, change: top.suggestedFix, evidence: `${top.count} of ${top.n} ads (${Math.round(top.rate * 100)}%) in ${top.dimension}=${top.key}${where ? `; also ${where}` : ""}.`, severity: top.severity, exampleRunIds: top.exampleRunIds, status: "proposed" });
  }
  return out.sort((a, b) => rank[b.severity] - rank[a.severity]).slice(0, max);
}
