"use client";

import { useEffect } from "react";

/** Ensures the first-party device cookie exists (used for fair free-trial limits). */
export function DeviceCookie() {
  useEffect(() => {
    void fetch("/api/ads/device", { method: "POST" }).catch(() => undefined);
  }, []);
  return null;
}
