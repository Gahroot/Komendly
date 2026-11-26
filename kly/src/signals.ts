// Intent signals: pure detectors (no I/O) that say WHY a lead is timely, plus how they feed prioritisation and the
// first line of the cold email. Signals live in OutboundLead.qualification.signals (JSON, no schema change); the
// import script records each adlib advertiser's signals as an AdsEvent (name "lead_signal") so attribution is measurable.
// Honesty rule: every opener states only what the evidence says. Unknown data produces NO signal.
import type { AdlibRow } from "./adlib";

export const SIGNAL_KINDS = [
  "stale_creative", "single_ad", "creative_gap", "new_website", "new_shopify_store", "grand_opening", "new_location", "site_refresh", "seasonal",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export interface LeadSignal {
  kind: SignalKind;
  /** Verifiable fact the signal rests on (shown in reports, quoted by the opener). */
  evidence: string;
  /** Where the fact came from, e.g. "meta_ad_library", "rdap", "site_homepage". */
  source: string;
  /** Short opener sentence (<= 20 words) that is true given `evidence`; null = never quote it in an email. */
  opener: string | null;
  /** Calendar hook for copy generation (seasonal only). */
  hook?: string;
  detectedAt: string;
}

export const STALE_OLDEST_DAYS = 45;
export const STALE_NEWEST_DAYS = 30;
export const SINGLE_AD_MAX = 2;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86_400_000);

/** "Jun 5, 2024" / "2026-05-12" / ISO -> Date (UTC), null when unparseable or in the future by > 1 day. */
export function parseAdDate(s: string | null | undefined): Date | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const d = /^\d{4}-\d{2}-\d{2}/.test(t) ? new Date(`${t.slice(0, 10)}T00:00:00Z`) : new Date(`${t} UTC`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export interface AdlibSignalRow extends AdlibRow {
  /** Optional: start date of the NEWEST active ad (when the pull records it). */
  newest_ad_start?: string | null;
  /** Optional: ad formats seen, e.g. ["image","video"]. */
  formats?: string[] | null;
}

const sig = (kind: SignalKind, evidence: string, source: string, opener: string | null, now: Date, hook?: string): LeadSignal => ({ kind, evidence, source, opener, detectedAt: now.toISOString(), ...(hook ? { hook } : {}) });

/**
 * Stale creative: the oldest active ad started > 45 days ago AND we can show no ad is newer than 30 days: either the
 * pull recorded the newest start date, or there is exactly one active ad (so all active ads are the old one).
 * With several ads and no newest date we cannot know, so no signal.
 */
export function detectStaleCreative(r: AdlibSignalRow, now: Date): LeadSignal | null {
  const oldest = parseAdDate(r.first_seen);
  const ads = Number(r.active_ads);
  if (!oldest || !Number.isFinite(ads) || ads < 1 || daysBetween(oldest, now) <= STALE_OLDEST_DAYS || oldest > now) return null;
  const newest = parseAdDate(r.newest_ad_start);
  const allOld = newest ? daysBetween(newest, now) > STALE_NEWEST_DAYS : ads === 1;
  if (!allOld) return null;
  const days = daysBetween(oldest, now);
  return sig("stale_creative", `oldest active ad started ${r.first_seen} (${days} days ago); ${newest ? `newest started ${r.newest_ad_start}` : "only 1 active ad"}`, "meta_ad_library",
    `Your longest-running Facebook ad has been live since ${monthYear(oldest)}.`, now);
}

/** Single-ad advertiser: <= 2 active ads (exactly 1 gets the sharper wording). */
export function detectSingleAd(r: AdlibSignalRow, now: Date): LeadSignal | null {
  const ads = Number(r.active_ads);
  if (!Number.isFinite(ads) || ads < 1 || ads > SINGLE_AD_MAX) return null;
  return sig("single_ad", `${ads} active ad${ads === 1 ? "" : "s"} in the Meta Ad Library`, "meta_ad_library",
    ads === 1 ? "I saw you have one ad running on Facebook right now." : "I saw you have two ads running on Facebook right now.", now);
}

const OFFER_RE = /(\d+\s?%|\$\s?\d|\bfree\b|\boff\b|\bspecial\b|\bsave\b|\bdiscount\b|\bpromo\b|\bdeal\b|\bsale\b)/i;
const PROOF_RE = /(\breview|\brated\b|\bstars?\b|★|\btestimonial|\btrusted\b|#1\b|\bwinner\b|\baward|\bclients? (say|love)|\b\d[\d,]*\+? (happy|clients|customers|patients|families))/i;
const CTA_RE = /(\bbook\b|\bcall\b|\bschedule\b|\bclaim\b|\bshop\b|\bsign up\b|\bget (your|a|started)\b|\bcontact\b|\bvisit\b|\blearn more\b|\bapply\b)/i;

/**
 * Creative gap: what the sampled ad copy and formats do not show. A one-line honest note; it only describes the
 * single sample we saw, so it says "the ad I saw". Null when the sample is empty or has no gap.
 */
export function detectCreativeGap(r: AdlibSignalRow, now: Date): LeadSignal | null {
  const text = (r.ad_text_sample ?? "").trim();
  if (text.length < 40) return null;
  const gaps: string[] = [];
  const fmts = (r.formats ?? []).map((f) => f.toLowerCase());
  if (fmts.length && !fmts.some((f) => f.includes("video"))) gaps.push("no video");
  if (!OFFER_RE.test(text)) gaps.push("no clear offer");
  if (!PROOF_RE.test(text)) gaps.push("no social proof");
  if (!CTA_RE.test(text)) gaps.push("no clear call to action");
  if (!gaps.length) return null;
  const note = gaps.slice(0, 2).join(" and ");
  return sig("creative_gap", `ad text sample shows ${gaps.join(", ")}`, "meta_ad_library", `The Facebook ad I saw from you has ${note}.`, now);
}

/** All Ad-Library-derived signals for one advertiser row. */
export function detectAdlibSignals(r: AdlibSignalRow, now: Date): LeadSignal[] {
  return [detectStaleCreative(r, now), detectSingleAd(r, now), detectCreativeGap(r, now)].filter((s): s is LeadSignal => s !== null);
}

// ---------------------------------------------------------------------------
// Prioritisation + copy

/** Score points per signal (added on top of the qualifier's 0-100, capped at +20 in total, final capped at 100). */
const BOOST: Record<SignalKind, number> = { stale_creative: 8, single_ad: 5, creative_gap: 4, new_website: 8, new_shopify_store: 7, grand_opening: 8, new_location: 6, site_refresh: 4, seasonal: 6 };
export const MAX_SIGNAL_BOOST = 20;

export function signalBoost(signals: readonly Pick<LeadSignal, "kind">[]): number {
  const kinds = new Set(signals.map((s) => s.kind));
  let t = 0;
  for (const k of kinds) t += BOOST[k] ?? 0;
  return Math.min(MAX_SIGNAL_BOOST, t);
}

/** Boosted score; a score of 0 (hard exclusion) or below the minimum stays as is: signals never rescue a bad lead. */
export function applySignalBoost(score: number, signals: readonly Pick<LeadSignal, "kind">[]): number {
  return score <= 0 ? score : Math.min(100, score + signalBoost(signals));
}

/** Read `signals` back out of a stored qualification JSON (tolerant). */
export function signalsOf(qualification: unknown): LeadSignal[] {
  const raw = (qualification as { signals?: unknown } | null)?.signals;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is LeadSignal => !!s && typeof s === "object" && typeof (s as LeadSignal).kind === "string" && (SIGNAL_KINDS as readonly string[]).includes((s as LeadSignal).kind));
}

/** Merge new signals into a qualification JSON object (kept as one object; null -> a fresh one). */
export function withSignals<Q>(qualification: Q, signals: readonly LeadSignal[]): Q | { signals: LeadSignal[] } {
  if (!signals.length) return qualification;
  const base = qualification && typeof qualification === "object" ? (qualification as object) : {};
  return { ...base, signals: [...signals] } as Q & { signals: LeadSignal[] };
}

/** Preference when only one line fits in the email: concrete facts about them beat a gap note, which beats the calendar. */
const OPENER_ORDER: readonly SignalKind[] = ["stale_creative", "grand_opening", "new_location", "new_shopify_store", "new_website", "single_ad", "site_refresh", "creative_gap", "seasonal"];

/** The ONE sentence the email may open with, or null. Only openers the detectors wrote (all evidence-backed). */
export function signalOpener(signals: readonly LeadSignal[]): string | null {
  for (const k of OPENER_ORDER) {
    const s = signals.find((x) => x.kind === k && x.opener);
    if (s?.opener) return s.opener.slice(0, 160);
  }
  return null;
}

/** First signal kind in opener order (for attribution props: which signal was actually quoted). */
export function openerKind(signals: readonly LeadSignal[]): SignalKind | null {
  return OPENER_ORDER.find((k) => signals.some((x) => x.kind === k && x.opener)) ?? null;
}

/** The seasonal hook text for copy generation, when the lead carries one. */
export function seasonalHookOf(signals: readonly LeadSignal[]): string | null {
  return signals.find((s) => s.kind === "seasonal")?.hook ?? null;
}
