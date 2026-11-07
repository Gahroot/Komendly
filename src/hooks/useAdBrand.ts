"use client";

import useSWR from "swr";
import type { BrandDetail } from "@/lib/ads/brand-view";
import { adsFetcher } from "@/lib/ads/run-client";

export function useAdBrand(id: string) {
  return useSWR<BrandDetail>(`/api/ads/brands/${id}`, adsFetcher);
}
