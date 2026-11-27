// Creative quality scorer (pure TS + zod only: imported by web and engine). Programmatic checks on one ad's copy +
// image metrics, pack-level checks across the ads, and the severity-weighted score. Report-only: nothing blocks a pack.
// Methodology: $100M Leads ad principles (call-out, value, CTA; first 5 seconds) + Hormozi value equation.

export const CREATIVE_SCORE_EVENT = "creative_score";
export const CREATIVE_FINDING_EVENT = "creative_finding";
export const SCORER_VERSION = "cq-1";

export type Severity = "high" | "medium" | "low";
export interface Issue { code: string; severity: Severity; detail: string }

export interface AdCopy {
  id: string;
  index: number;
  kind: string;
  awareness?: string | null;
  angle: string;
  hook: string;
  headline: string;
  body: string | null;
  cta: string | null;
  claimCount: number;
  template: string | null;
}
/** Measured from the rendered image (engine/src/productintel/image-metrics.ts); null when the image was unavailable. */
export interface ImageMetrics {
  width: number;
  height: number;
  /** p95 - p5 of luminance, 0-255 (legibility proxy). */
  lumaRange: number;
  lumaStd: number;
  /** Share of outer-margin pixels that carry strong edges (text/graphics crowding the edge), 0-1. */
  marginInk: number;
  /** Share of pixels near any brand colour, 0-1; null when the brand has no colours. */
  brandColorShare: number | null;
  /** 64-bit average hash as 16 hex chars. */
  hash: string;
}
export interface PackContext {
  trade: string | null;
  city: string | null;
  offer: string | null;
  brandName: string | null;
  hasLogo: boolean;
}

export const BANNED_CTAS = ["learn more", "see how it works", "follow along", "get started", "discover more"];
const PROMISES: Array<[RegExp, string]> = [
  [/\bguarantee[sd]?\b/i, "guarantee"],
  [/\brisk[- ]free\b/i, "risk-free"],
  [/\b(double|triple|10x|\d+x)\b.*\b(leads|sales|revenue|roi|roas|customers)\b/i, "multiplier result promise"],
  [/\b#1\b|\bbest in\b|\bnumber one\b/i, "unsupported superlative"],
  [/\bonly \d+ (left|spots|remaining)\b|\blast chance\b/i, "fake scarcity"],
  [/\bget (more )?(leads|customers|clients) (fast|guaranteed|now)\b/i, "outcome promise"],
  [/\b(make|earn) \$\d/i, "earnings promise"],
];

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
export function jaccard(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let i = 0;
  for (const t of x) if (y.has(t)) i++;
  return i / (x.size + y.size - i);
}
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) { let v = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16); while (v) { d += v & 1; v >>= 1; } }
  return d;
}
const issue = (code: string, severity: Severity, detail: string): Issue => ({ code, severity, detail });
const PENALTY: Record<Severity, number> = { high: 25, medium: 12, low: 5 };

/** Copy checks for one ad (no image needed). */
export function checkCopy(ad: AdCopy, ctx: PackContext): Issue[] {
  const out: Issue[] = [];
  const h = ad.headline.trim();
  const hw = words(h);
  const all = [ad.headline, ad.body ?? "", ad.cta ?? "", ad.hook].join(" ");
  if (!h) out.push(issue("headline_missing", "high", "No headline."));
  else {
    if (hw.length > 12 || h.length > 80) out.push(issue("headline_long", "medium", `Headline is ${hw.length} words / ${h.length} characters; over 12 words / 80 characters reads slowly in a feed.`));
    const avg = hw.reduce((s, w) => s + w.length, 0) / Math.max(1, hw.length);
    if (hw.length >= 4 && avg > 7) out.push(issue("headline_hard_to_read", "low", `Average word length ${avg.toFixed(1)}; long words slow a scroll.`));
    if (/^[A-Z0-9 !?.,'-]+$/.test(h) && h.length > 12) out.push(issue("headline_all_caps", "low", "All-caps headline is harder to read."));
    const lead = hw.slice(0, 6).join(" ").toLowerCase();
    const trade = ctx.trade?.toLowerCase();
    const callout = /\b(you|your|you're|if you|are you|tired of|need|looking for|homeowners?|owners?)\b/.test(lead) || lead.includes("?") || (trade ? lead.includes(trade) : false) || (ctx.city ? lead.includes(ctx.city.toLowerCase()) : false);
    if (!callout) out.push(issue("no_callout", "medium", "First six words do not call out who it is for (no 'you', question, trade or city). $100M Leads: name the reader first."));
  }
  const cta = (ad.cta ?? "").trim();
  if (!cta) out.push(issue("cta_missing", "high", "No call to action."));
  else if (BANNED_CTAS.includes(norm(cta)) || words(cta).length > 6) out.push(issue("cta_weak", "medium", `CTA "${cta}" is vague or long; name what the click gets.`));
  for (const [re, label] of PROMISES) if (re.test(all)) out.push(issue("banned_claim", "high", `Copy contains a ${label}; Komendly never promises results.`));
  if ((/\d+%|\$\d/.test(all) || /\b\d{2,}\b/.test(h)) && ad.claimCount === 0) out.push(issue("number_without_source", "medium", "Percentage or price in the copy but no sourced claim attached."));
  if (ctx.offer) {
    const o = tokens(ctx.offer);
    const t = tokens(all);
    let hit = 0;
    for (const w of o) if (t.has(w)) hit++;
    if (o.size >= 2 && hit === 0) out.push(issue("offer_absent", "low", "Nothing in the copy echoes the brand's main offer."));
  }
  if (ctx.trade && !norm(all).includes(norm(ctx.trade)) && !norm(all).includes(norm(ctx.trade).replace(/s$/, ""))) out.push(issue("trade_irrelevant", "low", `Copy never mentions the trade (${ctx.trade}).`));
  if (ctx.city && !norm(all).includes(norm(ctx.city))) out.push(issue("city_absent", "low", `Copy does not mention ${ctx.city}.`));
  return out;
}

/** Image checks for one ad from measured metrics. */
export function checkImage(m: ImageMetrics | null, ctx: PackContext): Issue[] {
  if (!m) return [issue("image_unavailable", "medium", "Rendered image could not be read, so image checks were skipped.")];
  const out: Issue[] = [];
  if (Math.min(m.width, m.height) < 600) out.push(issue("low_resolution", "high", `${m.width}x${m.height}: too small for a feed ad.`));
  else if (Math.min(m.width, m.height) < 1000) out.push(issue("low_resolution", "low", `${m.width}x${m.height}: under 1000px on the short side.`));
  if (m.lumaStd < 12) out.push(issue("empty_image", "high", "Image is nearly one flat tone (empty or failed render)."));
  else if (m.lumaRange < 70) out.push(issue("low_contrast", "medium", `Tonal range ${Math.round(m.lumaRange)}/255; text is likely hard to read.`));
  if (m.marginInk > 0.18) out.push(issue("safe_zone", "medium", "Text or graphics crowd the outer edge, where feeds and Stories crop or overlay."));
  if (m.brandColorShare !== null && m.brandColorShare < 0.02) out.push(issue("brand_colors_missing", "low", "Almost none of the brand's colours appear."));
  if (!ctx.hasLogo) out.push(issue("logo_missing", "low", "Brand has no logo on file, so none can appear in the ads."));
  return out;
}

export interface AdScore { adId: string; index: number; score: number; issues: Issue[] }
export interface PackScore { runId: string; version: string; packScore: number; ads: AdScore[]; packIssues: Issue[]; template: string | null }
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const scoreFromIssues = (issues: Issue[]) => clamp(100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0));

/** Score a whole pack. Duplicates are looked for across ads (image hash and copy). */
export function scorePackPure(runId: string, ads: Array<{ copy: AdCopy; metrics: ImageMetrics | null }>, ctx: PackContext): PackScore {
  const per = new Map<string, Issue[]>();
  for (const a of ads) per.set(a.copy.id, [...checkCopy(a.copy, ctx), ...checkImage(a.metrics, ctx)]);
  const packIssues: Issue[] = [];
  for (let i = 0; i < ads.length; i++) for (let j = i + 1; j < ads.length; j++) {
    const a = ads[i]!, b = ads[j]!;
    if (a.metrics && b.metrics && hamming(a.metrics.hash, b.metrics.hash) <= 4) {
      for (const x of [a, b]) per.get(x.copy.id)!.push(issue("duplicate_image", "medium", `Looks the same as ad ${(x === a ? b : a).copy.index + 1}.`));
    } else if (jaccard(a.copy.headline, b.copy.headline) >= 0.8) {
      for (const x of [a, b]) per.get(x.copy.id)!.push(issue("duplicate_copy", "medium", `Headline near-identical to ad ${(x === a ? b : a).copy.index + 1}.`));
    }
  }
  const ctas = ads.map((a) => norm(a.copy.cta ?? "")).filter(Boolean);
  if (ctas.length >= 4 && new Set(ctas).size <= Math.ceil(ctas.length / 3)) packIssues.push(issue("cta_repetitive", "low", `${new Set(ctas).size} distinct CTAs across ${ctas.length} ads.`));
  const angles = new Set(ads.map((a) => norm(a.copy.angle)));
  if (ads.length >= 4 && angles.size <= Math.ceil(ads.length / 3)) packIssues.push(issue("angle_repetitive", "medium", `Only ${angles.size} distinct angles across ${ads.length} ads.`));
  const scored = ads.map((a) => ({ adId: a.copy.id, index: a.copy.index, issues: per.get(a.copy.id)!, score: scoreFromIssues(per.get(a.copy.id)!) }));
  const avg = scored.length ? scored.reduce((s, a) => s + a.score, 0) / scored.length : 0;
  const packScore = scored.length ? clamp(avg - packIssues.reduce((s, i) => s + PENALTY[i.severity] / 2, 0)) : 0;
  return { runId, version: SCORER_VERSION, packScore, ads: scored, packIssues, template: ads[0]?.copy.template ?? null };
}
