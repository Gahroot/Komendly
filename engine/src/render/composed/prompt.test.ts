import { describe, expect, it } from "vitest";
import { buildComposedPrompt } from "./prompt";
import { sceneFor } from "./scene";
import { dHash, hamming, tooSimilar } from "./diversity";
import { judge, normText } from "./verify-text";
import { staticMode } from "./mode";

const spec = { index: 0, kind: "static", awareness: "problem", angle: "a", hook: "h", headline: "Awake at 3am again?", cta: "Shop now", claims: [], visual: { concept: "bottle on nightstand", assetKeys: [], layout: "", generateImagery: false } } as never;
const brand = { brandName: "B", colors: [{ hex: "#112233", role: "primary" }], fonts: [{ family: "Inter", role: "heading" }] };
const read = { headline: "Awake at 3am again?", cta: "Shop now", allText: ["Awake at 3am again?", "Shop now"], incidentalText: ["Settings", "12 caps"], hasQuoteOrAttribution: false, hasBadgeOrStars: false, hasHumanFace: false, hasThirdPartyBrand: false, hasFrame: false, screenUi: "none" as const, productNotInReferences: false, hasInventedData: false, textBoxes: [], topLeftEmpty: true };
const allowed = { headline: "Awake at 3am again?", cta: "Shop now", brandName: "B" };

describe("composed prompt", () => {
  it("lean is shorter and both carry exact text and colours", () => {
    const lean = buildComposedPrompt({ spec, brand, refLabels: ["logo"], style: "lean" });
    const det = buildComposedPrompt({ spec, brand, refLabels: ["logo"], style: "detailed" });
    expect(lean.length).toBeLessThan(det.length);
    for (const p of [lean, det]) { expect(p).toContain('"Awake at 3am again?"'); expect(p).toContain("#112233"); }
  });
  it("varies scene by index", () => expect(sceneFor(0)).not.toBe(sceneFor(1)));
  it("normalises text", () => expect(normText("Awake at 3AM — again?")).toBe(normText("awake at 3am again")));
  it("defaults to composed", () => { expect(staticMode({})).toBe("composed"); expect(staticMode({ STATIC_MODE: "template" })).toBe("template"); });
});

describe("strict QC", () => {
  it("passes clean read", () => expect(judge(read, allowed)).toEqual([]));
  it("fails invented testimonial", () => {
    const r = judge({ ...read, allText: [...read.allText, "Recorded never felt like finished work.", "— Nolan"], hasQuoteOrAttribution: true }, allowed);
    expect(r.some((x) => x.includes("Nolan"))).toBe(true);
    expect(r).toContain("quote/attribution");
  });
  it("fails numbers, badges, faces", () => {
    const r = judge({ ...read, allText: [...read.allText, "4.9"], hasBadgeOrStars: true, hasHumanFace: true }, allowed);
    expect(r).toEqual(expect.arrayContaining(["badge or stars", "human face", 'number "4" not in brief']));
  });
});

describe("strict QC false fails", () => {
  it("headline in quotes alone is not a quote fail", () => expect(judge({ ...read, hasQuoteOrAttribution: true }, allowed)).toEqual([]));
  it("label and screenshot words are tolerated", () => expect(judge(read, allowed)).toEqual([]));
});

describe("scene fit", () => {
  it("no device scenes without screenshots", () => {
    for (let i = 0; i < 10; i++) expect(sceneFor(i, false)).not.toMatch(/device|screenshot/);
  });
  it("device scene available for software", () => expect([0, 1, 2].map((i) => sceneFor(i, true)).some((s) => /device/.test(s))).toBe(true));
});

describe("diversity", () => {
  it("ten ads get ten distinct scenes and shift changes the scene", () => {
    expect(new Set(Array.from({ length: 10 }, (_, i) => sceneFor(i))).size).toBe(10);
    expect(sceneFor(2, false, 1)).not.toBe(sceneFor(2));
  });
  it("hamming flags near duplicates only", () => {
    expect(tooSimilar("ffffffffffffffff", ["fffffffffffffff0"])).toBe(true);
    expect(tooSimilar("ffffffffffffffff", ["0000000000000000"])).toBe(false);
    expect(hamming("00", "03")).toBe(2);
  });
  it("dHash is stable for identical images", async () => {
    const sharp = (await import("sharp")).default;
    const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#336699" } }).png().toBuffer();
    expect(await dHash(img)).toBe(await dHash(img));
  });
});

describe("logo placement", () => {
  it("detects overlap with a headline box", async () => {
    const { hitsText } = await import("./logo-overlay");
    const r = { left: 40, top: 40, width: 200, height: 80 };
    expect(hitsText(r, 1080, 1080, [{ x: 0.05, y: 0.06, w: 0.8, h: 0.2 }])).toBe(true);
    expect(hitsText(r, 1080, 1080, [{ x: 0.05, y: 0.5, w: 0.8, h: 0.2 }])).toBe(false);
  });
  it("never covers text: busy/text corners skipped", async () => {
    const sharp = (await import("sharp")).default;
    const { overlayLogo } = await import("./logo-overlay");
    const ad = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const logo = await sharp({ create: { width: 300, height: 100, channels: 4, background: "#ffffffff" } }).png().toBuffer();
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const dir = await mkdtemp((await import("node:os")).tmpdir() + "/logo-");
    await writeFile(dir + "/l.png", logo);
    const r = await overlayLogo(ad, dir + "/l.png", { textBoxes: [{ x: 0, y: 0, w: 1, h: 0.3 }], brandHexes: ["#0a2540"] });
    expect(r.corner === "bl" || r.corner === "br").toBe(true);
    expect(r.chip).toBe(true);
  });
});

describe("duplicates and invented UI", () => {
  it("fails a drawn brand name and invented screen UI", () => {
    const r = judge({ ...read, allText: [...read.allText, "B"], screenUi: "other" }, { ...allowed, brandName: "Easefolio" });
    expect(r).toContain("invented screen UI");
    const r2 = judge({ ...read, allText: [...read.allText, "Easefolio"] }, { ...allowed, brandName: "Easefolio" });
    expect(r2.some((x) => x.startsWith("drawn brand name"))).toBe(true);
  });
});

describe("logo source", () => {
  it("rejects favicons and small rasters, never blank", async () => {
    const sharp = (await import("sharp")).default;
    const { crispLogo } = await import("./logo-source");
    const { overlayLogo } = await import("./logo-overlay");
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const dir = await mkdtemp((await import("node:os")).tmpdir() + "/logo-");
    await writeFile(dir + "/favicon.png", await sharp({ create: { width: 300, height: 300, channels: 4, background: "#000000ff" } }).png().toBuffer());
    await writeFile(dir + "/small.png", await sharp({ create: { width: 64, height: 64, channels: 4, background: "#000000ff" } }).png().toBuffer());
    expect(await crispLogo(dir + "/favicon.png")).toBeNull();
    expect(await crispLogo(dir + "/small.png")).toBeNull();
    const ad = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const r = await overlayLogo(ad, dir + "/small.png", { brandName: "Easefolio" });
    expect(r.corner).not.toBeNull();
  });
  it("white logo on white ad gets a dark chip, not blank", async () => {
    const sharp = (await import("sharp")).default;
    const { overlayLogo } = await import("./logo-overlay");
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const dir = await mkdtemp((await import("node:os")).tmpdir() + "/logo-");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect x="10" y="10" width="380" height="100" fill="#fff"/><rect x="40" y="40" width="80" height="40" fill="#ddd"/></svg>';
    await writeFile(dir + "/logo.svg", svg);
    const ad = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const r = await overlayLogo(ad, dir + "/logo.svg", { brandHexes: ["#ffffff"] });
    expect(r.chip).toBe(true);
  });
});

describe("logo always present", () => {
  it("places a logo even when every corner has text", async () => {
    const sharp = (await import("sharp")).default;
    const { overlayLogo } = await import("./logo-overlay");
    const ad = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const r = await overlayLogo(ad, null, { brandName: "Yaatuber", textBoxes: [{ x: 0, y: 0, w: 1, h: 1 }] });
    expect(r.corner).not.toBeNull();
    expect(r.kind).toBe("wordmark");
    expect(r.box).not.toBeNull();
  });
});

describe("wide lockup logos", () => {
  it("accepts a 148x67 wide lockup and rejects a square favicon-size mark", async () => {
    const { usableLogo, shortBrandName } = await import("./logo-source");
    expect(usableLogo(148, 67).ok).toBe(true);
    expect(usableLogo(148, 67).maxW).toBe(296);
    expect(usableLogo(400, 60).ok).toBe(true);
    expect(usableLogo(64, 64).ok).toBe(false);
    expect(usableLogo(300, 300, "/x/favicon.png").ok).toBe(false);
    expect(shortBrandName("Perr Daht Window Fashions & Design", "perrdaht.com")).toBe("Perr Daht");
    expect(shortBrandName("Perr Daht Window Fashions & Design")).toBe("Perr Daht");
  });
  it("places a wide lockup file (not the wordmark) at a readable width", async () => {
    const sharp = (await import("sharp")).default;
    const { overlayLogo } = await import("./logo-overlay");
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const dir = await mkdtemp((await import("node:os")).tmpdir() + "/logo-");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="148" height="67"><rect x="4" y="8" width="30" height="50" fill="#333"/><rect x="44" y="20" width="100" height="24" fill="#333"/></svg>';
    await writeFile(dir + "/lockup.png", await sharp(Buffer.from(svg)).png().toBuffer());
    const ad = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const r = await overlayLogo(ad, dir + "/lockup.png", { brandName: "Perr Daht Window Fashions & Design" });
    expect(r.kind).toBe("file");
    expect((r.box?.w ?? 0) * 1080).toBeGreaterThan(160);
  });
});

describe("invented products and logo corner", () => {
  it("fails a product not in the references", () => {
    expect(judge({ ...read, productNotInReferences: true }, allowed)).toContain("product_not_in_references");
  });
  it("prompt forbids invented hardware", () => {
    expect(buildComposedPrompt({ spec, brand, refLabels: ["real product photo"], style: "lean" })).toMatch(/Do not invent products/);
  });
  it("keeps top-left on a calm light scene, without a chip for a dark logo", async () => {
    const sharp = (await import("sharp")).default;
    const { overlayLogo } = await import("./logo-overlay");
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const dir = await mkdtemp((await import("node:os")).tmpdir() + "/logo-");
    await writeFile(dir + "/l.png", await sharp({ create: { width: 400, height: 120, channels: 4, background: "#1a1a1aff" } }).png().toBuffer());
    const ad = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#f4efe6" } }).png().toBuffer();
    const r = await overlayLogo(ad, dir + "/l.png", { textBoxes: [{ x: 0.1, y: 0.5, w: 0.8, h: 0.2 }] });
    expect(r.corner).toBe("tl");
    expect(r.chip).toBe(false);
  });
});

describe("static fixes v2", () => {
  it("keeps short full brand names and drops taglines", async () => {
    const { shortBrandName } = await import("./logo-source");
    expect(shortBrandName("Greater Boston HVAC", "greaterbostonhvac.com")).toBe("Greater Boston HVAC");
    expect(shortBrandName("Greater Boston HVAC")).toBe("Greater Boston HVAC");
    expect(shortBrandName("Joe's Stone Crab | Miami Beach")).toBe("Joe's Stone Crab");
  });
  it("flags fake UI and misspelled words", async () => {
    const { judge } = await import("./verify-text");
    const base = { headline: "They say they can fix our roof", cta: "Get a quote", allText: ["They say they can fix our roof"], incidentalText: [], hasQuoteOrAttribution: false, hasBadgeOrStars: false, hasHumanFace: false, hasThirdPartyBrand: false, hasFrame: false, topLeftEmpty: true, textBoxes: [], screenUi: "none" as const, productNotInReferences: false, hasInventedData: false, hasFakeUi: false, misspelledWords: [] as string[] };
    const a = { headline: "They say they can fix our roof", cta: "Get a quote", brandName: "X" };
    expect(judge(base, a)).toEqual([]);
    expect(judge({ ...base, misspelledWords: ["sav"] }, a)).toContain('misspelled "sav"');
    expect(judge({ ...base, hasFakeUi: true }, a).length).toBe(1);
  });
});

import { chipForLogo, legibleShare } from "./logo-overlay";
describe("logo chip for mixed-tone logos", () => {
  it("does not pick a dark chip when the logo has dark lettering", () => {
    const lums = [...Array(40).fill(250), ...Array(60).fill(20)]; // white icon + dark text
    const chip = chipForLogo(lums, ["#000000", "#8a1c1c"]);
    expect(chip).not.toBe("#000000");
    expect(chip).not.toBe("#111111");
  });
  it("measures legible share", () => {
    expect(legibleShare([10, 20, 240], 255)).toBeCloseTo(2 / 3);
  });
});
