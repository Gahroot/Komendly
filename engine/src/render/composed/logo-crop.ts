// Crop of the placed brand mark (from render meta), given to the QC judge as the logo reference.
import sharp from "sharp";

export async function logoCrop(ad: Buffer, visualBrief: unknown): Promise<Array<{ mediaType: string; base64: string }>> {
  const b = (visualBrief as { render?: { logo?: { box?: { x: number; y: number; w: number; h: number } | null } } } | null)?.render?.logo?.box;
  if (!b) return [];
  try {
    const m = await sharp(ad).metadata();
    const W = m.width ?? 0, H = m.height ?? 0;
    const left = Math.max(0, Math.round(b.x * W)), top = Math.max(0, Math.round(b.y * H));
    const width = Math.min(W - left, Math.round(b.w * W)), height = Math.min(H - top, Math.round(b.h * H));
    if (width < 4 || height < 4) return [];
    const png = await sharp(ad).extract({ left, top, width, height }).png().toBuffer();
    return [{ mediaType: "image/png", base64: png.toString("base64") }];
  } catch {
    return [];
  }
}
