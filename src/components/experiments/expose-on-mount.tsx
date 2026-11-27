"use client";

import { useEffect } from "react";

/** Records the exposure for a variant the server already chose (SSR surfaces). Fire-and-forget. */
export function ExposeOnMount({ experimentKey }: { experimentKey: string }) {
  useEffect(() => {
    void fetch("/api/experiments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "exposure", key: experimentKey }), keepalive: true }).catch(() => undefined);
  }, [experimentKey]);
  return null;
}
