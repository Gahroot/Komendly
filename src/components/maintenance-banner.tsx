"use client";

import { useEffect, useState } from "react";

const KEY = "kmd_ops_status";
const TTL_MS = 5 * 60_000;

/** Shows a slim banner while an incident has switched on the `ops_maintenance` flag. Checks at most once per 5 min per tab. */
export function MaintenanceBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    try {
      const cached = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { at: number; on: boolean } | null;
      if (cached && Date.now() - cached.at < TTL_MS) { setOn(cached.on); return; }
    } catch { /* ignore */ }
    fetch("/api/ops/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { maintenance?: boolean } | null) => {
        if (!d || cancelled) return;
        setOn(d.maintenance === true);
        try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), on: d.maintenance === true })); } catch { /* ignore */ }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  if (!on) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-amber-400 px-4 py-2 text-center text-sm font-medium text-black">
      We&apos;re fixing a problem right now. Some things may be slow or briefly unavailable. Your work is safe.
    </div>
  );
}
