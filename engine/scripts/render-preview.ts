// Renders every static template x 3 ratios for 2 sample brands + contact sheets.
// Usage: npx tsx scripts/render-preview.ts [outDir]
// Real imagery: CODEX_AUTH_FILE=... with engine-core's codex provider present -> 3 templates use provider.image.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import type { AdSpec, Ratio } from "../../src/lib/ads/contracts";
import { RATIOS } from "../../src/lib/ads/contracts";
import type { AIProvider } from "../src/providers/types";
import { launchRenderBrowser, renderStaticAdWith, StaticRenderError, TEMPLATE_IDS, type TemplateId } from "../src/render/static/index";
import type { BrandKit } from "../src/render/static/types";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const OUT = process.argv[2] ?? "/Users/groot/.ezcoder/goals/website2ads/render-preview";

async function shot(browser: Browser, html: string, width: number, height: number, path: string): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: "load" });
  const buf = await page.screenshot({ type: "png", omitBackground: html.includes("transparent") });
  await page.close();
  await writeFile(path, buf);
  return buf;
}

/** Stub provider: abstract placeholder imagery (no text, no people). */
export function stubProvider(browser: Browser, dir: string): AIProvider {
  let n = 0;
  return {
    name: "codex",
    async text() { throw new Error("stub provider has no text()"); },
    async image(req) {
      const [w = 1024, h = 1024] = req.size.split("x").map(Number);
      const hue = (n++ * 67) % 360;
      const html = `<body style="margin:0"><div style="width:${w}px;height:${h}px;background:
        radial-gradient(40% 30% at 30% 35%, hsl(${hue} 45% 78%), transparent 70%),
        radial-gradient(50% 40% at 70% 65%, hsl(${hue + 40} 35% 55%), transparent 70%),
        linear-gradient(160deg, hsl(${hue} 25% 70%), hsl(${hue + 30} 30% 32%))"></div></body>`;
      const png = await shot(browser, html, w, h, join(dir, `stub-${n}.png`));
      return { png, width: w, height: h, usage: { costMicros: 0, images: 1, latencyMs: 1 } };
    },
    async health() { return { ok: true }; },
  };
}

interface SampleBrand { id: string; kit: BrandKit; specs: Partial<Record<TemplateId, Omit<AdSpec, "index" | "kind" | "visual"> & { generate?: boolean; asset?: boolean }>> }

async function makeAssets(browser: Browser, dir: string) {
  await mkdir(dir, { recursive: true });
  const logoLight = join(dir, "tidybooks-logo.png");
  await shot(browser, `<body style="margin:0;background:transparent"><div style="display:flex;align-items:center;gap:14px;font:800 52px 'Helvetica Neue',Arial;color:#0F766E;padding:6px 10px;width:max-content">
    <div style="width:58px;height:58px;border-radius:16px;background:#0F766E;display:flex;align-items:center;justify-content:center"><div style="width:26px;height:26px;border:7px solid #F7F5F0;border-radius:6px"></div></div>tidybooks</div></body>`, 380, 72, logoLight);
  const logoDark = join(dir, "nightshift-logo.png");
  await shot(browser, `<body style="margin:0;background:transparent"><div style="display:flex;align-items:center;gap:14px;font:700 50px Georgia,serif;color:#F3F1EA;padding:6px 10px;width:max-content">
    <div style="width:54px;height:54px;border-radius:50%;background:#F5B83D;box-shadow:inset -16px -6px 0 0 #0B0D17"></div>Nightshift</div></body>`, 380, 72, logoDark);
  const shotLight = join(dir, "tidybooks-app.png");
  await shot(browser, `<body style="margin:0;font-family:'Helvetica Neue',Arial;background:#EEF4F2"><div style="padding:60px">
    <div style="background:#fff;border-radius:28px;box-shadow:0 20px 50px rgba(0,0,0,.08);padding:44px">
    <div style="font-size:30px;color:#5b6b68">March receipts</div><div style="font-size:72px;font-weight:800;color:#13201E;margin:10px 0 30px">All matched</div>
    ${["Figma subscription", "Train to client", "Coworking day pass", "Adobe CC"].map((t) => `<div style="display:flex;justify-content:space-between;font-size:30px;padding:22px 0;border-top:2px solid #eef0ef;color:#13201E"><span>${t}</span><span style="color:#0F766E;font-weight:700">Matched ✓</span></div>`).join("")}
    </div></div></body>`, 1000, 900, shotLight);
  const shotDark = join(dir, "nightshift-app.png");
  await shot(browser, `<body style="margin:0;font-family:'Helvetica Neue',Arial;background:#12152A;color:#F3F1EA"><div style="padding:60px">
    <div style="font-size:30px;opacity:.7">Tonight</div><div style="font-size:84px;font-weight:700;margin:6px 0 40px">Wind down 22:40</div>
    <div style="display:flex;gap:16px;align-items:flex-end;height:360px">${[40, 65, 52, 80, 72, 90, 60].map((h) => `<div style="flex:1;height:${h}%;border-radius:14px;background:linear-gradient(#F5B83D,#8a6a2a)"></div>`).join("")}</div></div></body>`, 1000, 640, shotDark);
  return { logoLight, logoDark, shotLight, shotDark };
}

function lightSpecs(): SampleBrand["specs"] {
  const src = "https://tidybooks.example/";
  return {
    quote_thought: { awareness: "problem_aware", angle: "private thought", hook: "It's 11pm and I'm still matching receipts", headline: "“I became a freelancer to design, not to chase receipts at 11pm.”", body: "Tidybooks matches every receipt to its transaction while you work.", cta: "Try it free", claims: [] },
    hero_product: { awareness: "solution_aware", angle: "show the product", hook: "Snap it, forget it", headline: "Your receipts, matched before you open your laptop", body: "Forward a receipt or snap a photo. Tidybooks files it.", cta: "See how it works", claims: [], asset: true },
    before_after: { awareness: "problem_aware", angle: "contradiction", hook: "A shoebox of receipts and a sinking feeling every April", headline: "Every expense filed the day it happens", cta: "Start free", claims: [] },
    ui_card: { awareness: "solution_aware", angle: "rebuilt UI", hook: "", headline: "March, done. Without a spreadsheet.", body: "Figma subscription matched. Train to client matched. Coworking pass matched.", cta: "Try Tidybooks", claims: [] },
    chat_moment: { awareness: "problem_aware", angle: "text to accountant", hook: "Sorry, I still haven't found the receipts from Q2…", headline: "Never send that text to your accountant again", body: "No worries, Tidybooks already sent them over 👍", cta: "Get started", claims: [] },
    notification: { awareness: "problem_aware", angle: "moment", hook: "Receipt from Adobe matched to your business card. Nothing to do.", headline: "Bookkeeping that happens in the background", cta: "Try it free", claims: [], generate: true },
    pain_list: { awareness: "problem_aware", angle: "pains", hook: "", headline: "Sound familiar?", body: "Receipts in five different inboxes. A spreadsheet you stopped updating in February. Guessing what you can claim. Dreading the email from your accountant.", cta: "Fix it in 10 minutes", claims: [] },
    testimonial: { awareness: "product_aware", angle: "proof", hook: "", headline: "What freelancers tell us", cta: "Join them", claims: [{ claim: "I used to lose a whole Sunday every month. Now I just check it's green.", sourceUrl: src }] },
    offer_card: { awareness: "most_aware", angle: "offer", hook: "", headline: "Your first month of bookkeeping is on us", body: "Connect your bank, forward your receipts, cancel anytime.", cta: "Claim free month", claims: [] },
    problem_scene: { awareness: "problem_aware", angle: "scene", hook: "", headline: "The kitchen table shouldn't be your filing cabinet", body: "Let Tidybooks file every receipt for you.", cta: "Try it free", claims: [], generate: true },
    stat_card: { awareness: "product_aware", angle: "stat", hook: "", headline: "Spend your evenings on anything but receipts", cta: "Start free", claims: [{ claim: "12,000+ freelancers use Tidybooks every month", sourceUrl: src }] },
    founder_note: { awareness: "solution_aware", angle: "founder note", hook: "", headline: "We built this after losing a tax deduction to a faded receipt", body: "So we made something that keeps every receipt safe the moment you get it. No shoebox, no spreadsheet, no 11pm panic.", cta: "Read our story", claims: [] },
    minimal_type: { awareness: "problem_aware", angle: "minimal", hook: "", headline: "Stop doing your books at midnight.", cta: "Try Tidybooks free", claims: [] },
  };
}

function darkSpecs(): SampleBrand["specs"] {
  const src = "https://nightshift.example/";
  return {
    quote_thought: { awareness: "problem_aware", angle: "private thought", hook: "", headline: "“If I fall asleep right now, I'll still get five hours.”", body: "Nightshift helps shift workers sleep on any schedule.", cta: "Try tonight", claims: [] },
    hero_product: { awareness: "solution_aware", angle: "product", hook: "", headline: "A sleep plan that follows your rota, not 9 to 5", body: "Add your shifts. Nightshift plans when to sleep, nap and see light.", cta: "Build my plan", claims: [], asset: true },
    before_after: { awareness: "problem_aware", angle: "contradiction", hook: "Wide awake at 9am after a twelve-hour night shift", headline: "Asleep within the hour, even after nights", cta: "Try it free", claims: [] },
    ui_card: { awareness: "solution_aware", angle: "UI", hook: "", headline: "Tonight's plan, already worked out", body: "Dim the lights at 06:30. Sleep 07:15 to 14:45. Short nap before your next shift.", cta: "Get my plan", claims: [] },
    chat_moment: { awareness: "problem_aware", angle: "text", hook: "Can't make dinner Sunday, I'll be a zombie after my nights 😩", headline: "Your rota shouldn't cancel your life", body: "What if you weren't, though?", cta: "Sleep better on nights", claims: [] },
    notification: { awareness: "problem_aware", angle: "moment", hook: "Shift ends in 30 min. Sunglasses on for the drive home.", headline: "Small cues. Real sleep after nights.", cta: "Try tonight", claims: [], generate: true },
    pain_list: { awareness: "problem_aware", angle: "pains", hook: "", headline: "Nights are hard enough", body: "Lying awake while everyone else is at work. Caffeine at 4am just to function. Missing family time because you're exhausted.", cta: "Get your plan", claims: [] },
    testimonial: { awareness: "product_aware", angle: "proof", hook: "", headline: "From a nurse on rotating nights", cta: "Try Nightshift", claims: [{ claim: "First week in years I didn't dread my run of nights.", sourceUrl: src }] },
    offer_card: { awareness: "most_aware", angle: "offer", hook: "", headline: "Sleep better on your next run of nights", body: "Free for 14 days. Built for nurses, drivers and factory crews.", cta: "Start free trial", claims: [] },
    problem_scene: { awareness: "problem_aware", angle: "scene", hook: "", headline: "Daylight at 8am shouldn't mean another sleepless day", cta: "Try Nightshift", claims: [], generate: true },
    stat_card: { awareness: "product_aware", angle: "stat", hook: "", headline: "Plans built around the shifts you actually work", cta: "Build my plan", claims: [{ claim: "4.8 average rating from shift workers in the App Store", sourceUrl: src }] },
    founder_note: { awareness: "solution_aware", angle: "founder note", hook: "", headline: "I worked nights for six years. This is what I wish I'd had.", body: "Generic sleep advice assumes you sleep at night. Nightshift starts from your rota instead.", cta: "Read the story", claims: [] },
    minimal_type: { awareness: "problem_aware", angle: "minimal", hook: "", headline: "Sleep is not optional on night shifts.", cta: "Try Nightshift", claims: [] },
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await launchRenderBrowser();
  const assets = await makeAssets(browser, join(OUT, "_assets"));
  let provider: AIProvider | null = null;
  let realTemplates = new Set<TemplateId>();
  const codexPath = join(import.meta.dirname, "../src/providers/codex.ts");
  if (process.env.CODEX_AUTH_FILE && existsSync(codexPath)) {
    const mod = (await import(codexPath)) as Record<string, unknown>;
    const factory = Object.values(mod).find((v): v is () => AIProvider => typeof v === "function");
    if (factory) { provider = factory(); realTemplates = new Set(["problem_scene", "notification", "hero_product"]); }
  }
  const brands: SampleBrand[] = [
    { id: "light-tidybooks", specs: lightSpecs(), kit: { brandName: "Tidybooks", logoPath: assets.logoLight,
      colors: [{ hex: "#0F766E", role: "primary" }, { hex: "#F7F5F0", role: "background" }, { hex: "#13201E", role: "text" }],
      fonts: [{ family: "Plus Jakarta Sans", role: "heading" }, { family: "Inter", role: "body" }],
      assets: [{ key: "app", sourceUrl: "https://tidybooks.example/", kind: "screenshot", width: 1000, height: 900, hasFace: false, path: assets.shotLight }] } },
    { id: "dark-nightshift", specs: darkSpecs(), kit: { brandName: "Nightshift", logoPath: assets.logoDark,
      colors: [{ hex: "#F5B83D", role: "primary" }, { hex: "#0B0D17", role: "background" }, { hex: "#F3F1EA", role: "text" }],
      fonts: [{ family: "Fraunces", role: "heading" }, { family: "DM Sans", role: "body" }],
      assets: [{ key: "app", sourceUrl: "https://nightshift.example/", kind: "screenshot", width: 1000, height: 640, hasFace: false, path: assets.shotDark }] } },
  ];
  const problems: string[] = [];
  for (const brand of brands) {
    const cells: string[] = [];
    let index = 0;
    for (const id of TEMPLATE_IDS) {
      const s = brand.specs[id];
      if (!s) continue;
      const gen = !!s.generate;
      
      const spec: AdSpec = { ...s, index: index++, kind: "static", visual: { concept: `${s.angle}: ${s.headline}`, assetKeys: s.asset ? ["app"] : [], layout: id, generateImagery: gen,
        imageryPrompt: id === "problem_scene" ? (brand.id.startsWith("light") ? "a cluttered kitchen table at night with paper receipts and a laptop, warm lamp light" : "early morning sun through closed blinds in a quiet bedroom") : undefined } };
      const prov = provider && realTemplates.has(id) ? provider : stubProvider(browser, join(OUT, "_assets"));
      try {
        const res = await renderStaticAdWith(browser, { spec, brand: brand.kit, ratios: [...RATIOS] as Ratio[], workDir: join(OUT, brand.id), provider: prov });
        if (res.template !== id) problems.push(`${brand.id}/${id} fell back to ${res.template}`);
        for (const f of res.files.filter((x) => x.mime === "image/jpeg")) {
          const rep = res.reports.find((r) => r.ratio === f.ratio);
          cells.push(`<figure><img src="data:image/jpeg;base64,${(await readFile(f.path)).toString("base64")}"/><figcaption>${id} · ${f.ratio} · h${rep?.fit.sizes.headline ?? rep?.fit.sizes.quote ?? "?"}px</figcaption></figure>`);
        }
      } catch (e) {
        problems.push(`${brand.id}/${id}: ${e instanceof StaticRenderError ? e.message : String(e)}`);
      }
    }
    const sheet = `<body style="margin:0;background:#1b1c20;font:22px system-ui;color:#ddd"><style>main{display:grid;grid-template-columns:repeat(6,300px);gap:24px;padding:32px;align-items:start}figure{margin:0}img{width:300px;display:block;border-radius:6px}figcaption{padding:6px 0}</style><main>${cells.join("")}</main></body>`;
    const rows = Math.ceil(cells.length / 6);
    await shot(browser, sheet, 6 * 300 + 5 * 24 + 64, rows * 600 + 64, join(OUT, `contact-sheet-${brand.id}.png`));
  }
  await renderPlausible(browser, provider, problems);
  await browser.close();
  console.log(problems.length ? `Problems:\n${problems.join("\n")}` : "All templates rendered without overflow.");
  console.log(`Preview: ${OUT}`);
}

/** Re-render a real run exported to OUT/plausible/run.json (extraction + Ad rows) with its downloaded assets. */
async function renderPlausible(browser: Browser, provider: AIProvider | null, problems: string[]) {
  const dir = join(OUT, "plausible");
  if (!existsSync(join(dir, "run.json"))) return;
  const { ex, ads } = JSON.parse(await readFile(join(dir, "run.json"), "utf8")) as {
    ex: { brandName: string; colors: BrandKit["colors"]; fonts: BrandKit["fonts"]; logoKey: string | null; assets: Omit<BrandKit["assets"][number], "path">[] };
    ads: Array<{ index: number; awareness: AdSpec["awareness"]; angle: string; hook: string; headline: string; body: string | null; cta: string | null; claims: AdSpec["claims"]; visualBrief: AdSpec["visual"] | null }>;
  };
  const local = (key: string) => join(dir, key.split("/").pop() ?? key);
  const kit: BrandKit = { brandName: ex.brandName, colors: ex.colors, fonts: ex.fonts, logoPath: ex.logoKey ? local(ex.logoKey) : null,
    assets: ex.assets.map((a) => ({ ...a, path: local(a.key) })).filter((a) => existsSync(a.path)) };
  const cells: string[] = [];
  for (const ad of [...ads].sort((a, b) => a.index - b.index)) {
    const visual = ad.visualBrief ?? { concept: "", assetKeys: [], layout: "", generateImagery: false };
    const spec: AdSpec = { index: ad.index, kind: "static", awareness: ad.awareness, angle: ad.angle, hook: ad.hook, headline: ad.headline,
      body: ad.body ?? undefined, cta: ad.cta ?? undefined, claims: ad.claims, visual: { ...visual, generateImagery: visual.generateImagery && provider !== null } };
    try {
      const res = await renderStaticAdWith(browser, { spec, brand: kit, ratios: [...RATIOS] as Ratio[], workDir: join(dir, "out"), provider: provider ?? stubProvider(browser, join(OUT, "_assets")) });
      for (const f of res.files.filter((x) => x.mime === "image/jpeg")) {
        cells.push(`<figure><img src="data:image/jpeg;base64,${(await readFile(f.path)).toString("base64")}"/><figcaption>#${ad.index} ${res.template} · ${f.ratio}</figcaption></figure>`);
      }
    } catch (e) {
      problems.push(`plausible/#${ad.index}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const sheet = `<body style="margin:0;background:#1b1c20;font:22px system-ui;color:#ddd"><style>main{display:grid;grid-template-columns:repeat(6,300px);gap:24px;padding:32px;align-items:start}figure{margin:0}img{width:300px;display:block;border-radius:6px}figcaption{padding:6px 0}</style><main>${cells.join("")}</main></body>`;
  await shot(browser, sheet, 6 * 300 + 5 * 24 + 64, Math.ceil(cells.length / 6) * 600 + 64, join(OUT, "contact-sheet-plausible.png"));
}

await main();
