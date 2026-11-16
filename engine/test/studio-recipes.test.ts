import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { studioBrief } from "../src/studio/brief";
import { RECIPE_IDS, type RecipeInput, classifyRecipe, recipeBlock } from "../src/studio/recipes";

const run = promisify(execFile);
const input = (userText: string, extra: Partial<RecipeInput> = {}): RecipeInput => ({ userText, uploads: [], brand: null, ...extra });

describe("classifyRecipe", () => {
  it.each([
    ["Show the before and after of our carpet cleaning", "before-after"],
    ["kitchen makeover video", "before-after"],
    ["Black Friday: 30% off all hoodies", "offer"],
    ["We just launched dark mode, announce it", "launch"],
    ["Introducing our new scheduling feature", "launch"],
    ["a walkthrough of how to use our app", "walkthrough"],
    ["ad for my coffee shop's autumn latte", "local"],
    ["my plumbing business needs an ad", "local"],
    ["promo video for our SaaS website", "website"],
    ["make something cool", "general"],
  ] as const)("%s -> %s", (text, id) => {
    expect(classifyRecipe(input(text))).toBe(id);
  });

  it("uses uploads and brand when the words don't say", () => {
    expect(classifyRecipe(input("make a video", { uploads: [{ file: "screen-recording.mp4", kind: "video" }] }))).toBe("walkthrough");
    expect(classifyRecipe(input("make a video", { uploads: [{ file: "before.jpg", kind: "image" }, { file: "after.jpg", kind: "image" }] }))).toBe("before-after");
    expect(classifyRecipe(input("make a video", { brand: { name: "Sunny Salon", url: null } }))).toBe("local");
    expect(classifyRecipe(input("make a video", { brand: { name: "Acme", url: "https://acme.io" } }))).toBe("website");
    expect(classifyRecipe(input("make one like this", { uploads: [{ file: "screen-demo.mp4", kind: "video", reference: true }] }))).toBe("general");
  });

  it("keeps every recipe short and free of other product names", () => {
    for (const id of RECIPE_IDS) {
      const block = recipeBlock(id);
      expect(block.length).toBeGreaterThan(5);
      expect(block.length).toBeLessThanOrEqual(30);
      expect(block.join("\n")).not.toMatch(/\bEZ\b|ezcoder|ggcoder|\bGG\b|kit\.\w+\(/);
    }
  });
});

describe("studioBrief recipes", () => {
  const brand = { name: "Bean There", url: "https://beanthere.cafe", colors: [], fonts: [], logoFile: null };
  it("includes only the matching recipe", () => {
    const md = studioBrief({ brand, uploads: [], paid: true, userText: "25% off lattes this week" });
    expect(md.match(/^## Recipe:/gm)).toHaveLength(1);
    expect(md).toContain("## Recipe: offer, sale or promo");
    expect(md).toContain("## Make it move");
    expect(md).toContain("never a default");
    expect(md).not.toContain("## Remixing a reference ad");
  });
  it("falls back to the brand without user text, and adds the measuring step for remixes", () => {
    const md = studioBrief({ brand, uploads: [{ file: "ad.mp4", kind: "video", durationSec: 10, width: 1080, height: 1920, reference: true }], paid: false });
    expect(md.match(/^## Recipe:/gm)).toHaveLength(1);
    expect(md).toContain("## Recipe: local service or shop");
    expect(md).toContain("kit/bin/reference-study.mjs");
    expect(md).toMatch(/NEVER copy the original's logos/);
  });
});

describe("score-synth with cues", () => {
  it("renders non-silent music and sfx on the cue times", async () => {
    const dir = await mkdtemp(join(tmpdir(), "score-"));
    await writeFile(join(dir, "cues.json"), JSON.stringify({ version: 1, cues: [{ t: 1, sfx: "whoosh", name: "scene 2 in" }, { t: 3, sfx: "impact", name: "price" }] }));
    await writeFile(join(dir, "score.json"), JSON.stringify({ bpm: 120, duration: 6, seed: 3, style: "pulse", key: "D", scale: "minor", sections: [{ name: "a", from: 0, energy: 0.6 }], hits: [{ bar: 2, sfx: "riser" }], cues: "cues.json" }));
    await run(process.execPath, [join(__dirname, "../src/modules/ezmotion/vendor/bin/score-synth.mjs"), join(dir, "score.json"), dir], { timeout: 60_000 });
    for (const name of ["music.wav", "sfx.wav"]) {
      const wav = await readFile(join(dir, name));
      let peak = 0;
      for (let i = 44; i + 1 < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
      expect(peak, name).toBeGreaterThan(1000);
    }
    const map = JSON.parse(await readFile(join(dir, "tempo-map.json"), "utf8"));
    expect(JSON.stringify(map)).toContain("scene 2 in");
  }, 60_000);
});
