"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the server page every `ms` (used while an engine job is still running). */
export function AutoRefresh({ ms = 4000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
