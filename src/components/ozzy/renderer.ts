import { Blinker, cellHash, EarTwitch, mulberry32, Spring } from "./anim";
import { compose, emptyGrid, G, KEYS, OX, OY } from "./compose";
import { computePose, jumpHeight } from "./pose";
import type { OzzyState } from "./types";
import { paintGlow, paintVoxels } from "./voxel";
import { SDF_FORMS, sdfFrame } from "./sdf/frame";

const warned = new Set<string>();
/** Never throw from rAF: a broken form falls back to classic (logged once per form in dev). */
const RASTER_FPS = 12;

function safeSdfFrame(s: OzzyState, t: number, blink: boolean, still: boolean): ReturnType<typeof sdfFrame> {
  try {
    return sdfFrame(s, t, blink, still);
  } catch (err) {
    if (process.env.NODE_ENV !== "production" && !warned.has(s.form)) {
      warned.add(s.form);
      console.error(`[ozzy] SDF form "${s.form}" failed, falling back to classic`, err);
    }
    return sdfFrame({ ...s, form: "classic" }, t, blink, still);
  }
}

export interface RendererOptions {
  reducedMotion: boolean;
  perch: "ground" | "ledge";
  seed?: number;
  now?: () => number;
}

const DISSOLVE = 0.35;
const FOOT_Y = 36 + OY;
const IDX_M = KEYS.indexOf("m") + 1;
const IDX_E = KEYS.indexOf("e") + 1;
const IDX_G = KEYS.indexOf("g") + 1;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export class OzzyRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private n = 2;
  private readonly sprite: HTMLCanvasElement;
  private readonly prev: HTMLCanvasElement;
  private readonly glow = makeCanvas(G, G);
  private readonly sdfArt = makeCanvas(64, 64);
  private readonly sdfGlow = makeCanvas(64, 64);
  private grid = emptyGrid();
  private prevGrid = emptyGrid();
  private readonly spring = new Spring(170, 8);
  private readonly rnd: () => number;
  private readonly blinker: Blinker;
  private readonly ears: EarTwitch;
  private readonly now: () => number;
  private readonly phase: number;
  private state: OzzyState | null = null;
  private motionStart = 0;
  private dissolveStart = -10;
  private look: { x: number; y: number } | null = null;
  private raf = 0;
  private last = 0;
  private active = true;
  private wasAirborne = false;
  /** Pixel art animates "on twos": re-rasterize at most RASTER_FPS unless the look changes. */
  private rasterT = -1;
  private rasterKey = "";
  private readonly size: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    cssSize: number,
    private opts: RendererOptions,
  ) {
    this.size = cssSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Ozzy: 2D canvas unavailable");
    this.ctx = ctx;
    this.now = opts.now ?? (() => performance.now() / 1000);
    this.rnd = mulberry32(opts.seed ?? 7);
    this.phase = this.rnd() * Math.PI * 2;
    const t = this.now();
    this.blinker = new Blinker(this.rnd, t);
    this.ears = new EarTwitch(this.rnd, t);
    this.sprite = makeCanvas(1, 1);
    this.prev = makeCanvas(1, 1);
    this.resize(cssSize);
  }

  resize(cssSize: number): void {
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    this.n = Math.max(2, Math.round((cssSize * dpr) / G));
    const px = this.n * G;
    for (const c of [this.canvas, this.sprite, this.prev]) {
      c.width = px;
      c.height = px;
    }
    this.kickFrame();
  }

  setOptions(opts: Partial<RendererOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.kickFrame();
  }

  setState(s: OzzyState): void {
    const t = this.now();
    const old = this.state;
    if (old && old.form !== s.form) {
      this.prevGrid.set(this.grid);
      this.prev.getContext("2d")?.drawImage(this.sprite, 0, 0);
      this.dissolveStart = t;
    }
    if (!old || old.beat !== s.beat) {
      this.motionStart = t;
      if (!this.opts.reducedMotion) this.spring.kick(s.motion === "hop" || s.motion === "summon" ? -2.2 : 1.1);
    }
    this.state = s;
    this.kickFrame();
  }

  /** Pointer offset from the canvas centre in css px, or null when far away. */
  setLook(look: { x: number; y: number } | null): void {
    const prev = this.look;
    this.look = look;
    if ((prev === null) !== (look === null) || (look && prev && Math.abs(look.x - prev.x) > 20)) this.kickFrame();
  }

  setActive(on: boolean): void {
    this.active = on;
    if (on) this.kickFrame();
    else cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
  }

  private kickFrame(): void {
    if (!this.active || typeof window === "undefined") return;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.tick(true));
  }

  private busy(t: number): boolean {
    const s = this.state;
    if (!s) return false;
    const mt = t - this.motionStart;
    return t - this.dissolveStart < DISSOLVE || !this.spring.settled || (s.motion !== "idle" && s.motion !== "sleep") || (!!s.line && mt < 2);
  }

  private tick(force = false): void {
    if (!this.active) return;
    const t = this.now();
    const still = this.opts.reducedMotion;
    const fps = this.busy(t) ? 30 : 10;
    if (force || t - this.last >= 1 / fps - 0.004) {
      const dt = Math.min(1 / 30, Math.max(0, t - this.last));
      this.last = t;
      this.draw(t, dt);
    }
    if (still && t - this.dissolveStart > 0.2) return; // still pose: no loop
    this.raf = requestAnimationFrame(() => this.tick());
  }

  private draw(t: number, dt: number): void {
    const s = this.state;
    if (!s) return;
    const still = this.opts.reducedMotion;
    const n = this.n;
    const mt = t - this.motionStart;
    const useSdf = SDF_FORMS.has(s.form);
    const dp = (t - this.dissolveStart) / DISSOLVE;
    const dissolving = !still && dp >= 0 && dp < 1;
    if (!useSdf) {
      const pose = computePose({
        state: s,
        t,
        motionT: mt,
        phase: this.phase,
        blink: this.blinker.closed(t),
        ears: this.ears.offsets(t),
        look: this.look,
        still,
      });
      compose(pose, this.grid);
      const out = dissolving ? this.dissolve(dp) : this.grid;

      const sctx = this.sprite.getContext("2d");
      const gctx = this.glow.getContext("2d");
      if (!sctx || !gctx) return;
      paintVoxels(sctx, out, n);
      const orb = 0.45 + s.orb * 0.7 + Math.sin(t * 3) * 0.08;
      paintGlow(gctx, out, (i) => (i === IDX_M ? orb : i === IDX_E ? 0.7 : 1));
    }
    const blink = this.blinker.closed(t);
    const key = `${s.form}|${s.expression}|${s.motion}|${blink}|${s.orb.toFixed(2)}`;
    // Small decorative Ozzys animate slower; big ones at pixel-art pace (busy 12fps, idle 6fps).
    const rasterFps = (this.busy(t) ? RASTER_FPS : RASTER_FPS / 2) * (this.size <= 100 ? 0.5 : 1);
    if (useSdf && (key !== this.rasterKey || t - this.rasterT >= 1 / rasterFps || this.rasterT < 0)) {
      this.rasterKey = key;
      this.rasterT = t;
      const f = safeSdfFrame(s, t, blink, still);
      this.sdfArt.getContext("2d")?.putImageData(new ImageData(f.rgba, f.size, f.size), 0, 0);
      this.sdfGlow.getContext("2d")?.putImageData(new ImageData(f.glow, f.size, f.size), 0, 0);
    }
    const art = useSdf ? this.sdfArt : this.sprite;
    const glowArt = useSdf ? this.sdfGlow : this.glow;

    // Spring squash/stretch; land kick when coming down from a hop.
    const air = still ? 0 : jumpHeight(s.motion, mt);
    if (this.wasAirborne && air === 0) this.spring.kick(2.4);
    this.wasAirborne = air > 0;
    const sq = still ? 0 : Math.max(-0.25, Math.min(0.25, this.spring.step(dt)));
    const px = n * G;
    const dw = Math.round(px * (1 + sq * 0.6));
    const dh = Math.round(px * (1 - sq));
    const footPx = FOOT_Y * n;
    const dx = Math.round((px - dw) / 2);
    const dy = Math.round(footPx - footPx * (dh / px));

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, px, px);
    this.drawShadow(ctx, s.form === "chill", air);
    if (still && t - this.dissolveStart < 0.2) {
      ctx.globalAlpha = Math.max(0, 1 - (t - this.dissolveStart) / 0.2);
      ctx.drawImage(this.prev, 0, 0);
      ctx.globalAlpha = 1 - ctx.globalAlpha;
    }
    ctx.drawImage(art, dx, dy, dw, dh);
    ctx.globalAlpha = 1;

    // Cheap bloom: low-res glow copy, smoothed, added on top.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.35;
    ctx.drawImage(glowArt, dx, dy, dw, dh);
    ctx.globalAlpha = 0.2;
    const g = n * 2;
    ctx.drawImage(glowArt, dx - g, dy - g, dw + g * 2, dh + g * 2);
    ctx.restore();
  }

  private drawShadow(ctx: CanvasRenderingContext2D, wide: boolean, air: number): void {
    const n = this.n;
    const ledge = this.opts.perch === "ledge";
    const w = (wide ? 15 : ledge ? 9 : 11) * n * (1 - air * 0.07);
    ctx.save();
    ctx.fillStyle = `rgba(8,4,24,${ledge ? 0.55 : 0.4})`;
    ctx.beginPath();
    ctx.ellipse(Math.round((20 + OX) * n), Math.round((FOOT_Y + 0.6) * n), w, n * (ledge ? 1.1 : 1.6), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Pixel-sparkle dissolve from the previous form's grid into the new one. */
  private dissolve(p: number): Uint8Array {
    const out = new Uint8Array(this.grid.length);
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        const h = cellHash(x, y);
        const a = this.prevGrid[i] ?? 0;
        const b = this.grid[i] ?? 0;
        out[i] = h < p ? b : a;
        if (Math.abs(h - p) < 0.06 && (a || b)) out[i] = h > p ? IDX_E : IDX_G;
      }
    }
    return out;
  }
}
