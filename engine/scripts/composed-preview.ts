// Prototype: gpt-image-2 composes whole ads from stored Ad specs (no planner re-run); compares to templates.
// Usage: CODEX_AUTH_FILE=... npx tsx scripts/composed-preview.ts [domain ...]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { AdSpec } from "../../src/lib/ads/contracts";
import { createProvider } from "../src/providers/index";
import { composeAd } from "../src/render/composed/index";
import type { PromptStyle } from "../src/render/composed/prompt";
import { launchRenderBrowser, renderStaticAdWith } from "../src/render/static/index";
import type { BrandKit } from "../src/render/static/types";
import { createStorage } from "../src/storage/s3";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
process.env.CODEX_IMAGE_MAX_CONCURRENT = "3";
const DOMAINS = process.argv.slice(2).length ? process.argv.slice(2) : ["back2sleepnow.com", "maxteriorslighting.com", "yaatuber.com", "prestyj.com", "mariangrout.com"];
const OUT = process.env.PREVIEW_DIR ?? "/Users/groot/.ezcoder/goals/website2ads/quality/composed";
const db = new PrismaClient();
const storage = createStorage();
const provider = createProvider("codex");
const browser = await launchRenderBrowser();
await provider.health(); // warm auth once so concurrent calls do not race the token load
const stats: Array<{ domain: string; ad: number; style: PromptStyle; ms: number; cost: number; headlineOk: boolean; ctaOk: boolean; read: string }> = [];
let limited = false;

async function site(domain: string): Promise<void> {
  const bp = await db.brandProfile.findFirst({ where: { domain }, orderBy: { updatedAt: "desc" } });
  if (!bp) return console.log(domain, "no brand profile");
  const run = await db.adRun.findFirst({ where: { brandProfileId: bp.id, ads: { some: { kind: "static" } } }, orderBy: { createdAt: "desc" } });
  const ads = run ? await db.ad.findMany({ where: { runId: run.id, kind: "static" }, orderBy: { index: "asc" }, take: Number(process.env.PREVIEW_TAKE ?? 2) }) : [];
  const dir = join(OUT, domain);
  await mkdir(join(dir, "in"), { recursive: true });
  const fetchTo = async (key: string) => { const p = join(dir, "in", key.split("/").pop() ?? "x"); await writeFile(p, await storage.get(key)); return p; };
  const assets: BrandKit["assets"] = [];
  for (const a of bp.assets as Array<BrandKit["assets"][number]>) { try { assets.push({ ...a, path: await fetchTo(a.key) }); } catch { /* missing */ } }
  const kit: BrandKit = { brandName: bp.name ?? domain, colors: bp.colors as BrandKit["colors"], fonts: bp.fonts as BrandKit["fonts"], logoPath: bp.logoKey ? await fetchTo(bp.logoKey) : null, assets };
  const rows: string[] = [];
  for (const ad of ads) {
    const vb = (ad.visualBrief ?? {}) as Partial<AdSpec["visual"]>;
    const spec: AdSpec = { index: ad.index, kind: "static", awareness: ad.awareness, angle: ad.angle, hook: ad.hook, headline: ad.headline, body: ad.body ?? undefined, cta: ad.cta ?? undefined,
      claims: ad.claims as AdSpec["claims"], visual: { concept: vb.concept ?? "", assetKeys: vb.assetKeys ?? [], layout: vb.layout ?? "", generateImagery: false } };
    const cells: string[] = [];
    try {
      const res = await renderStaticAdWith(browser, { spec, brand: kit, ratios: ["1:1"], workDir: join(dir, "tpl"), provider: { ...provider, name: "codex", text: provider.text.bind(provider), health: provider.health.bind(provider), image: () => Promise.reject(new Error("no imagery")) } });
      const f = res.files[0];
      if (f) cells.push(`<figure><img src="data:${f.mime};base64,${(await readFile(f.path)).toString("base64")}"/><figcaption>#${ad.index} template</figcaption></figure>`);
    } catch (e) { cells.push(`<figure><figcaption>template failed: ${String(e).slice(0, 120)}</figcaption></figure>`); }
    const results = await Promise.all(((process.env.PREVIEW_STYLES ?? "lean,detailed").split(",") as PromptStyle[]).map(async (style) => {
      if (limited) return `<figure><figcaption>${style}: skipped (limit)</figcaption></figure>`;
      try {
        const r = await composeAd(provider, spec, kit, style);
        const file = join(dir, `ad${ad.index}-${style}.png`);
        await writeFile(file, r.png);
        await writeFile(join(dir, `ad${ad.index}-${style}.prompt.txt`), r.prompt);
        stats.push({ domain, ad: ad.index, style, ms: r.imageMs, cost: r.usage.reduce((a, u) => a + u.costMicros, 0) / 1e6, headlineOk: r.check.ok, ctaOk: r.check.ok, read: r.check.read?.headline ?? "?" });
        return `<figure><img src="data:image/png;base64,${r.png.toString("base64")}"/><figcaption>${style} · ${(r.imageMs / 1000).toFixed(0)}s · headline ${r.check.ok ? "OK" : r.check.reasons.join("; ")}</figcaption></figure>`;
      } catch (e) {
        if (/image limit/i.test(String(e))) limited = true;
        return `<figure><figcaption>${style} failed: ${String(e).slice(0, 160)}</figcaption></figure>`;
      }
    }));
    rows.push(`<section><h3>#${ad.index} “${ad.headline}” / ${ad.cta ?? ""}</h3><div class=r>${[...cells, ...results].join("")}</div></section>`);
  }
  const page = await browser.newPage({ viewport: { width: 3 * 420 + 60, height: 900 } });
  await page.setContent(`<body style="margin:0;background:#1b1c20;color:#ddd;font:14px system-ui;padding:20px">${rows.join("")}<style>.r{display:grid;grid-template-columns:repeat(3,400px);gap:20px}figure{margin:0}img{width:400px;display:block}h3{margin:16px 0 8px}</style></body>`);
  await page.screenshot({ path: join(dir, "contact-sheet.jpg"), type: "jpeg", quality: 85, fullPage: true });
  await page.close();
  console.log(domain, "done");
}

for (const d of DOMAINS) { if (limited) { console.log("STOP: image usage limit"); break; } await site(d); }
await writeFile(join(OUT, "stats.json"), JSON.stringify(stats, null, 2));
const n = stats.length;
console.log(`images ${n}, headline accuracy ${stats.filter((s) => s.headlineOk).length}/${n}, cta ${stats.filter((s) => s.ctaOk).length}/${n}, avg ${(stats.reduce((a, s) => a + s.ms, 0) / Math.max(1, n) / 1000).toFixed(1)}s`);
for (const s of stats) console.log(JSON.stringify(s));
await browser.close();
await db.$disconnect();
