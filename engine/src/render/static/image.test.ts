import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdSpec } from "../../../../src/lib/ads/contracts";
import { RATIO_PIXELS, RATIOS } from "../../../../src/lib/ads/contracts";
import type { AIProvider } from "../../providers/types";
import { chooseImages } from "./image-select";
import { IMAGE_TEMPLATE_IDS, fullBleedSafe, imageLayoutsFor, isLowRes, placeImage } from "./imagery";
import { launchRenderBrowser, renderStaticAdWith } from "./index";
import { regionContrast } from "./contrast-check";
import type { BrandKit } from "./types";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const provider: AIProvider = {
  name: "codex",
  text: () => Promise.reject(new Error("unused")),
  image: () => Promise.reject(new Error("unused")),
  health: () => Promise.resolve({ ok: true }),
};
type Asset = BrandKit["assets"][number];
const asset = (key: string, kind: Asset["kind"], width: number, height: number, path = "", hasFace = false): Asset =>
  ({ key, kind, width, height, path, hasFace, sourceUrl: `https://ex.com/${key}` });

describe("face-safe crop", () => {
  const face = { x: 0.6, y: 0.3, width: 0.2, height: 0.15 };
  it("keeps the face box in frame and inside the face zone (above text)", () => {
    const img = { width: 2000, height: 3000, hasFace: true, faceBox: face, focal: { x: 0.1, y: 0.9 } };
    const p = placeImage(img, 1080, 1920, [0, 0.5]);
    expect(p.fit).toBe("cover");
    const w = p.window;
    expect(face.x).toBeGreaterThanOrEqual(w.x - 1e-9);
    expect(face.x + face.width).toBeLessThanOrEqual(w.x + w.width + 1e-9);
    expect(face.y).toBeGreaterThanOrEqual(w.y - 1e-9);
    expect(face.y + face.height).toBeLessThanOrEqual(w.y + w.height * 0.5 + 1e-9);
  });
  it("falls back to contain when the face can't fit", () => {
    const p = placeImage({ width: 2000, height: 1000, hasFace: true, faceBox: { x: 0, y: 0, width: 1, height: 1 }, focal: { x: 0.5, y: 0.5 } }, 1080, 1920);
    expect(p.fit).toBe("contain");
  });
  it("face without box: centre-top, never full-bleed", () => {
    const p = placeImage({ width: 2000, height: 3000, hasFace: true, faceBox: null, focal: { x: 0.9, y: 0.9 } }, 1080, 1080);
    expect(p.window.y).toBe(0);
    expect(fullBleedSafe({ hasFace: true })).toBe(false);
    const c = chooseImages("photo_fullbleed", [asset("f", "photo", 3000, 3000, "", true)], "4:5", [], 0);
    expect(c.template).toBe("photo_split");
    expect(imageLayoutsFor({ brandName: "b", colors: [], fonts: [], logoPath: null, assets: [asset("f", "photo", 3000, 3000, "", true)] })).not.toContain("photo_fullbleed");
  });
});

describe("low-res fallback", () => {
  it("< 800px on the needed edge -> split", () => {
    expect(isLowRes({ width: 768, height: 512 }, 1080, 1920)).toBe(true);
    expect(isLowRes({ width: 1600, height: 1200 }, 1080, 1080)).toBe(false);
    expect(chooseImages("photo_fullbleed", [asset("s", "photo", 768, 512)], "9:16", [], 0).template).toBe("photo_split");
    expect(chooseImages("photo_caption", [asset("s", "photo", 768, 512)], "1:1", [], 0).template).toBe("photo_split");
  });
});

describe("scrim contrast", () => {
  it("measures region contrast on real pixels", () => {
    const w = 10, h = 10;
    const raw = Buffer.alloc(w * h * 3, 255);
    expect(regionContrast(raw, w, h, 3, { x: 0, y: 0, width: 10, height: 10 }, "#FFFFFF")).toBeCloseTo(1, 1);
    expect(regionContrast(Buffer.alloc(w * h * 3, 0), w, h, 3, { x: 0, y: 0, width: 10, height: 10 }, "#FFFFFF")).toBeCloseTo(21, 0);
  });
});

/** Textured (non-flat) photo-like fixture: deterministic noise around a base colour. */
async function photo(path: string, width: number, height: number, base: [number, number, number], spread = 90) {
  const c = (d: number) => `rgb(${base.map((v) => Math.max(0, Math.min(255, v + d))).join(",")})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c(spread / 2)}"/><stop offset="1" stop-color="${c(-spread)}"/></linearGradient></defs>
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="3"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer></filter><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" filter="url(#n)"/><circle cx="${width * 0.6}" cy="${height * 0.4}" r="${height * 0.2}" fill="${c(-spread / 2)}"/></svg>`;
  await sharp(Buffer.from(svg)).jpeg().toFile(path);
}

describe("image templates render", () => {
  let browser: Browser;
  let brand: BrandKit;
  beforeAll(async () => {
    browser = await launchRenderBrowser();
    const dir = await mkdtemp(join(tmpdir(), "img-"));
    // Very bright photo: forces the scrim to strengthen for white text.
    const bright = join(dir, "bright.jpg");
    await photo(bright, 2000, 2000, [0xFA, 0xFA, 0xF0], 70);
    const p2 = join(dir, "p2.jpg");
    await photo(p2, 1800, 1400, [0x5A, 0x7D, 0x4A]);
    const before = join(dir, "x-Before_1.jpg"), after = join(dir, "x-After_1.jpg");
    await photo(before, 1600, 1000, [0x55, 0x66, 0x77], 160);
    await photo(after, 1600, 1000, [0xAA, 0x88, 0x33], 160);
    const prod = join(dir, "prod.png");
    await sharp({ create: { width: 1200, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from(`<svg width="1200" height="1200"><rect x="400" y="200" width="400" height="800" rx="60" fill="#8B4513"/></svg>`) }]).png().toFile(prod);
    const shot = join(dir, "shot.jpg");
    await photo(shot, 2160, 1350, [0xEE, 0xEE, 0xEE]);
    brand = {
      brandName: "Acme", logoPath: null, colors: [{ hex: "#EFB708", role: "primary" }, { hex: "#0E0E0E", role: "background" }], fonts: [],
      assets: [
        { ...asset("bright.jpg", "photo", 2000, 2000, bright), sourceUrl: "https://ex.com/bright.jpg" },
        { ...asset("p2.jpg", "photo", 1800, 1400, p2) },
        { ...asset("b", "photo", 1600, 1000, before), sourceUrl: "https://ex.com/x-Before_1.jpg" },
        { ...asset("a", "photo", 1600, 1000, after), sourceUrl: "https://ex.com/x-After_1.jpg" },
        asset("prod.png", "product", 1200, 1200, prod),
        asset("shot.jpg", "screenshot", 2160, 1350, shot),
      ],
    };
  });
  afterAll(async () => { await browser.close(); });

  it("every image template x ratio: exact dims, its own template, AA over imagery", async () => {
    expect(imageLayoutsFor(brand)).toEqual([...IMAGE_TEMPLATE_IDS]);
    const dir = await mkdtemp(join(tmpdir(), "img-out-"));
    for (const [i, id] of IMAGE_TEMPLATE_IDS.entries()) {
      const spec: AdSpec = { index: i, kind: "static", awareness: "problem_aware", angle: id, hook: "h", headline: "Come home to a house that glows", body: "Short body line.", cta: "Get a quote",
        claims: [], visual: { concept: id, assetKeys: id === "photo_fullbleed" ? ["bright.jpg"] : [], layout: id, generateImagery: false } };
      const res = await renderStaticAdWith(browser, { spec, brand, ratios: [...RATIOS], workDir: dir, provider });
      expect(res.files).toHaveLength(6);
      for (const f of res.files) {
        const m = await sharp(f.path).metadata();
        expect([m.width, m.height]).toEqual([RATIO_PIXELS[f.ratio].width, RATIO_PIXELS[f.ratio].height]);
      }
      for (const r of res.reports) {
        expect(r.template).toBe(id);
        if (r.contrast) {
          expect(r.contrast.ok).toBe(true);
          for (const v of Object.values(r.contrast.contrast)) expect(v).toBeGreaterThanOrEqual(3);
        }
      }
    }
  }, 180_000);

  it("strengthens the scrim until white text passes AA on a white photo", async () => {
    const { ensureImageContrast } = await import("./contrast-check");
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    await page.setContent(`<style>body{margin:0}.measuring [data-contrast]{color:transparent!important}</style><div class="ad" style="--s:.55;--tz:60%;position:relative;width:400px;height:400px;background:#fff">
      <div style="position:absolute;inset:0;background:linear-gradient(to top, rgb(40 30 0 / var(--s)) 0%, rgb(40 30 0 / var(--s)) var(--tz), transparent 100%)"></div>
      <h1 data-contrast="#FFFFFF" data-cmin="4.5" data-key="headline" style="position:absolute;bottom:40px;left:20px;color:#fff;font:700 40px sans-serif">Hello</h1></div>`);
    const r = await ensureImageContrast(page, 400, 400);
    await page.close();
    expect(r?.ok, JSON.stringify(r)).toBe(true);
    expect(r?.scrim).toBeGreaterThan(0.55);
    expect(r?.contrast.headline).toBeGreaterThanOrEqual(4.5);
  });
});

describe("text-heavy / flat images and quotes", () => {
  it("flags banners and flat images, skips them for photo layouts", async () => {
    const { looksTexty, imageTextStats } = await import("./imagery");
    expect(looksTexty({ width: 1200, height: 630, sourceUrl: "https://x.com/img/og.jpg", key: "k" }, null)).toBe(true);
    expect(looksTexty({ width: 1600, height: 1200, sourceUrl: "https://x.com/garden.jpg", key: "k" }, { strong: 0.01, flat: 0.5, top2: 0.4 })).toBe(false);
    expect(looksTexty({ width: 1600, height: 1200, sourceUrl: "https://x.com/promo.png", key: "k" }, { strong: 0.05, flat: 0.8, top2: 0.8 })).toBe(true);
    const d = await mkdtemp(join(tmpdir(), "flat-"));
    const flat = join(d, "flat.jpg");
    await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#224488" } }).jpeg().toFile(flat);
    expect((await imageTextStats(flat)).top2).toBeGreaterThan(0.88);
  });
  it("detects quote fragments", async () => {
    const { isQuoteFragment } = await import("./index");
    expect(isQuoteFragment("able to help us close on the perfect home within our tight timeline.")).toBe(true);
    expect(isQuoteFragment("…and then they called back")).toBe(true);
    expect(isQuoteFragment("She was never pushy, just gave me the facts.")).toBe(false);
  });
  it("logo min size by aspect", async () => {
    const { logoHeight } = await import("./logo");
    expect(logoHeight(60, 1)).toBe(96);
    expect(logoHeight(30, 4) * 4).toBeGreaterThanOrEqual(160);
    expect(logoHeight(200, 8) * 8).toBeLessThanOrEqual(420);
  });
});

import { pickRegion } from "./imagery";
describe("pickRegion", () => {
  it("snaps the crop to a whitespace row, never through a text line", () => {
    // 1000 rows: text lines of 20 rows separated by 10 quiet rows.
    const rows = new Float64Array(1000).map((_, i) => (i % 30 < 20 ? 100 : 0));
    const [top, bottom] = pickRegion(rows, 500, 1.6);
    expect(top === 0 || rows[top] === 0).toBe(true);
    expect(bottom === 1000 || rows[bottom] === 0).toBe(true);
  });
});
