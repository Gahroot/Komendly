// Renders sample EZMotion ads from two real public websites' own assets.
// Usage: npx tsx scripts/motion-preview.ts [--llm] [--ratios 9:16,1:1] [--only plausible]
// Output: /Users/groot/.ezcoder/goals/website2ads/motion-preview/<site>/
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import type { AdSpec, Ratio } from "../../src/lib/ads/contracts";
import { renderMotionAd } from "../src/modules/ezmotion/index";
import { run } from "../src/modules/ezmotion/runtime";
import { createProvider } from "../src/providers/index";
import type { AIProvider } from "../src/providers/types";
import type { BrandKit } from "../src/render/static/types";

const OUT = join(homedir(), ".ezcoder/goals/website2ads/motion-preview");
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ratios = (opt("--ratios") ?? "9:16,1:1").split(",") as Ratio[];

interface Sample {
  id: string;
  url: string;
  hook: string;
  headline: string;
  cta: string;
  /** Candidate claims; only those found verbatim on the page are used (never invented). */
  claims: string[];
}

const SAMPLES: Sample[] = [
  {
    id: "plausible",
    url: "https://plausible.io",
    hook: "Why do I need a cookie banner just to count visitors?",
    headline: "Simple, privacy-friendly website analytics",
    cta: "Start free trial",
    claims: ["No cookies", "Made and hosted in the EU", "Open source", "Lightweight"],
  },
  {
    id: "cal",
    url: "https://cal.com",
    hook: "\u201cWhat time works for you?\u201d Five emails later\u2026",
    headline: "Scheduling infrastructure for absolutely everyone",
    cta: "Get started",
    claims: ["Free for individuals", "Open source", "Connect your calendar"],
  },
];

async function capture(s: Sample, dir: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await page.addInitScript("window.__name = (f) => f");
    await page.goto(s.url, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    // Dismiss obvious cookie banners so the screenshot shows the product.
    for (const t of ["Accept", "Accept all", "Got it", "OK"]) await page.getByRole("button", { name: t, exact: true }).first().click({ timeout: 500 }).catch(() => undefined);
    const shot = join(dir, "screenshot.png");
    await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1280, height: 2600 }, fullPage: true });
    const info = await page.evaluate(() => {
      const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
      const toHex = (c: string | undefined) => {
        const m = c?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
        if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null;
        return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
      };
      const bodyBg = toHex(cs(document.body)?.backgroundColor) ?? "#ffffff";
      const btn = [...document.querySelectorAll("a,button")].map((e) => toHex(cs(e)?.backgroundColor)).filter((h): h is string => !!h && h !== bodyBg);
      const counts = new Map<string, number>();
      for (const h of btn) counts.set(h, (counts.get(h) ?? 0) + 1);
      const primary = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#111111";
      const h1 = document.querySelector("h1");
      const headingFont = (cs(h1)?.fontFamily ?? "").split(",")[0]?.replace(/["']/g, "").trim() ?? "";
      const bodyFont = (cs(document.body)?.fontFamily ?? "").split(",")[0]?.replace(/["']/g, "").trim() ?? "";
      const logoEl = document.querySelector('header a[href="/"] svg, header a[href="/"] img, a[href="/"] svg, a[href="/"] img, header img[alt*="ogo"], img[src*="logo"]');
      let logo: { kind: "svg"; svg: string } | { kind: "img"; src: string } | null = null;
      if (logoEl instanceof SVGSVGElement) {
        const clone = logoEl.cloneNode(true) as SVGSVGElement;
        const color = cs(logoEl)?.color ?? "#000";
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const r = logoEl.getBoundingClientRect();
        if (!clone.getAttribute("width")) clone.setAttribute("width", String(Math.round(r.width)));
        if (!clone.getAttribute("height")) clone.setAttribute("height", String(Math.round(r.height)));
        logo = { kind: "svg", svg: clone.outerHTML.replace(/currentColor/g, color) };
      } else if (logoEl instanceof HTMLImageElement) logo = { kind: "img", src: logoEl.currentSrc || logoEl.src };
      return { bodyBg, primary, headingFont, bodyFont, logo, text: document.body.innerText };
    });
    let logoPath: string | null = null;
    if (info.logo?.kind === "svg") {
      logoPath = join(dir, "logo.svg");
      await writeFile(logoPath, info.logo.svg);
    } else if (info.logo?.kind === "img") {
      const res = await fetch(info.logo.src);
      if (res.ok) {
        logoPath = join(dir, `logo${info.logo.src.includes(".svg") ? ".svg" : ".png"}`);
        await writeFile(logoPath, Buffer.from(await res.arrayBuffer()));
      }
    }
    return { shot, logoPath, ...info };
  } finally {
    await browser.close();
  }
}

/** Stub provider: returns no plan, so the deterministic plan is used. */
const stubProvider: AIProvider = {
  name: "codex",
  text: async () => { throw new Error("stub: no LLM"); },
  image: async () => { throw new Error("stub"); },
  health: async () => ({ ok: true }),
};

async function main() {
  const provider = flag("--llm") ? createProvider("codex") : stubProvider;
  for (const s of SAMPLES.filter((x) => !opt("--only") || x.id === opt("--only"))) {
    const dir = join(OUT, s.id);
    await mkdir(dir, { recursive: true });
    const t0 = Date.now();
    const site = await capture(s, dir);
    const text = site.text.toLowerCase();
    const claims = s.claims.filter((c) => text.includes(c.toLowerCase())).map((claim) => ({ claim, sourceUrl: s.url }));
    const brand: BrandKit = {
      brandName: s.id,
      colors: [{ hex: site.bodyBg, role: "background" }, { hex: site.primary, role: "primary" }],
      fonts: [{ family: site.headingFont, role: "heading" }, { family: site.bodyFont, role: "body" }],
      logoPath: site.logoPath,
      assets: [{ key: "home", sourceUrl: s.url, kind: "screenshot", width: 1280, height: 2600, hasFace: false, path: site.shot }],
    };
    const spec: AdSpec = { index: 0, kind: "motion", awareness: "problem_aware", angle: "pain", hook: s.hook, headline: s.headline, cta: s.cta, claims, visual: { concept: "product walkthrough", assetKeys: ["home"], layout: "motion", generateImagery: false } };
    const capMs = Date.now() - t0;
    const t1 = Date.now();
    const res = await renderMotionAd({ spec, brand, siteUrl: s.url, ratios, workDir: dir, provider, maxSeconds: 14 });
    const renderMs = Date.now() - t1;
    for (const f of res.files) {
      const sheet = f.path.replace(/\.mp4$/, "-sheet.jpg");
      await run("ffmpeg", ["-y", "-v", "error", "-i", f.path, "-vf", `fps=1,scale=${f.width / 4}:-1,tile=7x2`, "-frames:v", "1", sheet]);
    }
    const summary = { site: s.url, captureMs: capMs, renderMs, claimsUsed: claims.map((c) => c.claim), fonts: brand.fonts, colors: brand.colors, files: res.files, poster: res.posterPath, usage: res.usage };
    await writeFile(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  }
}

await main();
