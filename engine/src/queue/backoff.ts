/** Exponential backoff for job retries: base * 2^(attempt-1), capped, ±20% jitter. */
export function retryDelayMs(attempt: number, opts: { baseMs?: number; capMs?: number; random?: () => number } = {}): number {
  const base = opts.baseMs ?? 10_000;
  const cap = opts.capMs ?? 15 * 60_000;
  const rnd = opts.random ?? Math.random;
  const raw = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(raw * (0.8 + rnd() * 0.4));
}
