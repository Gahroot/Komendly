// Every background loop started by main.ts must go through safeStart, and a global unhandledRejection handler must exist,
// so one failing loop cannot crash-loop the engine (which also renders paid customers' ads).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(import.meta.dirname, "../src/main.ts"), "utf8");

describe("engine main.ts crash safety", () => {
  it("has an unhandledRejection handler that does not exit", () => {
    const m = /process\.on\("unhandledRejection",[^\n]*\n/.exec(src)?.[0] ?? "";
    expect(m).toContain("log(");
    expect(m).not.toContain("process.exit");
  });
  it("starts every loop through safeStart", () => {
    const raw = [...src.matchAll(/^\s*const \w+ = (start\w+)\(/gm)].map((m) => m[1]).filter((n) => n !== "startHttp");
    expect(raw).toEqual([]); // direct, unwrapped start*(...) calls
    const wrapped = [...src.matchAll(/safeStart\("(start\w+)"/g)].map((m) => m[1]);
    expect(wrapped.length).toBeGreaterThanOrEqual(30);
    for (const name of ["startOpsLoop", "startOpsControlLoop", "startExecLoop", "startBusinessOpsLoop", "startProductEngineLoop"]) expect(wrapped).toContain(name);
  });
  it("every started loop has its stop function called on shutdown", () => {
    const stops = [...src.matchAll(/const (stop\w+) = safeStart/g)].map((m) => m[1]);
    const missing = stops.filter((s) => !new RegExp(`\\b${s}\\(\\)`).test(src));
    expect(missing).toEqual([]);
  });
});
