// Generation size per ratio (gpt-image-2 takes WxH in multiples of 16) and final output pixels.
import { RATIO_PIXELS, type Ratio } from "../../../../src/lib/ads/contracts";

export const GEN_SIZE: Record<Ratio, string> = { "1:1": "1024x1024", "4:5": "1024x1280", "9:16": "1008x1792" };

export function outPixels(ratio: Ratio): { width: number; height: number } {
  return RATIO_PIXELS[ratio];
}
