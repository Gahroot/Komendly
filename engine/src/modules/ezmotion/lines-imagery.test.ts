import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { balanceLines, pickStructure, sceneTimes, splitBalanced } from "./composition";
import { heroCrop, vetProductAsset } from "./imagery";
import { splitLines } from "./plan";

describe("balanceLines", () => {
  it("never leaves a single-word orphan", () => {
    const out = splitBalanced("Another \u201cwhere's my document?\u201d email.", 4);
    expect(out.at(-1)?.split(" ").length).toBeGreaterThan(1);
  });
  it("never ends a line on a short glue word", () => {
    for (const t of ["Every click shouldn't mean another keyframe.", "Stop re-keying the same data into your CRM", "Sleep through the night without waking at 3am"]) {
      for (const l of splitBalanced(t, 3).slice(0, -1)) expect(l.split(" ").at(-1)).not.toMatch(/^(a|the|to|of|your|my|and|in|at)$/i);
    }
  });
  it("keeps every word in order and balances lengths", () => {
    const t = "Our team spends hours re-keying the same data.";
    const out = balanceLines(t, 3);
    expect(out.join(" ")).toBe(t);
    const lens = out.map((l) => l.length);
    expect(Math.max(...lens) - Math.min(...lens)).toBeLessThan(10);
  });
  it("never breaks after a number", () => {
    for (const l of balanceLines("I'm awake at 3 a.m. again.", 2)) expect(l).not.toMatch(/\d$/);
  });
  it("handles fewer words than lines", () => {
    expect(splitLines("Hi there", 4, 2)).toEqual(["Hi", "there"]);
    expect(balanceLines("Hello", 3)).toEqual(["Hello"]);
  });
});

describe("pickStructure", () => {
  const ui = { hasFace: false };
  it("varies with angle and awareness", () => {
    const got = new Set([
      pickStructure({ angle: "pain", awareness: "problem_aware", hook: "Didn't we already send that PDF to you?" }, ui),
      pickStructure({ angle: "feature demo", awareness: "solution_aware", hook: "x" }, ui),
      pickStructure({ angle: "ladder", awareness: "problem_aware", hook: "I want the lights. Not the ladder." }, { hasFace: true }),
      pickStructure({ angle: "moment", awareness: "unaware", hook: "x" }, ui),
      pickStructure({ angle: "offer", awareness: "most_aware", hook: "x" }, ui),
      pickStructure({ angle: "switch", awareness: "problem_aware", hook: "typing it in again?" }, ui),
    ]);
    expect(got.size).toBeGreaterThanOrEqual(4);
  });
  it("orders scenes inside the duration", () => {
    for (const s of ["story", "walkthrough", "kinetic", "hero", "beforeafter"] as const) {
      const t = sceneTimes(14, s);
      expect(t.end.start).toBeLessThan(14);
      expect(t.hook.start).toBe(0);
    }
  });
});

describe("image checks", () => {
  it("crops to the hero visual, falls back to the first screen", () => {
    expect(heroCrop(null, 5000)).toEqual({ x: 0, y: 0, width: 1440, height: 1000 });
    const c = heroCrop({ x: 600, y: 300, width: 700, height: 500 }, 5000);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(1440);
    expect(c.y).toBe(240);
  });
  it("rejects flat textures and small screenshots, keeps a real photo", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ezm-"));
    try {
      const flat = join(dir, "flat.png");
      await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#e8e8e8" } }).png().toFile(flat);
      const noisy = join(dir, "photo.png");
      const circles = Array.from({ length: 40 }, (_, k) => `<circle cx="${(k * 397) % 1600}" cy="${(k * 263) % 1200}" r="${60 + (k % 7) * 25}" fill="hsl(${k * 37},55%,${35 + (k % 5) * 8}%)" opacity=".7"/>`).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><defs><linearGradient id="g"><stop offset="0" stop-color="#2a5d3c"/><stop offset="1" stop-color="#c9a36b"/></linearGradient></defs><rect width="1600" height="1200" fill="#2a5d3c"/>${circles}</svg>`;
      await sharp(Buffer.from(svg)).blur(8).png().toFile(noisy);
      const tiny = join(dir, "tiny.png");
      await sharp(noisy).resize(600, 450).toFile(tiny);
      const base = { sourceUrl: "https://x.io/p.png", hasFace: false };
      expect(await vetProductAsset([{ ...base, key: "flat", kind: "photo", width: 1600, height: 1000, path: flat }])).toBeNull();
      expect(await vetProductAsset([{ ...base, key: "tiny", kind: "screenshot", width: 600, height: 450, path: tiny }])).toBeNull();
      const ok = await vetProductAsset([{ ...base, key: "flat", kind: "photo", width: 1600, height: 1000, path: flat }, { ...base, key: "photo", kind: "photo", width: 1600, height: 1200, path: noisy }]);
      expect(ok?.asset.key).toBe("photo");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("biggestLines", () => {
  it("splits a short hook into more lines when that makes it bigger, keeping every word", async () => {
    const { biggestLines } = await import("./composition");
    const t = "I checked the time. Of course it's 3 a.m.";
    const one = Math.min(888 / (t.length * 0.56), 1100 / 1.06);
    const r = biggestLines(t, 888, 1100, 6);
    expect(r.lines.join(" ")).toBe(t);
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.size).toBeGreaterThan(one * 1.5);
    for (const l of r.lines) expect(l).not.toMatch(/\d$/);
  });
});

describe("lowValueMargins", () => {
  it("allows a deeper push only for wallpaper/empty margins, never for page content at the edges", async () => {
    const { lowValueMargins } = await import("./imagery");
    const dir = await mkdtemp(join(tmpdir(), "lvm-"));
    try {
      const ui = `<rect x="200" y="120" width="800" height="560" fill="#202226"/>${Array.from({ length: 12 }, (_, k) => `<rect x="240" y="${160 + k * 40}" width="${300 + (k % 4) * 100}" height="14" fill="#9a9ca3"/>`).join("")}`;
      const wall = join(dir, "wall.png");
      await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g"><stop offset="0" stop-color="#c2451c"/><stop offset="1" stop-color="#6a2a8c"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/>${ui}</svg>`)).png().toFile(wall);
      const page = join(dir, "page.png");
      const rows = Array.from({ length: 30 }, (_, k) => `<rect x="10" y="${10 + k * 26}" width="${600 + (k % 5) * 110}" height="12" fill="#2c3e50"/>`).join("");
      await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#f4f1ea"/>${rows}</svg>`)).png().toFile(page);
      expect(await lowValueMargins(wall)).toBe(true);
      expect(await lowValueMargins(page)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
