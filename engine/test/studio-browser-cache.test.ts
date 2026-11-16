import { mkdtemp, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { browserCachePath, linkBrowserCache } from "../src/studio/browser-cache";

describe("studio browser cache link", () => {
  it("uses the HyperFrames cache layout for linux", () => {
    expect(browserCachePath("/h", "linux", "x64")).toBe("/h/.cache/puppeteer/chrome-headless-shell/linux-ozzy/chrome-headless-shell-linux64/chrome-headless-shell");
    expect(browserCachePath("/h", "linux", "arm64")).toBeNull();
  });
  it("links the engine's browser into the session home (twice is fine)", async () => {
    const home = await mkdtemp(join(tmpdir(), "bc-"));
    const browser = join(home, "shell");
    await writeFile(browser, "x");
    const link = await linkBrowserCache(home, browser, "linux", "x64");
    await linkBrowserCache(home, browser, "linux", "x64");
    expect(await readlink(link!)).toBe(browser);
  });
});
