"use client";

import useSWR from "swr";
import { adsFetcher } from "@/lib/ads/run-client";
import type { RunView } from "@/lib/ads/run-types";

const TERMINAL = new Set(["completed", "partial", "failed", "canceled"]);
const SETTLED = new Set<string>(["ready", "failed", "failed_qc"]);

/** Live run state: polls every 1.5s until the run settles, then every 5s while trial bonus ads are still coming. */
export function useAdRun(runId: string, fallbackData?: RunView) {
  return useSWR<RunView>(`/api/ads/runs/${runId}`, adsFetcher, {
    fallbackData,
    // A trial run completes as soon as its promised ads are ready; extra/motion ads can still land after (engine early-done).
    refreshInterval: (data) => (data && TERMINAL.has(data.status) ? (data.bonusPending || data.ads.some((a) => !SETTLED.has(a.status)) ? 5000 : 0) : 1500),
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
}
