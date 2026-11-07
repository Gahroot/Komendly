/** Small deterministic animation helpers (seeded, no globals). */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-cell hash in [0, 1) for the dissolve. */
export function cellHash(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
}

export class Spring {
  x = 0;
  v = 0;
  constructor(
    private readonly k = 170,
    private readonly c = 8,
  ) {}
  kick(v: number): void {
    this.v += v;
  }
  step(dt: number): number {
    const a = -this.k * this.x - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  get settled(): boolean {
    return Math.abs(this.x) < 0.002 && Math.abs(this.v) < 0.02;
  }
}

/** Irregular blinks every 2–5.5s, 25% of them double. */
export class Blinker {
  private next: number;
  private second = -1;
  constructor(
    private readonly rnd: () => number,
    t0: number,
  ) {
    this.next = t0 + 1 + rnd() * 3;
  }
  closed(t: number): boolean {
    const D = 0.13;
    if (t >= this.next + D) {
      this.second = this.rnd() < 0.25 ? this.next + 0.26 : -1;
      this.next = t + 2 + this.rnd() * 3.5;
    }
    const inFirst = t >= this.next && t < this.next + D;
    const inSecond = this.second > 0 && t >= this.second && t < this.second + D;
    return inFirst || inSecond;
  }
}

/** Occasional single ear twitch: returns [left, right] dy in cells. */
export class EarTwitch {
  private at: number;
  private side = 0;
  constructor(
    private readonly rnd: () => number,
    t0: number,
  ) {
    this.at = t0 + 3 + rnd() * 4;
  }
  offsets(t: number): [number, number] {
    if (t > this.at + 0.18) {
      this.at = t + 3 + this.rnd() * 5;
      this.side = this.rnd() < 0.5 ? 0 : 1;
    }
    if (t < this.at) return [0, 0];
    return this.side === 0 ? [-1, 0] : [0, -1];
  }
}
