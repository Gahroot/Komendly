// System #4 "Free output spreads Komendly" (registry key viral_branding, utm_source made_with).
// Pure TS (imported by web and engine; engine/Dockerfile COPYs it): paid-vs-free mark decision, mark short codes and
// the attributed CTA links every public share surface / mark carries.
import { isPaidWorkspace, type PaidCheckWorkspace } from "../ads/billing-gates";
import { unlimitedPassActive } from "../ads/billing-config";
import { withSystemUtm } from "./systems";

export const VIRAL_KEY = "viral_branding" as const;
export const SITE_URL = "https://www.komendly.com";
export const MADE_WITH_CTA = "Make your own free ads from your website";
export const MARK_LABEL = "Made with Komendly";
/** Where share CTAs and the /m short link send people (no-signup free-ads landing). */
export const MADE_WITH_LANDING = `${SITE_URL}/free-ads`;

/** Attributed CTA link: campaign = surface (studio_share, gift, mark, download...), content = ad/run/share id. */
export function madeWithCtaUrl(surface: string, contentId: string, base: string = MADE_WITH_LANDING): string {
  return withSystemUtm(base, VIRAL_KEY, { campaign: surface, content: contentId });
}

/** Short code printed on the mark: last 8 [a-z0-9] chars of the run id (cuid), stateless. */
export function markCode(runId: string): string {
  const s = runId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return s.slice(-8) || "free";
}

export function isMarkCode(code: string): boolean {
  return /^[a-z0-9]{4,12}$/.test(code);
}

/** Text printed under the mark, e.g. "komendly.com/m/ab12cd34". */
export function markShortUrl(code: string): string {
  return `komendly.com/m/${code}`;
}

/** Where /m/<code> redirects. */
export function markRedirectUrl(code: string): string {
  return madeWithCtaUrl("mark", code);
}

export interface BrandingDecisionInput {
  /** Kill switch sys_viral_branding. */
  systemOn: boolean;
  workspace: PaidCheckWorkspace & { unlimitedUntil?: Date | null };
  /** AdsBrandingSetting.removeBranding (null = no row = default for the plan). */
  removeBranding: boolean | null;
}

/** Paid = live subscription or an active Unlimited week pass. */
export function isPaidForBranding(ws: BrandingDecisionInput["workspace"], now: Date = new Date()): boolean {
  return isPaidWorkspace(ws) || unlimitedPassActive(ws, now);
}

/**
 * Should new output get the "Made with Komendly" mark? Free/trial (and gift/nurture runs of free workspaces): always.
 * Paid: never by default; only if they explicitly set removeBranding = false (opted to keep it).
 */
export function shouldBrand(i: BrandingDecisionInput, now: Date = new Date()): boolean {
  if (!i.systemOn) return false;
  if (!isPaidForBranding(i.workspace, now)) return true;
  return i.removeBranding === false;
}

/** Referrer is another site (or none) = a visit brought in by a share, not internal navigation. */
export function isExternalReferrer(referrer: string | null | undefined): boolean {
  if (!referrer) return true;
  try {
    return !/(^|\.)komendly\.com$/i.test(new URL(referrer).hostname);
  } catch {
    return true;
  }
}
