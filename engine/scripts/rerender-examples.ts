// Re-render the latest run's static Ads for given domains in a workspace (dev DB + bucket) with the current renderer.
// Usage: npx tsx scripts/rerender-examples.ts <workspaceId> domain1 domain2 ...
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { AdSpec } from "../../src/lib/ads/contracts";
import type { AIProvider } from "../src/providers/types";
import { launchRenderBrowser, renderStaticAdWith } from "../src/render/static/index";
import type { BrandKit } from "../src/render/static/types";
import { createStorage } from "../src/storage/s3";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const [ws, ...domains] = process.argv.slice(2);
const OUT = process.env.RERENDER_DIR ?? "/Users/groot/.ezcoder/goals/website2ads/quality/templates";
const db = new PrismaClient();
const storage = createStorage();
const noImages: AIProvider = { name: "codex", text: () => Promise.reject(new Error("x")), image: () => Promise.reject(new Error("no imagery")), health: () => Promise.resolve({ ok: true }) };
const browser = await launchRenderBrowser();
// Arg "domain@runId" pins a specific run instead of the latest one.
for (const arg of domains) {
  const [domain = arg, pinnedRun] = arg.split("@");
  const bp = await db.brandProfile.findFirst({ where: { workspaceId: ws, domain }, orderBy: { updatedAt: "desc" } });
  if (!bp) { console.log(domain, "no brand profile"); continue; }
  const run = pinnedRun ? await db.adRun.findUnique({ where: { id: pinnedRun } }) : await db.adRun.findFirst({ where: { workspaceId: ws, brandProfileId: bp.id }, orderBy: { createdAt: "desc" } });
  const ads = run ? await db.ad.findMany({ where: { runId: run.id, kind: "static" }, orderBy: { index: "asc" } }) : [];
  const dir = join(OUT, domain);
  await mkdir(join(dir, "in"), { recursive: true });
  const fetchTo = async (key: string) => { const p = join(dir, "in", key.split("/").pop() ?? "x"); await writeFile(p, await storage.get(key)); return p; };
  const assets = [];
  for (const a of bp.assets as Array<BrandKit["assets"][number]>) { try { assets.push({ ...a, path: await fetchTo(a.key) }); } catch { /* missing */ } }
  const kit: BrandKit = { brandName: bp.name ?? domain, colors: bp.colors as BrandKit["colors"], fonts: bp.fonts as BrandKit["fonts"], logoPath: bp.logoKey ? await fetchTo(bp.logoKey) : null, assets };
  const cells: string[] = [];
  const usedTemplates: string[] = [];
  const usedFields: string[] = [];
  for (const ad of ads) {
    const vb = (ad.visualBrief ?? {}) as Partial<AdSpec["visual"]>;
    const spec: AdSpec = { index: ad.index, kind: "static", awareness: ad.awareness, angle: ad.angle, hook: ad.hook, headline: ad.headline, body: ad.body ?? undefined, cta: ad.cta ?? undefined,
      claims: ad.claims as AdSpec["claims"], visual: { concept: vb.concept ?? "", assetKeys: vb.assetKeys ?? [], layout: vb.layout ?? "", generateImagery: false } };
    try {
      const res = await renderStaticAdWith(browser, { spec, brand: kit, ratios: ["1:1"], workDir: join(dir, "out"), provider: noImages, usedTemplates, usedFields });
      if (res.reports[0]?.template) usedTemplates.push(res.reports[0].template);
      if (res.reports[0]?.field) usedFields.push(res.reports[0].field);
      const f = res.files.find((x) => x.mime === "image/jpeg");
      if (f) cells.push(`<figure><img src="data:image/jpeg;base64,${(await readFile(f.path)).toString("base64")}"/><figcaption>#${ad.index} ${vb.layout ?? ""} → ${res.reports[0]?.template}</figcaption></figure>`);
    } catch (e) { cells.push(`<figure><figcaption>#${ad.index} ${vb.layout}: ${e instanceof Error ? e.message.slice(0, 160) : e}</figcaption></figure>`); }
  }
  const page = await browser.newPage({ viewport: { width: 5 * 320 + 40, height: Math.ceil(cells.length / 5) * 380 + 40 } });
  await page.setContent(`<body style="margin:0;background:#1b1c20;color:#ddd;font:15px system-ui"><main style="display:grid;grid-template-columns:repeat(5,300px);gap:20px;padding:20px">${cells.join("")}</main><style>figure{margin:0}img{width:300px;display:block}</style></body>`);
  await page.screenshot({ path: join(OUT, `sheet-${domain}.jpg`), type: "jpeg", quality: 85, fullPage: true });
  await page.close();
  console.log(domain, ads.length, "ads");
}
await browser.close();
await db.$disconnect();
