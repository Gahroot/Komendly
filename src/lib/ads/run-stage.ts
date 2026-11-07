// Honest run stage derived only from real run state (no timers, no invented percentages).
import type { RunView } from "./run-types";

export type RunStage = "reading" | "review" | "building" | "done" | "partial" | "failed";

export interface RunStageInfo {
  stage: RunStage;
  /** Index into STAGE_RAIL (0..3). */
  rail: number;
  ready: number;
  /** Ads this run will produce (staticCount + motionCount). */
  total: number;
  failed: number;
}

export const STAGE_RAIL = ["Read", "Review", "Build", "Ready"] as const;

export function runStage(run: Pick<RunView, "status" | "ads" | "extraction"> & Partial<Pick<RunView, "staticCount" | "motionCount">>): RunStageInfo {
  const ready = run.ads.filter((a) => a.status === "ready").length;
  const failed = run.ads.filter((a) => a.status === "failed" || a.status === "failed_qc").length;
  // Same total the gallery shows: the ads this run was asked for (falls back to planned ads).
  const total = run.staticCount !== undefined ? run.staticCount + (run.motionCount ?? 0) : run.ads.length;
  const base = { ready, total, failed };
  switch (run.status) {
    case "extracting":
      return { stage: "reading", rail: 0, ...base };
    case "awaiting_confirm":
      return run.extraction ? { stage: "review", rail: 1, ...base } : { stage: "reading", rail: 0, ...base };
    case "queued":
    case "generating":
      return { stage: "building", rail: 2, ...base };
    case "completed":
      return { stage: "done", rail: 3, ...base };
    case "partial":
      return { stage: "partial", rail: 3, ...base };
    default:
      // The step it failed on: building if any ads exist, review if Ozzy had notes, else reading.
      return { stage: "failed", rail: run.ads.length > 0 ? 2 : run.extraction ? 1 : 0, ...base };
  }
}
