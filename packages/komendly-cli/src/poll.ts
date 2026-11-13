import { ApiError } from "./client.js";

export interface PollOptions {
  /** First delay between checks (ms). */
  intervalMs?: number;
  maxIntervalMs?: number;
  factor?: number;
  /** Give up after this long (ms) and return the last value with timedOut=true. */
  timeoutMs?: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onTick?: (value: unknown, attempt: number) => void;
  /** Consecutive transient failures (network, 5xx, 429) tolerated before giving up. */
  maxTransientErrors?: number;
}

export function isTransient(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500);
}

/** Poll `check` until `done(value)`, backing off (interval * factor, capped). Transient errors are retried. */
export async function pollUntil<T>(check: () => Promise<T>, done: (value: T) => boolean, opts: PollOptions): Promise<{ value: T; timedOut: boolean }> {
  const factor = opts.factor ?? 1.5;
  const maxInterval = opts.maxIntervalMs ?? 15_000;
  const maxErrors = opts.maxTransientErrors ?? 5;
  const deadline = opts.now() + (opts.timeoutMs ?? 30 * 60_000);
  let delay = opts.intervalMs ?? 2_000;
  let errors = 0;
  let attempt = 0;
  let last: T | undefined;
  let has = false;
  for (;;) {
    attempt += 1;
    try {
      last = await check();
      has = true;
      errors = 0;
      opts.onTick?.(last, attempt);
      if (done(last)) return { value: last, timedOut: false };
    } catch (error) {
      if (!isTransient(error)) throw error;
      errors += 1;
      if (errors > maxErrors) throw error;
    }
    if (opts.now() + delay > deadline) {
      if (has) return { value: last as T, timedOut: true };
      throw new ApiError("Timed out waiting for Komendly.", 0, "timeout");
    }
    await opts.sleep(delay);
    delay = Math.min(maxInterval, Math.round(delay * factor));
  }
}
