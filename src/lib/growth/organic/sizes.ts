// Ad image sizes by platform + the pure crop/fit maths for the client-side resizer (/tools/ad-image-resizer).
// Sizes are the commonly recommended creative sizes; platforms change specs, so the page tells people to confirm in the ad manager.
export interface SizePreset { id: string; platform: string; name: string; w: number; h: number }

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "meta-square", platform: "Meta", name: "Feed square (1:1)", w: 1080, h: 1080 },
  { id: "meta-portrait", platform: "Meta", name: "Feed portrait (4:5)", w: 1080, h: 1350 },
  { id: "meta-story", platform: "Meta", name: "Stories and Reels (9:16)", w: 1080, h: 1920 },
  { id: "meta-link", platform: "Meta", name: "Link ad landscape (1.91:1)", w: 1200, h: 628 },
  { id: "google-landscape", platform: "Google Display", name: "Landscape (1.91:1)", w: 1200, h: 628 },
  { id: "google-square", platform: "Google Display", name: "Square (1:1)", w: 1200, h: 1200 },
  { id: "google-mrec", platform: "Google Display", name: "Medium rectangle", w: 300, h: 250 },
  { id: "google-large-rect", platform: "Google Display", name: "Large rectangle", w: 336, h: 280 },
  { id: "google-leaderboard", platform: "Google Display", name: "Leaderboard", w: 728, h: 90 },
  { id: "google-skyscraper", platform: "Google Display", name: "Half page", w: 300, h: 600 },
  { id: "google-mobile", platform: "Google Display", name: "Mobile banner", w: 320, h: 50 },
  { id: "pinterest-standard", platform: "Pinterest", name: "Standard pin (2:3)", w: 1000, h: 1500 },
  { id: "pinterest-square", platform: "Pinterest", name: "Square pin (1:1)", w: 1000, h: 1000 },
  { id: "tiktok-vertical", platform: "TikTok", name: "Vertical (9:16)", w: 1080, h: 1920 },
  { id: "tiktok-square", platform: "TikTok", name: "Square (1:1)", w: 640, h: 640 },
  { id: "linkedin-landscape", platform: "LinkedIn", name: "Single image (1.91:1)", w: 1200, h: 627 },
  { id: "youtube-thumb", platform: "YouTube", name: "Thumbnail (16:9)", w: 1280, h: 720 },
];

export type FitMode = "cover" | "contain";
export interface DrawRect { dx: number; dy: number; dw: number; dh: number }

/** Where to draw a source image on a destination canvas: `cover` fills and crops (centred), `contain` fits whole with bars. */
export function fitRect(srcW: number, srcH: number, dstW: number, dstH: number, mode: FitMode): DrawRect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) throw new Error("sizes must be positive");
  const scale = mode === "cover" ? Math.max(dstW / srcW, dstH / srcH) : Math.min(dstW / srcW, dstH / srcH);
  const dw = Math.round(srcW * scale);
  const dh = Math.round(srcH * scale);
  return { dx: Math.round((dstW - dw) / 2), dy: Math.round((dstH - dh) / 2), dw, dh };
}

/** Share of the source image that is cut off by a `cover` crop, 0..1 (to warn before text is lost). */
export function cropLoss(srcW: number, srcH: number, dstW: number, dstH: number): number {
  const r = fitRect(srcW, srcH, dstW, dstH, "cover");
  return Math.max(0, 1 - (dstW * dstH) / (r.dw * r.dh));
}

export function presetFilename(base: string, p: SizePreset, ext: "png" | "jpg"): string {
  const clean = base.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ad";
  return `${clean}-${p.id}-${p.w}x${p.h}.${ext}`;
}
