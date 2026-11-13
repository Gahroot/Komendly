import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describePhoto, installBrandPhotos, parseStoredAssets, photoFileName, rankBrandPhotos, type StoredAsset } from "../src/studio/brand-photos";
import { CRAFT_RULES, studioBrief } from "../src/studio/brief";
import { iconIndex } from "../src/studio/kit-install";

const a = (key: string, kind: string, width: number, height: number, sourceUrl = `https://x.com/${key}`): StoredAsset => ({ key, kind, width, height, hasFace: false, sourceUrl });

describe("rankBrandPhotos", () => {
  it("drops icons, logos, tiny, banner-shaped and duplicate images; ranks photo > product > screenshot by area", () => {
    const out = rankBrandPhotos([
      a("s1.png", "screenshot", 1600, 1000), a("p-small.jpg", "photo", 300, 200), a("icon.png", "icon", 800, 800),
      a("logo-key", "photo", 800, 800), a("l.png", "product", 900, 900, "https://x.com/img/logo-big.png"),
      a("banner.jpg", "photo", 3000, 400), a("prod.jpg", "product", 1000, 1000), a("hero.jpg", "photo", 1200, 800),
      a("big.jpg", "photo", 2000, 1500, "https://x.com/a/shop-1024x768.jpg"), a("dup.jpg", "photo", 1000, 750, "https://x.com/a/shop-500x375.jpg"),
    ], "logo-key");
    expect(out.map((x) => x.key)).toEqual(["big.jpg", "hero.jpg", "prod.jpg", "s1.png"]);
  });
  it("caps at 8 and keeps at most 2 screenshots", () => {
    const many = Array.from({ length: 10 }, (_, i) => a(`p${i}.jpg`, i < 4 ? "screenshot" : "photo", 1000 + i, 800));
    const out = rankBrandPhotos(many, null);
    expect(out).toHaveLength(8);
    expect(out.filter((x) => x.kind === "screenshot")).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("parses stored JSON defensively and keeps alt", () => {
    expect(parseStoredAssets([null, { key: 1 }, { key: "k", width: 9, height: 9, kind: "photo", alt: "Our salon" }])).toEqual([{ key: "k", sourceUrl: "", kind: "photo", width: 9, height: 9, hasFace: false, alt: "Our salon" }]);
    expect(parseStoredAssets("nope")).toEqual([]);
  });
  it("names and describes files", () => {
    expect(photoFileName(a("brand/x/abc.webp", "photo", 1, 1), 0)).toBe("photo-1.webp");
    expect(photoFileName(a("brand/x/abc", "product", 1, 1), 2)).toBe("product-3.jpg");
    expect(describePhoto({ file: "photo-1.jpg", kind: "photo", width: 10, height: 20, alt: "Shop" })).toBe('./brand/photos/photo-1.jpg (photo, 10x20, "Shop")');
  });
  it("icon index is sorted with tags", () => {
    expect(iconIndex(["paw-print", "car"], { "paw-print": ["dog", "pets"] })).toBe("car\npaw-print: dog, pets\n");
  });
  it("brief lists photos and rules mention the image order", () => {
    const md = studioBrief({ brand: { name: "B", url: null, colors: [], fonts: [], logoFile: null, photos: [{ file: "photo-1.jpg", kind: "photo", width: 1, height: 1 }] }, uploads: [], paid: false });
    expect(md).toContain("./brand/photos/photo-1.jpg (photo, 1x1)");
    expect(CRAFT_RULES.join("\n")).toContain("kit/icons/INDEX.txt");
  });
});

describe("installBrandPhotos", () => {
  it("downloads in parallel, skips failures and never throws", async () => {
    const project = await mkdtemp(join(tmpdir(), "bp-"));
    const storage = { get: async (k: string) => (k === "bad.jpg" ? Promise.reject(new Error("nope")) : k === "slow.jpg" ? new Promise<Buffer>(() => {}) : Buffer.alloc(4096)) };
    const errs: string[] = [];
    const out = await installBrandPhotos({ storage, project, logoKey: null, timeoutMs: 50, onError: (_m, k) => errs.push(k), assets: [a("ok.jpg", "photo", 1000, 800), a("bad.jpg", "photo", 900, 800), a("slow.jpg", "photo", 800, 800)] });
    expect(out.map((p) => p.file)).toEqual(["photo-1.jpg"]);
    expect(errs.sort()).toEqual(["bad.jpg", "slow.jpg"]);
    expect(await readdir(join(project, "brand", "photos"))).toEqual(["photo-1.jpg"]);
  });
});
