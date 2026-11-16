import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installStudioKit } from "../src/studio/kit-install";

describe("kit/bin/new-video.mjs", () => {
  it("starts a punch.js composition in the brand's colours", async () => {
    const p = mkdtempSync(join(tmpdir(), "nv-"));
    await installStudioKit(p, { name: "Acme Roofing", colors: [{ hex: "#33449C", role: "primary" }, { hex: "#FFFFFF", role: "background" }], fonts: [] } as never);
    const out = JSON.parse(execFileSync(process.execPath, [join(p, "kit/bin/new-video.mjs"), "ad", "9:16"], { cwd: p, encoding: "utf8" }).trim().split("\n").pop()!);
    expect(out.ok).toBe(true);
    const html = readFileSync(join(p, "ad/index.html"), "utf8");
    expect(html).toContain("Punch(tl");
    expect(html).toContain('src="kit/punch.js"');
    expect(existsSync(join(p, "ad/kit/punch.js"))).toBe(true);
    expect(existsSync(join(p, "ad/kit/fonts/fraunces-italic.woff2"))).toBe(true);
    expect(html).not.toContain("#ff6b35");
    expect(html).toContain(out.brand.stage);
    // Never overwrites an existing composition.
    expect(() => execFileSync(process.execPath, [join(p, "kit/bin/new-video.mjs"), "ad", "9:16"], { cwd: p, stdio: "pipe" })).toThrow();
  }, 60_000);
});

describe("new-video kinds", () => {
  it("defaults to a blank canvas at the asked size; --example ad copies the sample ad", async () => {
    const p = mkdtempSync(join(tmpdir(), "nv2-"));
    await installStudioKit(p, null);
    const run = (...a: string[]) => JSON.parse(execFileSync(process.execPath, [join(p, "kit/bin/new-video.mjs"), ...a], { cwd: p, encoding: "utf8" }).trim().split("\n").pop()!);
    expect(run("sq", "1:1").size).toBe("1080x1080");
    const sq = readFileSync(join(p, "sq/index.html"), "utf8");
    expect(sq).toContain('data-width="1080" data-height="1080"');
    expect(sq).not.toMatch(/__[A-Z]+__/);
    expect(sq).not.toContain("Northside");
    run("ad", "9:16", "--example", "ad");
    expect(readFileSync(join(p, "ad/index.html"), "utf8")).toContain("Northside");
    expect(() => execFileSync(process.execPath, [join(p, "kit/bin/new-video.mjs"), "x", "4:3"], { cwd: p, stdio: "pipe" })).toThrow();
  }, 60_000);
});
