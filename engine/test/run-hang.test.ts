import { describe, expect, it } from "vitest";
import { run } from "../src/modules/ezmotion/runtime";
import { jobTimeoutMs } from "../src/runner";

describe("run() never hangs on grandchildren", () => {
  it("returns after a timeout even when a grandchild keeps the pipes open", async () => {
    // Parent spawns a long-lived grandchild that inherits stdout, then sleeps forever.
    const script = `const { spawn } = require("node:child_process"); spawn(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], { stdio: "inherit" }); setInterval(() => {}, 1000);`;
    const t0 = Date.now();
    const r = await run(process.execPath, ["-e", script], { timeoutMs: 1_000 });
    expect(Date.now() - t0).toBeLessThan(9_000);
    expect(r.code).not.toBe(0);
  }, 15_000);

  it("returns when the child exits but a grandchild still holds the pipes", async () => {
    const script = `const { spawn } = require("node:child_process"); spawn(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], { stdio: "inherit" }); console.log("hi"); process.exit(0);`;
    const t0 = Date.now();
    const r = await run(process.execPath, ["-e", script], { timeoutMs: 60_000 });
    expect(Date.now() - t0).toBeLessThan(9_000);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("hi");
  }, 15_000);
});

describe("jobTimeoutMs", () => {
  it("has a cap per type and honours env overrides", () => {
    expect(jobTimeoutMs("render_motion", {})).toBe(45 * 60_000);
    expect(jobTimeoutMs("qc", {})).toBe(30 * 60_000);
    expect(jobTimeoutMs("render_motion", { ENGINE_JOB_TIMEOUT_MS_RENDER_MOTION: "1000" })).toBe(1000);
  });
});
