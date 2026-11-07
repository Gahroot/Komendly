"use client";

import useSWR from "swr";
import { adsFetcher } from "@/lib/ads/run-client";
import type { BrandSummary } from "@/lib/ads/run-types";

export function useAdBrands() {
  return useSWR<{ brands: BrandSummary[] }>("/api/ads/brands", adsFetcher);
}
