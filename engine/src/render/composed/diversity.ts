// Perceptual difference hash (64-bit dHash) to detect near-duplicate ads within a run.
import sharp from "sharp";

export async function dHash(png: Buffer): Promise<string> {
  const px = await sharp(png).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += (px[y * 9 + x] ?? 0) > (px[y * 9 + x + 1] ?? 0) ? "1" : "0";
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** Too similar when within this many of 64 bits of any earlier ad. */
export const SIMILAR_BITS = 12;

export function tooSimilar(hash: string, others: string[]): boolean {
  return others.some((o) => /^[0-9a-f]{16}$/.test(o) && hamming(hash, o) <= SIMILAR_BITS);
}
