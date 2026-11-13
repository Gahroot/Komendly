// Queue fairness. Claim order is an effective score, not raw priority, so that across concurrent runs:
// - a run's start work (extract, first plan) always goes first (START_BOOST);
// - QC always outranks renders (QC_BOOST): it is short and gates readiness. Boosting renders
//   "while no ad is ready" starved QC (ads only become ready after QC), so that rule is gone;
// - a run's first-ad pipeline is boosted (FIRST_AD_BOOST): its first render (no ad of the run past
//   planning, none rendering), then QC of a run with no ready ad, ahead of other QC;
// - every waiting job ages (+1 per AGE_STEP_SEC, capped) so nothing starves.
// Raw priorities differ in scale between the web app (0/10) and the engine (0..150), which is why
// start work is boosted by type here rather than trusted to its enqueued priority.
// A reserved slot lane (startLaneLimits) keeps capacity for start work when renders fill a worker.

export const START_BOOST = 10_000;
export const FIRST_AD_BOOST = 1_000;
export const QC_BOOST = 2_000;
export const AGE_STEP_SEC = 6; // +10 per minute waiting
export const AGE_CAP = 300;

export interface FairnessTypes {
  /** Job types that start a run (extract, the run's first plan). Replacement plans are excluded. */
  start: readonly string[];
  /** Ad render job types eligible for the first-ad boost. */
  render: readonly string[];
  /** QC job types: always outrank renders. */
  qc: readonly string[];
}

export const DEFAULT_FAIRNESS: FairnessTypes = { start: ["extract", "plan"], render: ["render_static", "render_motion"], qc: ["qc"] };

/**
 * Split free slots between start work and everything else. `reserved` slots are only ever used by
 * start work; start work may also use general slots.
 */
export function startLaneLimits(concurrency: number, reserved: number, activeStart: number, activeOther: number): { start: number; other: number } {
  const free = Math.max(0, concurrency - activeStart - activeOther);
  const r = Math.min(Math.max(0, reserved), Math.max(0, concurrency - 1)); // always leave >= 1 general slot
  const otherCap = Math.max(0, concurrency - r - activeOther);
  return { start: free, other: Math.min(free, otherCap) };
}

/**
 * Per-type caps (e.g. render_motion: each one runs its own Chrome + ffmpeg; too many at once exhausts the box's
 * processes/threads, so every render crawls and some fail). Pure: which types may be claimed now, and which of a
 * claimed batch must go back to the queue because the batch overshot a cap.
 */
export function cappedTypes(types: readonly string[], active: readonly string[], caps: Readonly<Record<string, number>>): string[] {
  return types.filter((t) => {
    const cap = caps[t];
    return cap === undefined || active.filter((a) => a === t).length < cap;
  });
}

export function overCap<T extends { type: string }>(claimed: readonly T[], active: readonly string[], caps: Readonly<Record<string, number>>): T[] {
  const left: Record<string, number> = {};
  for (const [t, cap] of Object.entries(caps)) left[t] = Math.max(0, cap - active.filter((a) => a === t).length);
  const extra: T[] = [];
  for (const j of claimed) {
    const n = left[j.type];
    if (n === undefined) continue;
    if (n > 0) left[j.type] = n - 1;
    else extra.push(j);
  }
  return extra;
}
