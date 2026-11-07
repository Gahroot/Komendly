// Renders every image-led template x 3 ratios for real crawled sites (see crawl-site-images.ts).
// Usage: npx tsx scripts/render-sites.ts [onlyDomain]
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import type { AdSpec, Ratio } from "../../src/lib/ads/contracts";
import { RATIOS } from "../../src/lib/ads/contracts";
import type { AIProvider } from "../src/providers/types";
import { IMAGE_TEMPLATE_IDS, imageLayoutsFor, launchRenderBrowser, renderStaticAdWith, type ImageTemplateId } from "../src/render/static/index";
import type { BrandKit } from "../src/render/static/types";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const ROOT = "/Users/groot/.ezcoder/goals/website2ads/render-preview";
const noImages: AIProvider = {
  name: "codex",
  text: () => Promise.reject(new Error("unused")),
  image: () => Promise.reject(new Error("no generated imagery in site previews")),
  health: () => Promise.resolve({ ok: true }),
};

type Copy = Pick<AdSpec, "awareness" | "headline" | "hook"> & { body?: string; cta?: string; keys?: string[]; claims?: AdSpec["claims"] };
interface Site { domain: string; kit: (dir: string) => BrandKit; copy: Record<ImageTemplateId, Copy> }

type Asset = BrandKit["assets"][number];
const a = (dir: string, file: string, kind: Asset["kind"], width: number, height: number, sourceUrl: string, hasFace = false): Asset =>
  ({ key: file, path: join(dir, file), kind, width, height, sourceUrl, hasFace });

const SITES: Site[] = [
  {
    domain: "maxteriorslighting.com",
    kit: (d) => {
      const u = "https://maxteriorslighting.com/wp-content/uploads/2026/";
      return {
        brandName: "Maxteriors Exterior Lighting", logoPath: join(d, "img-01.png"),
        colors: [{ hex: "#EFB708", role: "primary" }, { hex: "#0E0E0E", role: "background" }, { hex: "#FFFFFF", role: "text" }],
        fonts: [{ family: "Golos Text", role: "heading" }, { family: "Golos Text", role: "body" }],
        assets: [
          a(d, "img-17.jpg", "photo", 1600, 1200, `${u}07/Landscape-Lighting-Rochester.jpg`),
          a(d, "img-18.jpg", "photo", 1600, 1067, `${u}07/Christmas-Lights-Birmingham1.jpg`),
          a(d, "img-02.jpg", "photo", 1320, 1232, `${u}07/Landscape-Lighting-Northville1.jpg`),
          a(d, "img-03.jpg", "photo", 768, 511, `${u}07/Landscape-Lighting-Troy-MI.jpeg`),
          a(d, "img-05.jpg", "photo", 768, 512, `${u}07/Christmas-Lights-Birmingham2.jpg`),
          a(d, "img-06.jpg", "photo", 768, 576, `${u}07/Bistro-Cafe-Lighting.jpg`),
          a(d, "img-11.jpg", "photo", 800, 533, `${u}08/Landscape-Lighting-1-Before_1.jpg`),
          a(d, "img-12.jpg", "photo", 800, 533, `${u}08/Landscape-Lighting-1-After_1.jpg`),
          a(d, "img-15.jpg", "photo", 768, 768, `${u}07/Max-Sherrod.jpeg`, true),
          a(d, "screenshot-desktop.jpg", "screenshot", 2160, 1350, "https://maxteriorslighting.com/"),
          a(d, "screenshot-mobile.jpg", "screenshot", 1170, 2532, "https://maxteriorslighting.com/"),
        ],
      };
    },
    copy: {
      photo_fullbleed: { awareness: "problem_aware", hook: "You pull into the driveway and the house is just dark.", headline: "Come home to a house that glows after sunset", body: "Custom landscape and roofline lighting, planned for your property.", cta: "Request a quote" },
      photo_split: { awareness: "problem_aware", hook: "Another December on the ladder.", headline: "No more ladders every December", body: "Permanent LED lighting for holidays and every day, run from your phone.", cta: "Request a quote" },
      product_spotlight: { awareness: "solution_aware", hook: "", headline: "Lighting that makes the whole yard feel bigger", cta: "See our work" },
      photo_collage: { awareness: "solution_aware", hook: "", headline: "Every path, tree and roofline, planned for your home", body: "Landscape, permanent and holiday lighting in Metro Detroit.", cta: "See our work" },
      screenshot_device: { awareness: "product_aware", hook: "", headline: "Change colors and schedules from your phone", body: "Smart lighting control for holidays, parties and ordinary evenings.", cta: "Request a quote" },
      photo_caption: { awareness: "problem_aware", hook: "", headline: "“We put so much into this yard and nobody sees it after 7pm.”", body: "Landscape lighting gives it back the evening.", cta: "Request a quote" },
      photo_before_after: { awareness: "problem_aware", hook: "", headline: "Same house. After sunset.", body: "Custom landscape lighting, designed around your home.", cta: "Request a quote" },
    },
  },
  {
    domain: "back2sleepnow.com",
    kit: (d) => ({
      brandName: "3:17", logoPath: null,
      colors: [{ hex: "#D4B06A", role: "primary" }, { hex: "#15110E", role: "background" }, { hex: "#F7F1E6", role: "text" }],
      fonts: [{ family: "Cormorant Garamond", role: "heading" }, { family: "Figtree", role: "body" }],
      assets: [
        a(d, "hero-full.webp", "product", 1200, 1000, "https://back2sleepnow.com/img/hero-bottle-night.webp"),
        a(d, "img-01.jpg", "photo", 700, 584, "https://back2sleepnow.com/img/hero-bottle-night-700.webp"),
        a(d, "screenshot-desktop.jpg", "screenshot", 2160, 1350, "https://back2sleepnow.com/"),
        a(d, "screenshot-mobile.jpg", "screenshot", 1170, 2532, "https://back2sleepnow.com/"),
      ],
    }),
    copy: {
      photo_fullbleed: { awareness: "problem_aware", hook: "", headline: "“3:17 again. Wide awake, and the alarm goes at six.”", body: "A middle of the night sleep shot, made for women in menopause.", cta: "Join the waitlist" },
      photo_split: { awareness: "problem_aware", hook: "", headline: "Made by a woman who spent 15 years awake at 3 a.m.", body: "The first batch is 2,500 bottles, targeted for December 1, 2026.", cta: "Be the first" },
      product_spotlight: { awareness: "solution_aware", hook: "", headline: "The middle of the night sleep shot", body: "Made for women in menopause. Join the waitlist for the first batch.", cta: "Join the waitlist" },
      photo_collage: { awareness: "problem_aware", hook: "", headline: "For the nights you're awake doing the maths on your sleep", cta: "Join the waitlist" },
      screenshot_device: { awareness: "solution_aware", hook: "", headline: "Follow along as we make it", body: "Join the waitlist to be first in line for the first batch.", cta: "Be the first" },
      photo_caption: { awareness: "problem_aware", hook: "", headline: "“Lying here at 3am, counting how many hours I'd get if I fell asleep now.”", body: "3:17 is made for exactly this moment.", cta: "Join the waitlist" },
      photo_before_after: { awareness: "problem_aware", hook: "Awake at 3:17, again.", headline: "Back to sleep, not up for the day", cta: "Join the waitlist" },
    },
  },
  {
    domain: "wearedobi.com",
    kit: (d) => {
      const u = "https://media-production.lp-cdn.com/media/";
      return {
        brandName: "DOBI Real Estate", logoPath: join(d, "img-02.png"),
        colors: [{ hex: "#AD6A37", role: "primary" }, { hex: "#FFFFFF", role: "background" }, { hex: "#000000", role: "text" }],
        fonts: [{ family: "Oswald", role: "heading" }, { family: "Roboto", role: "body" }],
        assets: [
          a(d, "img-03.jpg", "photo", 1920, 2304, `${u}9248bfb6`),
          a(d, "img-04.jpg", "photo", 1920, 2304, `${u}5e232488`),
          a(d, "img-09.jpg", "photo", 2021, 1536, `${u}listing-1`),
          a(d, "img-05.jpg", "photo", 1920, 1279, `${u}fdb517f1`),
          a(d, "img-15.jpg", "photo", 1920, 1281, `${u}eed73018`),
          a(d, "img-21.jpg", "photo", 1920, 1200, `${u}bmyyrmiflfcdeiduczan`),
          a(d, "img-08.jpg", "photo", 1200, 800, `${u}listing-2`),
          a(d, "img-06.jpg", "photo", 960, 960, `${u}ab1d8748`, true),
          a(d, "screenshot-desktop.jpg", "screenshot", 2160, 1350, "https://wearedobi.com/"),
          a(d, "screenshot-mobile.jpg", "screenshot", 1170, 2532, "https://wearedobi.com/"),
        ],
      };
    },
    copy: {
      photo_fullbleed: { awareness: "problem_aware", hook: "", headline: "“Eleven showings in, and none of them felt like home.”", body: "Explore homes across Oakland County and beyond with a DOBI agent.", cta: "Start exploring" },
      photo_split: { awareness: "problem_aware", hook: "", headline: "What is our house actually worth right now?", body: "Get a free home valuation from a local DOBI agent.", cta: "Get my valuation", keys: ["img-06.jpg"] },
      product_spotlight: { awareness: "solution_aware", hook: "", headline: "Homes that check every box", cta: "View listings" },
      photo_collage: { awareness: "solution_aware", hook: "", headline: "Start exploring homes that check every box", body: "Featured listings from Ann Arbor to Birmingham.", cta: "View listings" },
      screenshot_device: { awareness: "solution_aware", hook: "", headline: "Every county you're considering, in one search", body: "Oakland, Washtenaw, Livingston, Macomb, Wayne and Lapeer.", cta: "Search homes" },
      photo_caption: { awareness: "product_aware", hook: "", headline: "“Knowledgeable, patient, honest, very helpful.”", body: "What one DOBI client said about their agent.", cta: "Meet our agents", claims: [{ claim: "Knowledgeable, patient, honest, very helpful, easy-going and confident in the competitive market", sourceUrl: "https://wearedobi.com/" }] },
      photo_before_after: { awareness: "problem_aware", hook: "", headline: "Sell for more, with less guessing", cta: "Get my valuation" },
    },
  },
];

async function shot(browser: Browser, html: string, width: number, height: number, path: string) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: "load" });
  await writeFile(path, await page.screenshot({ type: "jpeg", quality: 85 }));
  await page.close();
}

const only = process.argv[2];
const browser = await launchRenderBrowser();
const problems: string[] = [];
for (const site of SITES.filter((s) => !only || s.domain === only)) {
  const dir = join(ROOT, "sites", site.domain);
  if (!existsSync(dir)) { problems.push(`${site.domain}: not crawled`); continue; }
  const kit = site.kit(dir);
  kit.assets = kit.assets.filter((x) => existsSync(x.path));
  const rows: string[] = [];
  let index = 0;
  for (const id of IMAGE_TEMPLATE_IDS) {
    const c = site.copy[id];
    const spec: AdSpec = { index: index++, kind: "static", awareness: c.awareness, angle: id, hook: c.hook, headline: c.headline, body: c.body, cta: c.cta, claims: c.claims ?? [],
      visual: { concept: id, assetKeys: c.keys ?? [], layout: id, generateImagery: false } };
    try {
      const res = await renderStaticAdWith(browser, { spec, brand: kit, ratios: [...RATIOS] as Ratio[], workDir: join(ROOT, "sites-out", site.domain), provider: noImages });
      const cells: string[] = [];
      for (const f of res.files.filter((x) => x.mime === "image/jpeg")) {
        const rep = res.reports.find((r) => r.ratio === f.ratio);
        const note = `${rep?.template ?? "?"}${rep?.contrast ? ` · scrim ${rep.contrast.scrim.toFixed(2)} · ${Object.values(rep.contrast.contrast).map((v) => v.toFixed(1)).join("/")}:1` : ""}`;
        cells.push(`<figure><img src="data:image/jpeg;base64,${(await readFile(f.path)).toString("base64")}"/><figcaption>${f.ratio} · ${note}</figcaption></figure>`);
      }
      rows.push(`<h2>${id}</h2><div class="row">${cells.join("")}</div>`);
    } catch (e) {
      problems.push(`${site.domain}/${id}: ${e instanceof Error ? e.message : String(e)}`);
      rows.push(`<h2>${id}: FAILED</h2>`);
    }
  }
  const html = `<body style="margin:0;background:#1b1c20;font:20px system-ui;color:#ddd;padding:24px"><style>h2{font-size:24px;margin:18px 0 8px}.row{display:flex;gap:20px;align-items:flex-start}figure{margin:0}img{height:560px;display:block;border-radius:6px}figcaption{padding:6px 0;max-width:420px}</style>
    <h1 style="font-size:30px">${site.domain} · supports: ${imageLayoutsFor(kit).join(", ")}</h1>${rows.join("")}</body>`;
  const width = Math.round(560 * 0.8 + 560 + 560 * 0.5625 + 2 * 20 + 48);
  await shot(browser, html, width, IMAGE_TEMPLATE_IDS.length * 640 + 120, join(ROOT, `contact-sheet-site-${site.domain}.jpg`));
}
await browser.close();
console.log(problems.length ? `Problems:\n${problems.join("\n")}` : "All site renders OK.");
