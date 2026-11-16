// Shared URL validation + post-submit destination for every "paste your website" form.
import type { AdGoalValue } from "./contracts";

export const SITE_URL_RE = /^(https?:\/\/)?[^\s/]+\.[^\s]{2,}/i;

export function isValidSiteUrl(value: string): boolean {
  return SITE_URL_RE.test(value.trim());
}

/** "/ads/start?url=https://www.joesplumbing.com/x&goal=auto" -> "joesplumbing.com"; null when `next` isn't a pending run. */
export function pendingRunDomain(next: string | null | undefined): string | null {
  if (!next?.startsWith("/ads/start?")) return null;
  const raw = new URLSearchParams(next.slice("/ads/start?".length)).get("url")?.trim();
  if (!raw || !isValidSiteUrl(raw)) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Where to go after a valid submit: straight to /ads/start when signed in, else through sign-up (which resumes it). */
export function startHref(url: string, goal: AdGoalValue, signedIn: boolean): string {
  const qs = new URLSearchParams({ url: url.trim(), goal }).toString();
  return signedIn ? `/ads/start?${qs}` : `/ads/signup?next=${encodeURIComponent(`/ads/start?${qs}`)}`;
}
