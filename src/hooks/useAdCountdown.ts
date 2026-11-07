"use client";

import { useEffect, useState } from "react";

/** Seconds left until `deadline` (ISO), corrected for server clock skew; frozen while paused. */
export function useAdCountdown(deadline: string | null, serverNow: string | null, paused: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  const [skew] = useState(() => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0));
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [paused]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - (now + skew)) / 1000));
}
