// Trial fill policy: a free trial keeps replacing failed ads until it has the promised number of READY
// ads, within an attempt budget (ADS_TRIAL_ATTEMPT_FACTOR x promised, default 2) and a wall-clock cap
// (ADS_TRIAL_FILL_MAX_MIN from confirm, default 25). The last slots use progressively safer fallbacks:
// "template" = HTML template renderer instead of the AI-composed image; "type" = typographic layout,
// no photo (no image_relevant risk), brand wordmark when the logo is unusable (brandkit drops blank logos).
import type { AdSpec } from "../../../src/lib/ads/contracts";
import { GIFT_FILL_MAX_MS, isFreeRun } from "./gift-policy";

export type Fallback = "template" | "type";
type Env = NodeJS.ProcessEnv;

export function trialAttemptFactor(env: Env = process.env): number {
  const n = Number(env.ADS_TRIAL_ATTEMPT_FACTOR);
  return Number.isFinite(n) && n >= 1 ? n : 2;
}

export function trialFillMaxMs(env: Env = process.env): number {
  const n = Number(env.ADS_TRIAL_FILL_MAX_MIN);
  return (Number.isFinite(n) && n > 0 ? n : 25) * 60_000;
}

/** True while a trial run may still start replacements (wall-clock cap from confirm/creation). */
export function withinFillWindow(run: { isTrial?: boolean; kind?: string | null; confirmedAt?: Date | null; createdAt?: Date | null }, now: Date, env: Env = process.env): boolean {
  if (isFreeRun(run)) {
    const from = run.confirmedAt ?? run.createdAt;
    return !from || now.getTime() - from.getTime() <= GIFT_FILL_MAX_MS;
  }
  if (!run.isTrial) return true;
  const from = run.confirmedAt ?? run.createdAt;
  return !from || now.getTime() - from.getTime() <= trialFillMaxMs(env);
}

/**
 * Fallback for a replacement, given how many ads of its kind the run already has (originals + replacements).
 * Trials only: after 3 replacements use the template renderer, in the last third of the budget go typographic.
 */
export function fallbackFor(run: { isTrial?: boolean; kind?: string | null; staticCount: number }, totalSoFar: number, cap: number, missing = 0): Fallback | null {
  // Gifts: cheapest reliable path. First replacement uses the template renderer, the last attempt goes typographic.
  if (isFreeRun(run)) {
    if (totalSoFar - run.staticCount < 1) return null;
    return cap - totalSoFar <= 1 ? "type" : "template";
  }
  if (!run.isTrial) return null;
  const replacements = totalSoFar - run.staticCount;
  // Headroom: once the attempts left barely cover the slots still missing, every replacement goes typographic
  // (no image gen, no image_relevant risk) so all missing slots are filled in parallel by safe ads.
  if (missing > 0 && cap - totalSoFar <= missing + 1) return "type";
  if (replacements < 3) return null;
  const left = cap - totalSoFar;
  return left <= Math.max(2, Math.ceil(run.staticCount / 3)) ? "type" : "template";
}

/** Text-only layouts that reliably pass QC (no photo, no fake UI, body shown or omitted by design). */
// founder_note is excluded: its "A note from <brand>" tag + signature mark reads as the brand shown twice (offer_clear fails).
export const SAFE_TYPE_LAYOUTS = ["minimal_type", "offer_card"] as const;

/** Most text-only (no photo) ads a pack may contain: a pack of all-type ads reads as a quality drop.
 *  Trials: ADS_TRIAL_MAX_TYPE (default 3 of 10); gifts: 1 of 3. Beyond it, failed photo ads get a new photo/template. */
export function maxTypeAds(run: { isTrial?: boolean; kind?: string | null; staticCount: number }): number {
  if (isFreeRun(run)) return 1;
  const n = Number(process.env.ADS_TRIAL_MAX_TYPE ?? "3");
  return Math.max(0, Math.min(run.staticCount, Number.isFinite(n) ? Math.floor(n) : 3));
}

/** True when an ad renders without a photo (typographic fallback or a text-only layout). */
export function isTypeAd(visualBrief: unknown): boolean {
  const vb = (visualBrief ?? {}) as { fallback?: string; layout?: string };
  return vb.fallback === "type" || (SAFE_TYPE_LAYOUTS as readonly string[]).includes(vb.layout ?? "");
}

/** Text-only ads already in the pack (ready or in flight; failed ones don't count). */
export function countTypeAds(ads: Array<{ status: string; visualBrief: unknown; kind?: string }>): number {
  return ads.filter((a) => (a.kind ?? "static") === "static" && !isLocked(a.visualBrief) && !["failed", "failed_qc"].includes(a.status) && isTypeAd(a.visualBrief)).length;
}

/** Template layouts drop bodies longer than this (never cut). */
export const MAX_TYPE_BODY = 70;

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[\p{L}\p{N}$]{4,}|\$?\d[\d.,]*/gu) ?? []);
}

/**
 * Body for a typographic ad: it must name the concrete offer (offer_clear), and fit the layout (bodies over 70
 * chars are dropped by the template, leaving only a question headline). Keeps the ad's own body when it already
 * mentions the offer (shares a price/number or a key word); otherwise uses the offer line (or its first clause).
 */
export function offerLine(body: string | null | undefined, offer: string | null | undefined): string | null {
  const b = body?.trim() || null;
  const o = offer?.trim().replace(/\s+/g, " ") || null;
  const fits = (s: string | null): s is string => Boolean(s && s.length <= MAX_TYPE_BODY);
  if (fits(b) && o) {
    const ow = words(o);
    if (/\d/.test(b) || [...words(b)].some((w) => ow.has(w))) return b;
  }
  if (o && o.length <= MAX_TYPE_BODY) return o;
  const clause = o?.split(/(?<=[.;:!?])\s+|\s+[-–—]\s+|,\s+/)[0]?.replace(/[.;:,]$/, "") ?? null;
  if (fits(clause) && clause.split(" ").length >= 3) return clause;
  return fits(b) ? b : null;
}

/** Rewrites a spec for the typographic fallback: no assets, no generated imagery. */
export function typographicSpec(spec: AdSpec, used: readonly string[], offer?: string | null): AdSpec {
  const pool = SAFE_TYPE_LAYOUTS.filter((l) => l !== "offer_card" || (spec.awareness !== "unaware" && spec.awareness !== "problem_aware"));
  const count = (l: string) => used.filter((u) => u === l).length;
  const layout = [...pool].sort((a, b) => count(a) - count(b) || pool.indexOf(a) - pool.indexOf(b))[0] ?? "minimal_type";
  const body = offerLine(spec.body, offer) ?? undefined;
  return { ...spec, body, visual: { ...spec.visual, layout, assetKeys: [], generateImagery: false, imageryPrompt: undefined } };
}

/** Static layouts that draw app UI (chat bubbles, notification cards): QC rejects them as fake UI. */
export const FAKE_UI_LAYOUTS = new Set(["chat_moment", "notification"]);

export function fallbackOf(visualBrief: unknown): Fallback | null {
  const f = (visualBrief as { fallback?: unknown } | null)?.fallback;
  return f === "template" || f === "type" ? f : null;
}

// ---- Locked bonus ads (trial upsell) ----

export type BonusKind = "story" | "motion";

export function bonusEnabled(env: Env = process.env): boolean {
  return env.ADS_TRIAL_BONUS === "1";
}

export function bonusCounts(env: Env = process.env): { stories: number; motion: number } {
  const n = (v: string | undefined, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.floor(x) : d;
  };
  return { stories: n(env.ADS_TRIAL_BONUS_STORIES, 3), motion: n(env.ADS_TRIAL_BONUS_MOTION, 2) };
}

/** Locked bonus ad (visualBrief.locked = true). Never counts toward the run's pack, never holds credits. */
export function isLocked(visualBrief: unknown): boolean {
  return (visualBrief as { locked?: unknown } | null)?.locked === true;
}

export function bonusKindOf(visualBrief: unknown): BonusKind | null {
  if (!isLocked(visualBrief)) return null;
  const k = (visualBrief as { bonusKind?: unknown }).bonusKind;
  return k === "story" || k === "motion" ? k : null;
}

/** Bonus work sorts below every normal job, even after aging and the QC boost. */
export const BONUS_PRIORITY = -3000;

/** Image concept for a retry after an image_relevant fail: keep the idea, add the judge's reason and the must-show offer. */
export function retryConcept(concept: string, why: string, offer: string | null | undefined): string {
  const base = concept.split(" || Retry: ")[0] ?? concept;
  const must = offer ? `The picture must plainly show what the business sells (${offer.slice(0, 120)}), recognisable at a glance` : "The picture must plainly show what this business sells, recognisable at a glance";
  return `${base} || Retry: the previous picture was rejected (${why.slice(0, 160) || "not clearly about this business"}). ${must}; no generic desk, plant or mug props.`;
}

// ---- Early pack completion + hedged replacements (trial time-to-done) ----
// A trial run is "pack ready" (status completed/partial) as soon as its promised statics are READY, even while
// surplus/hedge/re-render work is still in flight: that work keeps going in the background and any ad that passes
// QC later simply joins the gallery. Disable with ADS_TRIAL_EARLY_DONE=0.

export function earlyDoneEnabled(env: Env = process.env): boolean {
  return env.ADS_TRIAL_EARLY_DONE !== "0";
}

/** The trial's motion ad may finish after the pack is marked ready (render_motion p90 ~8 min). ADS_TRIAL_MOTION_BACKGROUND=0 waits for it. */
export function motionInBackground(env: Env = process.env): boolean {
  return env.ADS_TRIAL_MOTION_BACKGROUND !== "0";
}

/** On a trial static's FIRST QC fail, plan a replacement in parallel with its re-render. ADS_TRIAL_HEDGE=0 disables. */
export function hedgeEnabled(env: Env = process.env): boolean {
  return env.ADS_TRIAL_HEDGE !== "0";
}

/** Ready ads after which a run counts as "6 ready" (instrumentation: time-to-6). */
export const READY_MILESTONE = 6;

export interface PackAd {
  kind: string;
  status: string;
  /** Superseded by a replacement (qcReport.replacedBy). */
  replaced: boolean;
  /** A replacement is queued for it (qcReport.replacementPending). */
  pending: boolean;
}

/**
 * Early completion status for a trial pack, or null to keep waiting (pure). Locked bonus ads must be filtered out
 * by the caller. Statics: promised count ready. Motion: ready, or still in flight (when allowed in background);
 * a motion ad that failed for good makes the pack "partial", as the normal path would.
 */
export function earlyPackStatus(run: { staticCount: number; motionCount: number }, ads: readonly PackAd[], motionBackground: boolean): "completed" | "partial" | null {
  const live = ads.filter((a) => !a.replaced);
  const ready = (k: string) => live.filter((a) => a.kind === k && a.status === "ready").length;
  if (ready("static") < run.staticCount) return null;
  if (ready("motion") >= run.motionCount) return "completed";
  const motionPending = live.some((a) => a.kind === "motion" && (a.pending || !["ready", "failed", "failed_qc"].includes(a.status)));
  if (motionPending) return motionBackground ? "completed" : null;
  return "partial";
}

// ---- Settle fill (trials) ----
// Once every static slot is settled (no static ad rendering/in QC, no replacement pending/planning) and the pack is
// still short, the run starts typographic fill replacements right away, past the normal attempt budget by up to
// ADS_TRIAL_SETTLE_EXTRA (default 4) attempts. If that is exhausted too, the run completes "partial" at once instead
// of waiting for the motion ad. ADS_TRIAL_SETTLE_FILL=0 disables the fill (early partial still applies).

export function settleFillEnabled(env: Env = process.env): boolean {
  return env.ADS_TRIAL_SETTLE_FILL !== "0";
}

export function settleExtra(env: Env = process.env): number {
  const n = Number(env.ADS_TRIAL_SETTLE_EXTRA);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 4;
}

/** Missing statics once all static slots are settled; null while any static is still in flight (pure). */
export function settledShortfall(run: { staticCount: number }, ads: readonly PackAd[]): number | null {
  const statics = ads.filter((a) => a.kind === "static" && !a.replaced);
  if (statics.some((a) => a.pending || !["ready", "failed", "failed_qc"].includes(a.status))) return null;
  return Math.max(0, run.staticCount - statics.filter((a) => a.status === "ready").length);
}
