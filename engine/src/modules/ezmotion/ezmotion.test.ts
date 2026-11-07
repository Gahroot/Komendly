import { describe, expect, it } from "vitest";
import type { AdSpec, Ratio } from "../../../../src/lib/ads/contracts";
import type { AIProvider } from "../../providers/types";
import type { BrandKit } from "../../render/static/types";
import { buildPalette } from "./colors";
import { buildComposition } from "./composition";
import { assertFlashSafe, planScenes } from "./index";
import { frameFor } from "./layout";
import { defaultPlan, sanitizePlan } from "./plan";

const spec: AdSpec = {
  index: 0, kind: "motion", awareness: "problem_aware", angle: "pain",
  hook: "Why do I need a cookie banner?", headline: "Simple analytics", cta: "Start free",
  claims: [{ claim: "No cookies", sourceUrl: "https://x.io" }],
  visual: { concept: "c", assetKeys: ["home"], layout: "m", generateImagery: false },
};
const brand: BrandKit = {
  brandName: "X", colors: [{ hex: "#ffffff", role: "background" }, { hex: "#5850ec", role: "primary" }],
  fonts: [], logoPath: null,
  assets: [{ key: "home", sourceUrl: "https://x.io", kind: "screenshot", width: 1280, height: 2600, hasFace: false, path: "/tmp/h.png" }],
};
const provider = (text: AIProvider["text"]): AIProvider => ({ name: "codex", text, image: async () => { throw new Error("no"); }, health: async () => ({ ok: true }) });

describe("sanitizePlan", () => {
  it("drops invented hook copy, emphasis, claims, assets and off-brand colors", () => {
    const raw = { ...defaultPlan(spec, brand), hookLines: ["Save 90% today!"], emphasis: ["guaranteed"], claimIndexes: [0, 5], productAssetKey: "fake", backgroundHex: "#123456", accentHex: "#5850EC" };
    const { plan, fixes } = sanitizePlan(raw, spec, brand);
    expect(plan.hookLines.join(" ")).toBe(spec.hook);
    expect(plan.emphasis).toEqual([]);
    expect(plan.claimIndexes).toEqual([0]);
    expect(plan.productAssetKey).toBe("home");
    expect(plan.backgroundHex).toBeNull();
    expect(plan.accentHex).toBe("#5850EC");
    expect(fixes).toContain("hookLines");
  });
  it("keeps a valid re-split of the hook", () => {
    const raw = { ...defaultPlan(spec, brand), hookLines: ["Why do I need", "a cookie banner?"], emphasis: ["cookie"] };
    expect(sanitizePlan(raw, spec, brand).plan.hookLines).toEqual(["Why do I need", "a cookie banner?"]);
  });
  it("falls back on garbage", () => {
    expect(sanitizePlan({ nope: 1 }, spec, brand).fixes).toEqual(["plan:invalid"]);
  });
});

describe("composition per ratio", () => {
  const sizes: Array<[Ratio, number, number]> = [["9:16", 1080, 1920], ["1:1", 1080, 1080], ["4:5", 1080, 1350]];
  for (const [ratio, w, h] of sizes) {
    it(`${ratio} uses ${w}x${h}, safe zones and a paused registered timeline`, () => {
      const frame = frameFor(ratio);
      const html = buildComposition({
        spec, plan: defaultPlan(spec, brand), frame, palette: buildPalette(brand.colors), brandName: "X", domain: "x.io",
        durationSec: 14, fontCss: "", headingFamily: "Mona Sans", bodyFamily: "Mona Sans", logo: null,
        product: { key: "home", src: "assets/p.png", width: 1280, height: 2600, hasFace: false }, secondary: null, gsapSrc: "gsap.min.js", music: null,
      });
      expect(html).toContain(`data-width="${w}" data-height="${h}" data-duration="14"`);
      expect(html).toContain(`padding:${frame.safe.top}px ${frame.safe.right}px ${frame.safe.bottom}px ${frame.safe.left}px`);
      expect(html).toContain("gsap.timeline({ paused: true })");
      expect(html).toContain('window.__timelines["main"] = tl');
      expect(html).not.toMatch(/Math\.random|Date\.now|repeat:-1/);
      expect(html).toContain("No cookies");
      if (ratio === "9:16") expect([frame.safe.top, frame.safe.bottom]).toEqual([Math.round(1920 * 0.14), 384]);
    });
  }
});

describe("flash gating", () => {
  it("throws when the flash check fails", () => {
    expect(() => assertFlashSafe({ ok: false, raw: { general: "fail" } }, "9:16")).toThrow(/Flash-safety/);
    expect(() => assertFlashSafe({ ok: true, raw: {} }, "9:16")).not.toThrow();
  });
});

describe("planScenes", () => {
  it("uses the default plan when provider.text fails", async () => {
    const r = await planScenes({ spec, brand, maxSeconds: 14, provider: provider(async () => { throw new Error("down"); }) });
    expect(r.source).toBe("default");
    expect(r.plan).toEqual(defaultPlan(spec, brand));
  });
  it("uses a valid LLM plan", async () => {
    const json = { ...defaultPlan(spec, brand), hookStyle: "chat" };
    const r = await planScenes({ spec, brand, maxSeconds: 14, provider: provider(async () => ({ text: "", json, usage: { costMicros: 5, latencyMs: 1 } })) });
    expect(r.source).toBe("llm");
    expect(r.plan.hookStyle).toBe("chat");
    expect(r.usage).toHaveLength(1);
  });
});
