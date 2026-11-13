// Ozzy Studio: copy the business's own website imagery (extracted by Ad Packs into BrandProfile.assets)
// into a project as ./brand/photos/ so videos show their real products, place and people.
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Storage } from "../storage/s3";

export interface StoredAsset {
  key: string;
  sourceUrl: string;
  kind: string;
  width: number;
  height: number;
  hasFace: boolean;
  alt?: string;
}

export interface BriefPhoto {
  file: string;
  kind: string;
  width: number;
  height: number;
  alt?: string;
}

export const MAX_BRAND_PHOTOS = 8;
const MIN_EDGE = 400;
const MAX_ASPECT = 3.2; // wider/taller than this is a banner/strip, not a usable photo
const MAX_BYTES = 8 * 1024 * 1024;
const KIND_RANK: Record<string, number> = { photo: 0, product: 1, screenshot: 2, illustration: 3, other: 4 };
const MAX_SCREENSHOTS = 2;

/** Parse BrandProfile.assets JSON defensively (it's user/extractor data). */
export function parseStoredAssets(raw: unknown): StoredAsset[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const o = a as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.width !== "number" || typeof o.height !== "number") return [];
    const alt = typeof o.alt === "string" ? o.alt : typeof o.caption === "string" ? o.caption : undefined;
    return [{
      key: o.key, sourceUrl: typeof o.sourceUrl === "string" ? o.sourceUrl : "", kind: typeof o.kind === "string" ? o.kind : "other",
      width: o.width, height: o.height, hasFace: o.hasFace === true, ...(alt ? { alt: alt.slice(0, 120) } : {}),
    }];
  });
}

const dedupeId = (a: StoredAsset) => {
  const u = a.sourceUrl.split(/[?#]/)[0] ?? "";
  // Same file name at another size (srcset variants) counts as a duplicate.
  const base = (u.split("/").pop() ?? "").toLowerCase().replace(/[-_@]?\d{2,4}x\d{0,4}|[-_@]\d+w|@\dx/g, "");
  return base || a.key;
};

/**
 * Best real photos first: drop icons/logos, tiny (<400px long edge) and banner-shaped images and duplicates
 * (same key, same source URL or srcset variant); rank photo > product > screenshot > illustration > other,
 * then by pixel area, then key; at most 2 screenshots; cap 8.
 */
export function rankBrandPhotos(assets: StoredAsset[], logoKey: string | null, cap = MAX_BRAND_PHOTOS): StoredAsset[] {
  const ok = assets.filter((a) => {
    if (!(a.kind in KIND_RANK) || a.key === logoKey) return false;
    if (/logo|favicon|sprite|icon/i.test(a.sourceUrl.split(/[?#]/)[0] ?? "")) return false;
    const lo = Math.min(a.width, a.height);
    const hi = Math.max(a.width, a.height);
    return hi >= MIN_EDGE && lo > 0 && hi / lo <= MAX_ASPECT;
  });
  ok.sort((x, y) => (KIND_RANK[x.kind] ?? 9) - (KIND_RANK[y.kind] ?? 9) || y.width * y.height - x.width * x.height || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  const seen = new Set<string>();
  const out: StoredAsset[] = [];
  let shots = 0;
  for (const a of ok) {
    const id = dedupeId(a);
    if (seen.has(a.key) || seen.has(id)) continue;
    if (a.kind === "screenshot" && shots >= MAX_SCREENSHOTS) continue;
    seen.add(a.key);
    seen.add(id);
    if (a.kind === "screenshot") shots++;
    out.push(a);
    if (out.length >= cap) break;
  }
  return out;
}

/** photo-1.jpg, product-2.webp... (deterministic, numbered in rank order). */
export function photoFileName(a: StoredAsset, i: number): string {
  const ext = extname(a.key.split(/[?#]/)[0] ?? "").toLowerCase();
  return `${a.kind}-${i + 1}${/^\.(jpe?g|png|webp|avif|gif)$/.test(ext) ? ext : ".jpg"}`;
}

export function describePhoto(p: BriefPhoto): string {
  return `./brand/photos/${p.file} (${p.kind}, ${p.width}x${p.height}${p.alt ? `, "${p.alt}"` : ""})`;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
  });

/** Download the ranked photos in parallel into <project>/brand/photos. Never throws; failed images are skipped. */
export async function installBrandPhotos(o: {
  storage: Pick<Storage, "get">; project: string; assets: unknown; logoKey: string | null; timeoutMs?: number;
  onError?: (msg: string, key: string) => void;
}): Promise<BriefPhoto[]> {
  try {
    const picked = rankBrandPhotos(parseStoredAssets(o.assets), o.logoKey);
    if (!picked.length) return [];
    const dir = join(o.project, "brand", "photos");
    await mkdir(dir, { recursive: true });
    const res = await Promise.all(picked.map(async (a, i): Promise<BriefPhoto | null> => {
      try {
        const buf = await withTimeout(o.storage.get(a.key), o.timeoutMs ?? 8000);
        if (buf.length > MAX_BYTES || buf.length < 2048) return null;
        const file = photoFileName(a, i);
        await writeFile(join(dir, file), buf);
        return { file, kind: a.kind, width: a.width, height: a.height, ...(a.alt ? { alt: a.alt } : {}) };
      } catch (e) {
        o.onError?.(e instanceof Error ? e.message : String(e), a.key);
        return null;
      }
    }));
    return res.filter((p): p is BriefPhoto => p !== null);
  } catch (e) {
    o.onError?.(e instanceof Error ? e.message : String(e), "");
    return [];
  }
}
