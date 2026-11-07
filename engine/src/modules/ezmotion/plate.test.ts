import { describe, expect, it } from "vitest";
import type { AdSpec } from "../../../../src/lib/ads/contracts";
import type { AIProvider } from "../../providers/types";
import type { BrandKit } from "../../render/static/types";
import { makeScenePlate, platePrompt } from "./plate";

const spec: AdSpec = {
  index: 0, kind: "motion", awareness: "problem_aware", angle: "night waking", hook: "3 a.m. again.", headline: "Back to sleep", cta: "Join",
  claims: [], visual: { concept: "bedside at night", assetKeys: [], layout: "", generateImagery: false },
};
const brand: BrandKit = { brandName: "B2S", colors: [{ hex: "#1a1714", role: "background" }, { hex: "#d4b26a", role: "primary" }], fonts: [], logoPath: null, assets: [] };
const provider: AIProvider = { name: "codex", text: () => Promise.reject(new Error("no")), image: () => Promise.reject(new Error("boom")), health: () => Promise.resolve({ ok: true }) };

describe("platePrompt", () => {
  it("asks for an environment-only, text-free, face-free plate in brand colours", () => {
    const p = platePrompt(spec, brand, "9:16");
    expect(p).toMatch(/ENVIRONMENT ONLY/);
    expect(p).toMatch(/Do NOT show the product/);
    expect(p).toMatch(/NO text/);
    expect(p).toMatch(/NO faces/);
    expect(p).toContain("#d4b26a");
  });
});

describe("makeScenePlate", () => {
  it("returns null without real reference assets and never calls the image model", async () => {
    let called = false;
    const res = await makeScenePlate({ ...provider, image: () => { called = true; return Promise.reject(new Error("x")); } }, spec, brand, "9:16");
    expect(res.png).toBeNull();
    expect(res.reasons).toEqual(["no usable assets"]);
    expect(called).toBe(false);
  });
});

describe("plateEnabled", () => {
  it("is on by default with an EZMOTION_PLATE=0 kill-switch", async () => {
    const { plateEnabled } = await import("./index");
    expect(plateEnabled({})).toBe(true);
    expect(plateEnabled({ EZMOTION_PLATE: "0" })).toBe(false);
  });
  it("falls back (null, reasons) when image generation fails", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const sharp = (await import("sharp")).default;
    const dir = await mkdtemp(join(tmpdir(), "plate-"));
    try {
      const path = join(dir, "p.png");
      await sharp({ create: { width: 800, height: 600, channels: 3, background: "#553311" } }).png().toFile(path);
      const b: BrandKit = { ...brand, assets: [{ key: "p", sourceUrl: "https://x.io/p.png", kind: "product", width: 800, height: 600, hasFace: false, path }] };
      const res = await makeScenePlate(provider, spec, b, "9:16");
      expect(res.png).toBeNull();
      expect(res.reasons).toEqual(["boom"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("isSoftwareBrand", () => {
  it("skips plates when screenshots lead", async () => {
    const { isSoftwareBrand } = await import("./index");
    expect(isSoftwareBrand([{ kind: "screenshot", hasFace: false }, { kind: "photo", hasFace: false }])).toBe(true);
    expect(isSoftwareBrand([{ kind: "product", hasFace: false }, { kind: "photo", hasFace: false }, { kind: "screenshot", hasFace: false }])).toBe(false);
    expect(isSoftwareBrand([])).toBe(false);
  });
});
