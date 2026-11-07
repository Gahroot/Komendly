"use client";

import useSWR from "swr";
import { adsFetcher } from "@/lib/ads/run-client";
import type { RunView } from "@/lib/ads/run-types";

const TERMINAL = new Set(["completed", "partial", "failed", "canceled"]);

/** Live run state: polls every 1.5s until the run settles. */
export function useAdRun(runId: string, fallbackData?: RunView) {
  return useSWR<RunView>(`/api/ads/runs/${runId}`, adsFetcher, {
    fallbackData,
    refreshInterval: (data) => (data && TERMINAL.has(data.status) ? 0 : 1500),
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
}
