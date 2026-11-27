// Self-learning per customer: preference signals -> generation guidance, with sample-size caution. Pure.

export interface AdSignal {
  headline: string;
  awareness?: string | null;
  hasOffer?: boolean; // headline/body leads with an offer (price, % off, free, guarantee...)
  usesPhoto?: boolean | null; // null = unknown
  downloaded?: boolean;
  published?: boolean;
  rejected?: boolean; // failed QC or client asked for changes on its pack
  approved?: boolean;
}

export type Strength = "weak" | "moderate" | "strong";
export interface Guidance { id: string; text: string; strength: Strength; n: number; evidence: string }

/** Below this many ads with a signal we say nothing; below STRONG_N we call it weak (not used in prompts). */
export const MIN_SAMPLE = 6;
export const STRONG_N = 15;
/** The preferred group must beat the other by this share-of-kept margin before we call it a preference. */
const MARGIN = 0.2;

export const isKept = (a: AdSignal) => Boolean(a.downloaded || a.published || a.approved);
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const OFFER_RE = /(\$\s?\d|\d+\s?%|\bfree\b|\bfrom\s+\$|\bguarantee|\bsave\b|\boff\b|\bno\s+(?:cost|obligation)|\bsame[- ]day\b|\b\d+\s?(?:day|hour|min)\b)/i;
export function leadsWithOffer(headline: string, body?: string | null): boolean {
  return OFFER_RE.test(headline) || OFFER_RE.test((body ?? "").slice(0, 60));
}

const strengthFor = (n: number, diff: number): Strength => (n >= STRONG_N && diff >= 0.35 ? "strong" : n >= MIN_SAMPLE * 2 ? "moderate" : "weak");

function compare(
  ads: AdSignal[], id: string, a: (x: AdSignal) => boolean | null | undefined, textA: string, textB: string, labelA: string, labelB: string,
): Guidance | null {
  const known = ads.filter((x) => a(x) !== null && a(x) !== undefined);
  const A = known.filter((x) => a(x)), B = known.filter((x) => !a(x));
  if (known.length < MIN_SAMPLE || A.length < 2 || B.length < 2) return null; // need both groups to compare
  const rA = A.filter(isKept).length / A.length, rB = B.filter(isKept).length / B.length;
  const diff = rA - rB;
  if (Math.abs(diff) < MARGIN) return null;
  const aWins = diff > 0;
  const w = aWins ? A : B, r = aWins ? rA : rB, o = aWins ? rB : rA;
  return {
    id, text: aWins ? textA : textB, strength: strengthFor(known.length, Math.abs(diff)), n: known.length,
    evidence: `${aWins ? labelA : labelB} ads kept ${Math.round(r * 100)}% of the time vs ${Math.round(o * 100)}% (${w.length} of ${known.length} ads)`,
  };
}

/**
 * Turn what a customer kept (downloaded / approved / published) vs left into guidance.
 * Only compares when both groups have >= 2 ads and >= MIN_SAMPLE ads have a signal; "weak" guidance is kept for the
 * weekly record but never reaches a prompt. It is a pattern in this customer's choices, not a result promise.
 */
export function learnGuidance(ads: AdSignal[]): { guidance: Guidance[]; sampleSize: number } {
  const usable = ads.filter((a) => a.headline);
  const sampleSize = usable.filter((a) => a.downloaded !== undefined || a.published !== undefined || a.approved !== undefined || a.rejected !== undefined).length;
  if (sampleSize < MIN_SAMPLE) return { guidance: [], sampleSize };
  const g = [
    compare(usable, "short_headlines", (a) => wordCount(a.headline) <= 6, "Prefers short headlines (6 words or fewer)", "Prefers longer, more explained headlines", "short-headline", "longer-headline"),
    compare(usable, "offer_led", (a) => (a.hasOffer ?? leadsWithOffer(a.headline)), "Prefers ads that lead with the offer", "Prefers ads that don't lead with a price or offer", "offer-led", "non-offer"),
    compare(usable, "no_stock_photos", (a) => (a.usesPhoto === null || a.usesPhoto === undefined ? null : !a.usesPhoto), "Prefers ads without photos (graphic-led)", "Prefers ads with real photos", "graphic-led", "photo"),
  ].filter((x): x is Guidance => !!x);
  const rejected = usable.filter((a) => a.rejected);
  if (rejected.length >= 3 && rejected.length / usable.length >= 0.3) {
    g.push({ id: "tighter_qc", text: "Several ads were rejected: keep claims plain and specific", strength: "moderate", n: usable.length, evidence: `${rejected.length} of ${usable.length} ads rejected` });
  }
  return { guidance: g, sampleSize };
}

export interface WeeklyLearned { lines: string[]; sampleSize: number; measured: boolean }

/**
 * "What we learned about your business" for the weekly record/report: measured facts only. Empty list when there is
 * nothing measured yet (callers then skip the section instead of padding it).
 */
export function weeklyLearned(i: { guidance: Guidance[]; sampleSize: number; kept: number; made: number; performance?: { spendUsd: number; leads: number; days: number } | null; approvals?: number; changeRequests?: number }): WeeklyLearned {
  const lines: string[] = [];
  if (i.made > 0) lines.push(`You kept ${i.kept} of ${i.made} ads from the last 30 days (downloaded, approved or published).`);
  for (const g of i.guidance.filter((x) => x.strength !== "weak").slice(0, 2)) lines.push(`${g.text}. ${g.evidence}.`);
  if (i.performance && i.performance.spendUsd > 0) lines.push(`Meta measured ${i.performance.leads} lead${i.performance.leads === 1 ? "" : "s"} on $${i.performance.spendUsd.toFixed(0)} spent over ${i.performance.days} day${i.performance.days === 1 ? "" : "s"}.`);
  if (i.approvals) lines.push(`Your client approved ${i.approvals} pack${i.approvals === 1 ? "" : "s"}.`);
  if (i.changeRequests) lines.push(`Your client asked for changes on ${i.changeRequests} pack${i.changeRequests === 1 ? "" : "s"}; Ozzy used the notes.`);
  return { lines, sampleSize: i.sampleSize, measured: lines.length > 0 };
}
