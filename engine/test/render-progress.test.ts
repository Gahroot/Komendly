import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cpuQuota, parseHfProgress, renderWorkers } from "../src/modules/ezmotion/runtime";
import { studioBrief } from "../src/studio/brief";
import { progressThrottle, studioBrowserPath } from "../src/studio/turn";
import type { StudioEventRow } from "../src/studio/events";

const lines = readFileSync(join(__dirname, "fixtures", "hf-render-progress.txt"), "utf8").split("\n").filter(Boolean);

describe("hf render progress parser (real captured output)", () => {
  it("parses every captured progress line, monotonic", () => {
    const parsed = lines.map(parseHfProgress);
    expect(parsed.every(Boolean)).toBe(true);
    expect(parsed[0]).toEqual({ pct: 5, stage: "Compiling composition" });
    expect(parsed.find((p) => p?.frame === 101)).toMatchObject({ pct: 50, total: 180 });
    expect(parsed.some((p) => p?.pct === 100)).toBe(true);
  });
  it("handles raw ANSI redraws and streaming lines", () => {
    expect(parseHfProgress("\x1b[1G\x1b[J  ████░░  80%  Streaming frame 180/180 (6 workers)")).toMatchObject({ pct: 80, frame: 180, total: 180 });
    expect(parseHfProgress("[INFO] Calibration complete")).toBeNull();
  });
});

describe("render workers", () => {
  it("reads cgroup quota and divides by concurrency", () => {
    expect(cpuQuota("2400000 100000\n", 48)).toBe(24);
    expect(cpuQuota("max 100000", 10)).toBe(10);
    expect(renderWorkers({}, 24)).toBe(6);
    expect(renderWorkers({ HF_RENDER_CONCURRENCY: "8" }, 24)).toBe(3);
    expect(renderWorkers({}, 4)).toBe(2);
    expect(renderWorkers({ HF_RENDER_WORKERS: "9" }, 24)).toBe(9);
  });
});

describe("studio render progress events", () => {
  it("throttles to ~1s with an ETA from frame rate", () => {
    const rows: StudioEventRow[] = [];
    let t = 0;
    const p = progressThrottle((r) => rows.push(...r), "Rendering your video", () => t);
    p.emit({ pct: 0, stage: "start" }, true);
    for (let f = 1; f <= 180; f++) { t += 50; p.emit({ pct: 25 + (f / 180) * 75, stage: "Capturing", frame: f, total: 180 }); }
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThanOrEqual(11);
    expect(rows.every((r) => r.type === "progress")).toBe(true);
    const mid = rows[3]?.data as { etaSec?: number; label: string };
    expect(mid.label).toBe("Rendering your video");
    expect(mid.etaSec).toBeGreaterThan(0);
  });
  it("gives the agent the engine's browser", () => {
    expect(studioBrowserPath({ PRODUCER_HEADLESS_SHELL_PATH: "/opt/x" }, true)).toBe("/opt/x");
    expect(studioBrowserPath({}, true)).toBe("/opt/headless-shell");
    expect(studioBrowserPath({}, false)).toBeNull();
  });
  it("brief forbids the agent's final render", () => {
    const b = studioBrief({ brand: null, uploads: [], paid: false });
    expect(b).toMatch(/NEVER run `hf render`/);
    expect(b).not.toMatch(/Use plain `hf render`/);
  });
});
