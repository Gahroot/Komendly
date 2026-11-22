"use client";

import { useCallback, useEffect, useState } from "react";
import type { TeamStatus } from "@/lib/ads/team/rules";
import { TeamSetup } from "./team-setup";
import { TeamDashboard } from "./team-dashboard";

export async function teamFetch<T = unknown>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, error: (data as { error?: string }).error ?? "Something went wrong. Please try again.", data };
  } catch {
    return { ok: false, error: "Couldn't reach Komendly. Check your connection and try again.", data: {} };
  }
}

/** Opens the Meta connect popup (same flow as Publish to Meta); the callback page posts "komendly:meta" back. */
export function openMetaConnect() {
  window.open("/api/ads/meta/connect", "komendly-meta", "width=600,height=760");
}

export function TeamApp({ initial }: { initial: TeamStatus }) {
  const [status, setStatus] = useState(initial);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await teamFetch<TeamStatus>("/api/ads/team", { cache: "no-store" });
    if (r.ok) setStatus(r.data);
    setLoading(false);
  }, []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { type?: string })?.type === "komendly:meta") void refresh();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refresh]);
  // While the team is setting up or changing state, check back every 30s so new steps appear without a reload.
  const m = status.mandate;
  const off = m && (m.state === "paused" || m.state === "stopped");
  const settling = !!m && (m.state === "pending" || (m.status === "active" ? off : !off));
  useEffect(() => {
    if (!settling) return;
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [settling, refresh]);

  return status.mandate
    ? <TeamDashboard status={status} refresh={refresh} loading={loading} />
    : <TeamSetup status={status} refresh={refresh} loading={loading} />;
}
