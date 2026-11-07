// Shared URL validation + post-submit destination for every "paste your website" form.
import type { AdGoalValue } from "./contracts";

export const SITE_URL_RE = /^(https?:\/\/)?[^\s/]+\.[^\s]{2,}/i;

export function isValidSiteUrl(value: string): boolean {
  return SITE_URL_RE.test(value.trim());
}

/** Where to go after a valid submit: straight to /ads/start when signed in, else through sign-up (which resumes it). */
export function startHref(url: string, goal: AdGoalValue, signedIn: boolean): string {
  const qs = new URLSearchParams({ url: url.trim(), goal }).toString();
  return signedIn ? `/ads/start?${qs}` : `/ads/signup?next=${encodeURIComponent(`/ads/start?${qs}`)}`;
}
