// Export a run's ready ads as examples: <out>/<domain>/NN-awareness.png, motion.mp4,
// and sheet-<domain>.jpg (5 columns of ready static ads, 400px tiles, contain).
// Usage: tsx scripts/export-examples.ts <runId> [<runId>...]   (env: dev DB + S3)
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createDb } from "../src/db";
import { createStorage } from "../src/storage/s3";

const OUT = process.env.EXAMPLES_DIR ?? "/Users/groot/.ezcoder/goals/website2ads/examples";
const db = createDb();
const storage = createStorage();

for (const runId of process.argv.slice(2)) {
  const run = await db.adRun.findUniqueOrThrow({ where: { id: runId }, include: { ads: { include: { assets: true }, orderBy: { index: "asc" } } } });
  const domain = new URL(run.url).hostname.replace(/^www\./, "");
  const dir = path.join(OUT, domain);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const tiles: Buffer[] = [];
  let n = 0;
  for (const ad of run.ads.filter((a) => a.status === "ready")) {
    if (ad.kind === "motion") {
      const v = ad.assets.find((a) => a.mime === "video/mp4");
      if (v) await writeFile(path.join(dir, "motion.mp4"), await storage.get(v.storageKey));
      continue;
    }
    const img = ad.assets.find((a) => a.mime.startsWith("image/") && a.ratio !== "poster");
    if (!img) continue;
    const buf = await storage.get(img.storageKey);
    n++;
    await writeFile(path.join(dir, `${String(n).padStart(2, "0")}-${ad.awareness}.png`), await sharp(buf).png().toBuffer());
    tiles.push(await sharp(buf).resize(400, 400, { fit: "contain", background: "#ffffff" }).png().toBuffer());
  }
  if (tiles.length) {
    const cols = 5;
    const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: cols * 400, height: rows * 400, channels: 3, background: "#ffffff" } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 400, top: Math.floor(i / cols) * 400 })))
      .jpeg({ quality: 85 })
      .toFile(path.join(OUT, `sheet-${domain}.jpg`));
  }
  console.log(`${domain}: ${n} static${run.ads.some((a) => a.kind === "motion" && a.status === "ready") ? " + motion" : ""} -> ${dir}`);
}
await db.$disconnect();
