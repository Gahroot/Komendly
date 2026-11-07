"use client";

import useSWR from "swr";
import { adsFetcher } from "@/lib/ads/run-client";
import type { WorkspaceView } from "@/lib/ads/run-types";

export function useAdsWorkspace() {
  return useSWR<WorkspaceView>("/api/ads/me", adsFetcher);
}
