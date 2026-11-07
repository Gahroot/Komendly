// Picks 2-4 real brand images to pass as gpt-image-2 references (logo first, no faces), as PNG data.
import sharp from "sharp";
import type { AdSpec } from "../../../../src/lib/ads/contracts";
import type { BrandKit } from "../static/types";

export interface ComposedRef { label: string; mediaType: string; base64: string; screenshot?: boolean }

const RANK: Record<string, number> = { product: 0, screenshot: 1, photo: 2, illustration: 3, other: 4, icon: 5 };

export function pickAssets(spec: AdSpec, brand: BrandKit, max = 3): BrandKit["assets"] {
  const usable = brand.assets.filter((a) => !a.hasFace && a.kind !== "icon" && a.width >= 300);
  const wanted = new Set(spec.visual.assetKeys);
  return [...usable]
    .sort((a, b) => Number(wanted.has(b.key)) - Number(wanted.has(a.key)) || (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) || b.width * b.height - a.width * a.height || a.key.localeCompare(b.key))
    .slice(0, max);
}

async function toPng(path: string): Promise<string> {
  return (await sharp(path, { density: 300 }).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer()).toString("base64");
}

export async function buildReferences(spec: AdSpec, brand: BrandKit): Promise<ComposedRef[]> {
  const out: ComposedRef[] = [];
  // The logo is NOT passed: the model redrew it, duplicating the real overlay.
  for (const a of pickAssets(spec, brand)) {
    try { out.push({ label: a.kind === "screenshot" ? "real product screenshot" : `real ${a.kind} photo`, mediaType: "image/png", base64: await toPng(a.path), screenshot: a.kind === "screenshot" }); } catch { /* skip */ }
  }
  return out.slice(0, 4);
}
