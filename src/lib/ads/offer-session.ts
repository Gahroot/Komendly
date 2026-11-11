"use client";
// Browser-side offer bookkeeping: download signal + per-session/per-run show caps (storage failures = treat as fresh).

export const AD_DOWNLOADED_EVENT = "kmd:ad-downloaded";

export function notifyAdDownloaded(runId: string | undefined): void {
  try {
    window.dispatchEvent(new CustomEvent(AD_DOWNLOADED_EVENT, { detail: { runId } }));
  } catch {
    // never block a download
  }
}

function read(store: "session" | "local", key: string): string | null {
  try {
    return (store === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(store: "session" | "local", key: string, value: string): void {
  try {
    (store === "session" ? window.sessionStorage : window.localStorage).setItem(key, value);
  } catch {
    // storage blocked
  }
}

/** True the first time `key` is seen in this tab session (used to send each placement's "shown" event once). */
export function firstInSession(key: string): boolean {
  const k = `kmd_offer:${key}`;
  if (read("session", k)) return false;
  write("session", k, "1");
  return true;
}

export function modalShownForRun(runId: string): boolean {
  return Boolean(read("local", `kmd_offer_modal:${runId}`));
}

export function modalShowsThisSession(): number {
  return Number(read("session", "kmd_offer_modal_count") ?? 0) || 0;
}

export function recordModalShown(runId: string): void {
  write("local", `kmd_offer_modal:${runId}`, "1");
  write("session", "kmd_offer_modal_count", String(modalShowsThisSession() + 1));
}

export function dismissedInSession(key: string): boolean {
  return Boolean(read("session", `kmd_offer_dismissed:${key}`));
}

export function dismissInSession(key: string): void {
  write("session", `kmd_offer_dismissed:${key}`, "1");
}

const noopSubscribe = () => () => undefined;
export { noopSubscribe };
