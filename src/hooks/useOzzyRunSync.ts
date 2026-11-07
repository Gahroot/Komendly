"use client";

import { useEffect, useRef } from "react";
import { ozzy } from "@/components/ozzy/store";
import { runStage } from "@/lib/ads/run-stage";
import type { RunView } from "@/lib/ads/run-types";

/** Drives Ozzy from real run state only: stage changes and real ready/failed counts. */
export function useOzzyRunSync(run: RunView) {
  const info = runStage(run);
  const prev = useRef<{ stage: string; ready: number; failed: number } | null>(null);
  useEffect(() => {
    const p = prev.current;
    const first = p === null;
    prev.current = { stage: info.stage, ready: info.ready, failed: info.failed };
    if (first || p.stage !== info.stage) {
      if (info.stage === "reading") ozzy.emit({ type: "analysis:start" });
      else if (info.stage === "review") ozzy.emit({ type: "review:shown" });
      else if (info.stage === "building") {
        if (info.ready > 0) ozzy.emit({ type: "generation:ad-ready", ready: info.ready, total: info.total });
        else ozzy.emit({ type: "generation:start", total: info.total });
      } else if (info.stage === "done") ozzy.emit({ type: "generation:done" });
      else if (info.stage === "partial") ozzy.emit({ type: "run:partial" });
      else if (info.stage === "failed") ozzy.emit({ type: "error", kind: "generation" });
      return;
    }
    if (info.stage === "building") {
      if (info.ready > p.ready) ozzy.emit({ type: "generation:ad-ready", ready: info.ready, total: info.total });
      else if (info.failed > p.failed) ozzy.emit({ type: "generation:ad-failed" });
    }
  }, [info.stage, info.ready, info.failed, info.total]);
}
