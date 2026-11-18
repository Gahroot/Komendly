// Final-render retries for a Studio turn. Under load the box runs out of threads (pthread_create EAGAIN) and
// HyperFrames then reports it as "headless dependencies" missing; that clears once other renders finish, so
// those failures get a longer backoff than an ordinary hiccup.

export interface RenderTry { code: number; stdout: string; stderr: string }

/** Pure: the render failed because the machine was out of capacity (not a broken composition). */
export function isRenderOverload(r: RenderTry): boolean {
  const out = `${r.stderr}\n${r.stdout}`;
  return /Resource temporarily unavailable|pthread_create|EAGAIN|ENOMEM|EMFILE|Cannot allocate memory|Chrome could not (start|launch)|Failed to launch the browser|headless dependencies|hyperframes doctor|Failed to start BrowserThread|Target closed|browser has disconnected/i.test(out);
}

/** Waits before each retry: [ms, single Chrome worker?]. Overload waits up to ~3.5 min in total. */
export function renderRetryPlan(overload: boolean): Array<{ waitMs: number; workers1: boolean }> {
  return overload
    ? [{ waitMs: 15_000, workers1: false }, { waitMs: 45_000, workers1: true }, { waitMs: 90_000, workers1: true }, { waitMs: 60_000, workers1: true }]
    : [{ waitMs: 3_000, workers1: false }, { waitMs: 20_000, workers1: true }];
}

export async function renderWithRetries<R extends RenderTry>(
  render: (o: { attempt: number; workers1: boolean }) => Promise<R>,
  o: { signal: AbortSignal; sleep?: (ms: number) => Promise<void>; onRetry?: (attempt: number, r: R) => void },
): Promise<R> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  let rr = await render({ attempt: 0, workers1: false });
  if (rr.code === 0 || o.signal.aborted) return rr;
  const plan = renderRetryPlan(isRenderOverload(rr));
  for (const [i, step] of plan.entries()) {
    if (rr.code === 0 || o.signal.aborted) break;
    o.onRetry?.(i + 1, rr);
    await sleep(step.waitMs);
    if (o.signal.aborted) break;
    rr = await render({ attempt: i + 1, workers1: step.workers1 });
  }
  return rr;
}
