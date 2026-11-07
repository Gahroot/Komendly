// Re-render the motion ad of the latest stored run for given domains (dev DB + bucket) with the current EZMotion module.
// Usage: set -a; . ../.env.local; set +a; npx tsx scripts/rerender-motion.ts [--llm] [--no-plate] [--ratio 9:16] domain1 domain2 ...
// Output: /Users/groot/.ezcoder/goals/website2ads/quality/motion/<domain>/{motion.mp4,strip.jpg}
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { AdSpec, Ratio } from "../../src/lib/ads/contracts";
import { renderMotionAd } from "../src/modules/ezmotion/index";
import { run } from "../src/modules/ezmotion/runtime";
import { createProvider } from "../src/providers/index";
import type { AIProvider } from "../src/providers/types";
import type { BrandKit } from "../src/render/static/types";
import { createStorage } from "../src/storage/s3";

const OUT = "/Users/groot/.ezcoder/goals/website2ads/quality/motion";
const args = process.argv.slice(2);
const ri = args.indexOf("--ratio");
const ratio = (ri >= 0 ? args[ri + 1] : "9:16") as Ratio;
const domains = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--ratio");
const stub: AIProvider = { name: "codex", text: () => Promise.reject(new Error("offline")), image: () => Promise.reject(new Error("no imagery")), health: () => Promise.resolve({ ok: true }) };
// --llm needs Codex credentials: default to the local ezcoder login when none are set.
const defaultAuth = join(homedir(), ".ezcoder/auth.json");
if (args.includes("--llm") && !process.env.CODEX_AUTH_JSON && !process.env.CODEX_AUTH_FILE && existsSync(defaultAuth)) process.env.CODEX_AUTH_FILE = defaultAuth;
if (args.includes("--no-plate")) process.env.EZMOTION_PLATE = "0"; // plate is the module default
const provider = args.includes("--llm") ? createProvider("codex") : stub;
const db = new PrismaClient();
const storage = createStorage();
for (const domain of domains) {
  // Latest run (across this domain's brand profiles) with a motion ad; a run in progress may not have one yet.
  const profiles = await db.brandProfile.findMany({ where: { domain }, orderBy: { updatedAt: "desc" } });
  const runs = await db.adRun.findMany({ where: { brandProfileId: { in: profiles.map((p) => p.id) } }, orderBy: { createdAt: "desc" }, select: { id: true, brandProfileId: true } });
  let ad = null;
  let bp = profiles[0];
  for (const r of runs) {
    ad = await db.ad.findFirst({ where: { runId: r.id, kind: "motion" }, orderBy: { index: "asc" } });
    if (ad) { bp = profiles.find((p) => p.id === r.brandProfileId); break; }
  }
  if (!bp) { console.log(domain, "no brand profile"); continue; }
  if (!ad) { console.log(domain, "no motion ad in latest run"); continue; }
  const dir = join(OUT, domain);
  await mkdir(join(dir, "in"), { recursive: true });
  const fetchTo = async (key: string) => { const p = join(dir, "in", key.split("/").pop() ?? "x"); await writeFile(p, await storage.get(key)); return p; };
  const assets = [];
  for (const a of bp.assets as Array<BrandKit["assets"][number]>) { try { assets.push({ ...a, path: await fetchTo(a.key) }); } catch { /* missing */ } }
  const brand: BrandKit = { brandName: bp.name ?? domain, colors: bp.colors as BrandKit["colors"], fonts: bp.fonts as BrandKit["fonts"], logoPath: bp.logoKey ? await fetchTo(bp.logoKey) : null, assets };
  const vb = (ad.visualBrief ?? {}) as Partial<AdSpec["visual"]>;
  const spec: AdSpec = { index: ad.index, kind: "motion", awareness: ad.awareness, angle: ad.angle, hook: ad.hook, headline: ad.headline, body: ad.body ?? undefined, cta: ad.cta ?? undefined,
    claims: ad.claims as AdSpec["claims"], visual: { concept: vb.concept ?? "", assetKeys: vb.assetKeys ?? [], layout: vb.layout ?? "", generateImagery: false } };
  try {
    const res = await renderMotionAd({ spec, brand, siteUrl: `https://${domain}`, ratios: [ratio], workDir: join(dir, "work"), provider, maxSeconds: 14 });
    const f = res.files[0];
    if (!f) throw new Error("no file");
    await copyFile(f.path, join(dir, "motion.mp4"));
    await run("ffmpeg", ["-y", "-v", "error", "-i", f.path, "-vf", `fps=1,scale=${Math.round(f.width / 4)}:-1,tile=7x2`, "-frames:v", "1", join(dir, "strip.jpg")]);
    console.log(domain, "ok", join(dir, "strip.jpg"));
  } catch (e) { console.log(domain, "failed", e instanceof Error ? e.message.slice(0, 300) : e); }
}
await db.$disconnect();
