// Generates app icons from the Ozzy pixel-art PNG: npx tsx scripts/export-icons.ts
import path from "path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public/brand/ozzy-classic-happy.png");
const BG = "#0c0820";

function roundedBg(size: number, radius: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/></svg>`);
}

async function ozzy(size: number, crop?: boolean): Promise<Buffer> {
  let img = sharp(src).trim();
  if (crop) {
    const m = await img.clone().toBuffer({ resolveWithObject: true });
    const w = m.info.width;
    img = sharp(m.data).extract({ left: 0, top: 0, width: w, height: Math.min(m.info.height, Math.round(w * 0.95)) });
  }
  return img.resize(size, size, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function onBg(size: number, inner: number, radius: number, out: string): Promise<void> {
  await sharp(roundedBg(size, radius)).composite([{ input: await ozzy(inner), gravity: "center" }]).png().toFile(path.join(root, out));
}

async function main(): Promise<void> {
  await sharp(await ozzy(192, true)).toFile(path.join(root, "src/app/icon.png"));
  await onBg(180, 152, 40, "src/app/apple-icon.png");
  await onBg(512, 440, 96, "public/brand/icon-512.png");
  await onBg(512, 340, 0, "public/brand/icon-512-maskable.png");
  console.log("icons written");
}

void main();
