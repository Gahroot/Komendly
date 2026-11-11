import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isBlankLogo, logoInk } from "../src/jobs/blank-logo";

describe("blank logo detection", () => {
  it("flags a placeholder app icon (dark plate, one short line)", async () => {
    expect(isBlankLogo(await logoInk(path.join(import.meta.dirname, "fixtures/placeholder-icon.png")))).toBe(true);
  });
  it("flags an empty svg", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "logo-"));
    const f = path.join(dir, "e.svg");
    await writeFile(f, '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><use href="#x"/></svg>');
    expect(isBlankLogo(await logoInk(f))).toBe(true);
  });
  it("keeps a real wordmark on transparent background", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "logo-"));
    const f = path.join(dir, "w.png");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><text x="10" y="90" font-size="80" font-family="Arial" font-weight="700" fill="#123">Acme Co</text></svg>';
    await sharp(Buffer.from(svg)).png().toFile(f);
    expect(isBlankLogo(await logoInk(f))).toBe(false);
  });
  it("keeps a solid badge logo with a big mark", () => {
    expect(isBlankLogo({ ink: 0.3, plate: 0.7 })).toBe(false);
  });
});
