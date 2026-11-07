/**
 * Export static Ozzy PNGs (emails, OG images, icons) from the same SDF rig the live mascot uses.
 * usage: npx tsx scripts/export-ozzy.ts   -> public/brand/ozzy-<form>-<expr>.png (+ @scale)
 */
import sharp from "sharp";
import { sdfFrame } from "../src/components/ozzy/sdf/frame";
import type { OzzyExpression, OzzyForm, OzzyState } from "../src/components/ozzy/types";

const OUT = "public/brand";
const POSES: [OzzyForm, OzzyExpression][] = [
  ["classic", "happy"], ["joyful", "happy"], ["explorer", "focused"], ["creator", "focused"],
  ["adventurer", "cool"], ["developer", "excited"], ["chill", "sleepy"], ["ascended", "happy"], ["classic", "confused"], ["classic", "love"],
];

async function exportPose(form: OzzyForm, expression: OzzyExpression, scale: number) {
  const state: OzzyState = { form, expression, motion: "idle", orb: 0.8, beat: 0 };
  const f = sdfFrame(state, 0.6, false, true);
  const art = sharp(Buffer.from(f.rgba.buffer), { raw: { width: f.size, height: f.size, channels: 4 } }).resize(f.size * scale, f.size * scale, { kernel: "nearest" });
  // Soft bloom from emissive pixels (star, orb, panel), like the live renderer.
  const glow = await sharp(Buffer.from(f.glow.buffer), { raw: { width: f.size, height: f.size, channels: 4 } })
    .resize(f.size * scale, f.size * scale, { kernel: "nearest" }).blur(scale * 1.6).png().toBuffer();
  const base = await art.png().toBuffer();
  const out = await sharp(base).composite([{ input: glow, blend: "screen" }]).png({ compressionLevel: 9, palette: false }).toBuffer();
  const name = `${OUT}/ozzy-${form}-${expression}${scale === 8 ? "" : `@${scale}`}.png`;
  await sharp(out).toFile(name);
  return name;
}

async function main() {
  for (const [form, expr] of POSES) {
    console.log(await exportPose(form, expr, 8)); // 512px
  }
  console.log(await exportPose("classic", "happy", 3)); // 192px for email
}
main();
