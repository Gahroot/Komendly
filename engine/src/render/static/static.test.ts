import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdSpec } from "../../../../src/lib/ads/contracts";
import { RATIO_PIXELS, RATIOS } from "../../../../src/lib/ads/contracts";
import type { AIProvider } from "../../providers/types";
import { buildPalette, contrastRatio, pickTextColor } from "./color";
import { launchRenderBrowser, renderStaticAdWith, StaticRenderError } from "./index";
import { HEADLINE_MIN_PX, TEMPLATE_IDS, extractNumber, requestedTemplate, resolveTemplate, safeZone } from "./layout";
import type { BrandKit } from "./types";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";

const provider: AIProvider = {
  name: "codex",
  text: () => Promise.reject(new Error("unused")),
  image: () => Promise.reject(new Error("image must not be called")),
  health: () => Promise.resolve({ ok: true }),
};
const brand: BrandKit = {
  brandName: "Acme",
  colors: [{ hex: "#FFD400", role: "primary" }, { hex: "#FFFFFF", role: "background" }],
  fonts: [],
  logoPath: null,
  assets: [],
};
const spec = (over: Partial<AdSpec> = {}, layout = "minimal_type"): AdSpec => ({
  index: 0, kind: "static", awareness: "problem_aware", angle: "a", hook: "I keep forgetting to invoice",
  headline: "Stop chasing invoices at midnight", body: "Send them once. We follow up.", cta: "Try it free",
  claims: [], visual: { concept: "c", assetKeys: [], layout, generateImagery: false }, ...over,
});

describe("contrast", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
  });
  it("picks a brand colour only when it passes AA, else a neutral", () => {
    expect(pickTextColor("#FFFFFF", ["#FFD400"])).toBe("#0E0F13");
    expect(pickTextColor("#FFFFFF", ["#1A3A8F"])).toBe("#1A3A8F");
  });
  it("palette text pairs meet AA", () => {
    for (const colors of [brand.colors, [{ hex: "#0B0D17", role: "background" }, { hex: "#F5B83D", role: "primary" }], []]) {
      const p = buildPalette(colors);
      expect(contrastRatio(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.accentText, p.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.surfaceText, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.accentOnBg, p.bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("template selection", () => {
  it("accepts ids and aliases, falls back by awareness", () => {
    expect(requestedTemplate(spec({}, "before-after"))).toBe("before_after");
    expect(requestedTemplate(spec({}, "iMessage moment"))).toBe("quote_thought");
    expect(TEMPLATE_IDS).toContain(requestedTemplate(spec({}, "???")));
  });
  it("never invents numbers or quotes", () => {
    expect(resolveTemplate("stat_card", { hasNumber: false, hasQuote: false, hasVisual: false, hasSceneVisual: false })).toBe("minimal_type");
    expect(resolveTemplate("testimonial", { hasNumber: false, hasQuote: false, hasVisual: false, hasSceneVisual: false })).toBe("quote_thought");
    expect(extractNumber("Used by 12,000+ teams")).toBe("12,000+");
    expect(extractNumber("no digits here")).toBeNull();
  });
});

describe("render", () => {
  let browser: Browser;
  let dir: string;
  beforeAll(async () => { browser = await launchRenderBrowser(); dir = await mkdtemp(join(tmpdir(), "static-")); });
  afterAll(async () => { await browser.close(); });

  it("renders exact dims, PNG + JPEG, key text inside safe zones, headline >= min", async () => {
    for (const layout of ["minimal_type", "pain_list", "offer_card"]) {
      const res = await renderStaticAdWith(browser, { spec: spec({}, layout), brand, ratios: [...RATIOS], workDir: dir, provider });
      expect(res.files).toHaveLength(6);
      for (const f of res.files) {
        expect([f.width, f.height]).toEqual([RATIO_PIXELS[f.ratio].width, RATIO_PIXELS[f.ratio].height]);
        if (f.mime === "image/png") {
          const buf = await readFile(f.path);
          expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([f.width, f.height]);
        }
        expect(f.bytes).toBeLessThan(30 * 1024 * 1024);
      }
      for (const r of res.reports) {
        const { height } = RATIO_PIXELS[r.ratio];
        const z = safeZone(r.ratio);
        expect(r.fit.sizes.headline).toBeGreaterThanOrEqual(HEADLINE_MIN_PX);
        for (const key of ["headline", "cta", "logo"]) {
          const rect = r.fit.rects[key];
          expect(rect, `${layout} ${r.ratio} ${key}`).toBeDefined();
          if (!rect) continue;
          expect(rect.y).toBeGreaterThanOrEqual(z.top);
          expect(rect.y + rect.height).toBeLessThanOrEqual(height - z.bottom);
          expect(rect.x).toBeGreaterThanOrEqual(z.x);
        }
      }
    }
    expect(safeZone("9:16")).toMatchObject({ top: 269, bottom: 384 });
  });

  it("reports headline overflow instead of shrinking below the minimum", async () => {
    const long = "Supercalifragilisticexpialidocious ".repeat(2).trim() + " words ".repeat(12).trim();
    const err = await renderStaticAdWith(browser, { spec: spec({ headline: long.slice(0, 90), body: "x ".repeat(100) }, "before_after"), brand, ratios: ["1:1"], workDir: dir, provider }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StaticRenderError);
    expect((err as StaticRenderError).code).toBe("text_overflow");
  });
});

describe("logo", () => {
  it("detects an unreadable dark logo on navy and takes its vivid hue as accent", async () => {
    const { writeFile, mkdtemp: mk } = await import("node:fs/promises");
    const { analyzeLogo, logoReadsOn } = await import("./logo");
    const { renderTemplateHtml } = await import("./templates");
    const { buildFontPlan } = await import("./fonts");
    const d = await mk(join(tmpdir(), "logo-"));
    const path = join(d, "logo.svg");
    await writeFile(path, `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="50" height="60" fill="#5850EC"/><rect x="60" width="140" height="60" fill="#1F2961"/></svg>`);
    const info = await analyzeLogo(path);
    expect(info).not.toBeNull();
    expect(logoReadsOn(info, "#161E2E")).toBe(false);
    expect(logoReadsOn(info, "#FFFFFF")).toBe(true);
    const palette = buildPalette([{ hex: "#161E2E", role: "primary" }, { hex: "#F9FAFB", role: "bg" }], info?.vivid ?? null);
    expect(palette.accent).toBe("#5850EC");
    const html = renderTemplateHtml({ id: "minimal_type", ratio: "1:1", palette: { ...palette, bg: "#161E2E" }, fonts: buildFontPlan([]), brandName: "P", logoUri: "data:image/svg+xml;base64,", logoInfo: info,
      headline: "h", hook: "h", body: "Body copy shown", cta: null, bullets: [], quote: null, stat: null, visual: null, images: [], domain: null });
    expect(html).toContain('class="logo chip"');
    expect(html).toContain("Body copy&nbsp;shown"); // orphan guard glues the last two words
  });
});
