"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { GoogleApiError, googleApi, type GoogleStatus } from "@/lib/ads/google/client-api";
import { JOB_POLL_MS, jobBusy } from "./logic";

/** One shared status per run, so the dialog and the gallery panel never fetch twice or disagree. */
type Snap = { status: GoogleStatus | null; hidden: boolean; error: string | null };
type Store = { snap: Snap; subs: Set<() => void>; inflight: Promise<void> | null; timer: ReturnType<typeof setTimeout> | null };

const stores = new Map<string, Store>();
const EMPTY: Snap = { status: null, hidden: false, error: null };

function store(runId: string): Store {
  let s = stores.get(runId);
  if (!s) { s = { snap: EMPTY, subs: new Set(), inflight: null, timer: null }; stores.set(runId, s); }
  return s;
}

function set(s: Store, snap: Snap) {
  s.snap = snap;
  s.subs.forEach((f) => f());
}

export function refreshGoogleStatus(runId: string): Promise<void> {
  const s = store(runId);
  if (s.inflight) return s.inflight;
  s.inflight = googleApi.status(runId)
    .then((status) => {
      // Not rolled out to this workspace (or not built yet): show nothing at all.
      const hidden = !status.available && status.locked === "flag_off";
      set(s, { status, hidden, error: null });
    })
    .catch((e: unknown) => {
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 401 || e.status === 403)) set(s, { ...s.snap, hidden: true });
      else set(s, { ...s.snap, error: e instanceof GoogleApiError ? e.message : "We couldn't load your Google Ads details." });
    })
    .finally(() => {
      s.inflight = null;
      // Keep following a running job while anyone is watching.
      if (s.subs.size && jobBusy(s.snap.status) && !s.timer) {
        s.timer = setTimeout(() => { s.timer = null; void refreshGoogleStatus(runId); }, JOB_POLL_MS);
      }
    });
  return s.inflight;
}

export function useGoogleStatus(runId: string) {
  const s = store(runId);
  const subscribe = useCallback((f: () => void) => {
    s.subs.add(f);
    return () => { s.subs.delete(f); };
  }, [s]);
  const snap = useSyncExternalStore(subscribe, () => s.snap, () => EMPTY);
  useEffect(() => {
    if (!s.snap.status && !s.snap.hidden) void refreshGoogleStatus(runId);
  }, [runId, s]);
  const refresh = useCallback(() => refreshGoogleStatus(runId), [runId]);
  return { ...snap, refresh };
}
