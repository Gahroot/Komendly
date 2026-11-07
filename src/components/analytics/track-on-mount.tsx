"use client";

import { useEffect } from "react";
import type { FunnelEvent } from "@/lib/analytics/funnel-events";
import { track, trackOnce } from "@/lib/analytics/track";

type Params = Record<string, string | number | boolean | undefined>;

/** Fires one analytics event when mounted (optionally once per `onceKey` per browser). */
export function TrackOnMount({ event, params, onceKey }: { event: FunnelEvent; params?: Params; onceKey?: string }) {
  const serialized = JSON.stringify(params ?? {});
  useEffect(() => {
    const p = JSON.parse(serialized) as Params;
    if (onceKey) trackOnce(onceKey, event, p);
    else track(event, p);
  }, [event, serialized, onceKey]);
  return null;
}
