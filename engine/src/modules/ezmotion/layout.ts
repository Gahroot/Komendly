// Ratio geometry: frame size plus the area text and key visuals must stay inside.
import { RATIO_PIXELS, type Ratio } from "../../../../src/lib/ads/contracts";

export interface Frame {
  ratio: Ratio;
  width: number;
  height: number;
  /** Safe box (px from each edge) for text and CTA. */
  safe: { top: number; right: number; bottom: number; left: number };
}

/** 9:16 keeps clear of feed UI (top ~14%, bottom ~20%, right rail); others keep a 6% margin. */
export function frameFor(ratio: Ratio): Frame {
  const { width, height } = RATIO_PIXELS[ratio];
  if (ratio === "9:16") {
    return { ratio, width, height, safe: { top: Math.round(height * 0.14), bottom: Math.round(height * 0.2), left: 72, right: 120 } };
  }
  const m = Math.round(width * 0.07);
  return { ratio, width, height, safe: { top: m, bottom: m, left: m, right: m } };
}

export function safeBox(f: Frame): { x: number; y: number; w: number; h: number } {
  return { x: f.safe.left, y: f.safe.top, w: f.width - f.safe.left - f.safe.right, h: f.height - f.safe.top - f.safe.bottom };
}

/**
 * Font size (px) that fits `text` in a box `w` wide on at most `lines` lines, using an
 * average glyph width of `em` × size. Clamped to [min, max].
 */
export function fitFontSize(text: string, w: number, lines: number, max: number, min = 36, em = 0.56): number {
  const chars = Math.max(1, text.trim().length);
  const longestWord = Math.max(1, ...text.split(/\s+/).map((s) => s.length));
  const byLines = (w * lines) / (chars * em * 1.12); // 12% slack for ragged wrapping
  const byWord = w / (longestWord * em * 1.05);
  return Math.round(Math.max(min, Math.min(max, byLines, byWord)));
}
