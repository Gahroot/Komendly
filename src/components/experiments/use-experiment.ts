"use client";

import { useEffect, useState } from "react";

export interface ClientVariant { variantId: string; payload: Record<string, string> | null }
type State = { ready: boolean; variant: ClientVariant | null };
const cache = new Map<string, Promise<ClientVariant | null>>();

function fetchVariant(key: string): Promise<ClientVariant | null> {
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/experiments?keys=${encodeURIComponent(key)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { variants?: Record<string, ClientVariant> } | null) => j?.variants?.[key] ?? null)
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/**
 * Variant for an offer experiment key. `ready` flips true once the server answered (or failed): render nothing
 * experiment-dependent before that, so copy never flips under the user. The control (null variant) = today's copy.
 * Exposure is recorded once when `expose` is true and a non-null variant was served.
 */
export function useExperiment(key: string, expose = true): State {
  const [s, setS] = useState<State>({ ready: false, variant: null });
  useEffect(() => {
    let live = true;
    void fetchVariant(key).then((v) => {
      if (!live) return;
      setS({ ready: true, variant: v });
      if (v && expose) void fetch("/api/experiments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "exposure", key }), keepalive: true }).catch(() => undefined);
    });
    return () => { live = false; };
  }, [key, expose]);
  return s;
}

/** Count a click-type conversion (server maps the event to every running experiment whose metric it is). */
export function convertOffer(event: "offer_clicked"): void {
  void fetch("/api/experiments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "conversion", event }), keepalive: true }).catch(() => undefined);
}
