"use client";

import useSWR from "swr";
import { adsFetcher } from "@/lib/ads/run-client";
import type { RunSummary } from "@/lib/ads/run-types";

export function useAdRuns() {
  return useSWR<{ runs: RunSummary[] }>("/api/ads/runs", adsFetcher, {
    refreshInterval: (data) => (data?.runs.some((r) => !["completed", "partial", "failed", "canceled"].includes(r.status)) ? 4000 : 0),
  });
}
