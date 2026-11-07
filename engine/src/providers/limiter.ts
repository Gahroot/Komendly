// Concurrency + rate limiter shared by every call to one provider, so a burst of
// jobs can't trip the ChatGPT subscription's caps.
import { sleep } from "../util/sleep";

export interface LimiterOptions {
  maxConcurrent: number;
  /** Max calls started per window. */
  maxPerWindow: number;
  windowMs: number;
  now?: () => number;
}

export class Limiter {
  private active = 0;
  private starts: number[] = [];
  private waiters: Array<() => void> = [];
  /** Set when the provider reports a usage limit; calls wait until then. */
  private pausedUntil = 0;
  private readonly now: () => number;

  constructor(private readonly o: LimiterOptions) {
    this.now = o.now ?? Date.now;
  }

  pauseUntil(ts: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, ts);
  }

  get pausedUntilTs(): number {
    return this.pausedUntil;
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }

  private async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const t = this.now();
      this.starts = this.starts.filter((s) => s > t - this.o.windowMs);
      if (t < this.pausedUntil) {
        await sleep(Math.min(this.pausedUntil - t, 60_000), signal);
        continue;
      }
      if (this.active < this.o.maxConcurrent && this.starts.length < this.o.maxPerWindow) {
        this.active++;
        this.starts.push(t);
        return;
      }
      if (this.active >= this.o.maxConcurrent) {
        await new Promise<void>((r) => this.waiters.push(r));
      } else {
        const oldest = this.starts[0] ?? t;
        await sleep(Math.max(10, oldest + this.o.windowMs - t), signal);
      }
    }
  }
}
