"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/analytics/track";
import type { RunView } from "@/lib/ads/run-types";

/** Server-side Meta CAPI TrialCompleted (the engine can't send it), once per run per browser. */
function pingOnce(key: string, url: string): void {
  try {
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
  } catch {
    // storage blocked: still ping (Meta dedupes on event_id)
  }
  void fetch(url, { method: "POST" }).catch(() => undefined);
}

/** Funnel milestones derived from real run state (each fires once per run per browser). */
export function useRunFunnelTracking(run: RunView) {
  const ready = run.ads.filter((a) => a.status === "ready").length;
  const total = run.ads.length;
  useEffect(() => {
    const base = { run_id: run.id, is_trial: run.isTrial };
    if (run.status === "awaiting_confirm" && run.extraction) trackOnce(`review:${run.id}`, "extraction_review_shown", base);
    if (ready > 0) trackOnce(`first_ad:${run.id}`, "first_ad_ready", base);
    if (run.status === "completed" || run.status === "partial") {
      trackOnce(`done:${run.id}`, "run_completed", { ...base, ready, total, partial: run.status === "partial" });
      if (run.isTrial) pingOnce(`meta_done:${run.id}`, `/api/ads/runs/${run.id}/trial-completed`);
    }
    if (run.status === "failed" || run.status === "canceled") trackOnce(`failed:${run.id}`, "run_failed", { ...base, status: run.status, ready });
  }, [run.id, run.isTrial, run.status, run.extraction, ready, total]);
}
