// Download brand assets from storage into a job workDir and build the renderer's BrandKit.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExtractionSchema, type Extraction } from "../../../src/lib/ads/contracts";
import type { BrandKit } from "../render/static/types";
import type { Storage } from "../storage/s3";

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export async function buildBrandKit(
  storage: Storage,
  workDir: string,
  src: { extraction: unknown; profile: { name: string | null; colors: unknown; fonts: unknown; logoKey: string | null; assets: unknown } | null },
  wantedAssetKeys: string[],
): Promise<BrandKit> {
  const ex = ExtractionSchema.safeParse(src.extraction);
  const p = src.profile;
  const colors = p && asArray(p.colors).length ? asArray<Extraction["colors"][number]>(p.colors) : ex.success ? ex.data.colors : [];
  const fonts = p && asArray(p.fonts).length ? asArray<Extraction["fonts"][number]>(p.fonts) : ex.success ? ex.data.fonts : [];
  const assets = p && asArray(p.assets).length ? asArray<Extraction["assets"][number]>(p.assets) : ex.success ? ex.data.assets : [];
  const logoKey = p?.logoKey ?? (ex.success ? ex.data.logoKey : null);
  const dir = path.join(workDir, "brand");
  await mkdir(dir, { recursive: true });
  const fetchTo = async (key: string): Promise<string> => {
    const file = path.join(dir, key.replace(/[^A-Za-z0-9._-]/g, "_"));
    await writeFile(file, await storage.get(key));
    return file;
  };
  const logoPath = logoKey ? await fetchTo(logoKey).catch(() => null) : null;
  // Spec'd assets first, then the rest (renderers may pick alternates), capped at 8.
  const order = [...assets].sort((a, b) => Number(wantedAssetKeys.includes(b.key)) - Number(wantedAssetKeys.includes(a.key))).slice(0, 8);
  const local: BrandKit["assets"] = [];
  for (const a of order) {
    const p2 = await fetchTo(a.key).catch(() => null);
    if (p2) local.push({ ...a, path: p2 });
  }
  const fontFiles: NonNullable<BrandKit["fontFiles"]> = [];
  for (const f of fonts) {
    if (f.sourceUrl?.startsWith("ws/")) {
      const fp = await fetchTo(f.sourceUrl).catch(() => null);
      if (fp) fontFiles.push({ family: f.family, role: f.role, path: fp });
    }
  }
  return {
    brandName: p?.name ?? (ex.success ? ex.data.brandName : "Brand"),
    colors,
    fonts,
    logoPath,
    assets: local,
    fontFiles,
  };
}
