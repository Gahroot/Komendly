// "Made with Komendly" corner mark for free/trial output (system viral_branding). Small, semi-transparent pill in the
// bottom-right corner: label + short link (komendly.com/m/<code>). Pure layout/SVG + one sharp composite.
import sharp from "sharp";
import { MARK_LABEL, markShortUrl } from "../../../src/lib/growth/viral-branding";

export interface MarkLayout { width: number; height: number; left: number; top: number; labelSize: number; urlSize: number; radius: number; pad: number }

/** Pure: badge box for a w x h image (scales with the short side; ~30% of the width at most). */
export function markLayout(w: number, h: number, code: string): MarkLayout {
  const base = Math.min(w, h);
  const labelSize = Math.max(11, Math.round(base * 0.024));
  const urlSize = Math.max(9, Math.round(labelSize * 0.72));
  const pad = Math.round(labelSize * 0.6);
  const textW = Math.max(MARK_LABEL.length * labelSize * 0.56, markShortUrl(code).length * urlSize * 0.56);
  const width = Math.min(Math.round(textW + pad * 2), Math.round(w * 0.45));
  const height = Math.round(labelSize + urlSize + pad * 1.9);
  const margin = Math.round(base * 0.025);
  return { width, height, left: Math.max(0, w - width - margin), top: Math.max(0, h - height - margin), labelSize, urlSize, radius: Math.round(height / 2.4), pad };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Pure: SVG of the badge (sized to the layout box). */
export function markSvg(l: MarkLayout, code: string): string {
  const y1 = l.pad * 0.8 + l.labelSize * 0.85;
  const y2 = y1 + l.urlSize * 1.25;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}">`
    + `<rect width="${l.width}" height="${l.height}" rx="${l.radius}" fill="#0c0820" fill-opacity="0.62"/>`
    + `<text x="${l.width / 2}" y="${y1}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="700" font-size="${l.labelSize}" fill="#ffffff">${esc(MARK_LABEL)}</text>`
    + `<text x="${l.width / 2}" y="${y2}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${l.urlSize}" fill="#ffffff" fill-opacity="0.85">${esc(markShortUrl(code))}</text>`
    + `</svg>`;
}

/** Composite the mark onto a PNG/JPEG; returns the same format. */
export async function applyMadeWithMark(img: Buffer, code: string): Promise<Buffer> {
  const meta = await sharp(img).metadata();
  if (!meta.width || !meta.height) throw new Error("mark: image without size");
  const l = markLayout(meta.width, meta.height, code);
  const out = sharp(img).composite([{ input: Buffer.from(markSvg(l, code)), left: l.left, top: l.top }]);
  return meta.format === "jpeg" ? out.jpeg({ quality: 92 }).toBuffer() : out.png().toBuffer();
}

/** Only real ad images get the mark (not posters, previews or videos). */
export function markable(f: { mime: string; ratio: string }): boolean {
  return (f.mime === "image/png" || f.mime === "image/jpeg") && f.ratio !== "poster" && f.ratio !== "preview";
}
