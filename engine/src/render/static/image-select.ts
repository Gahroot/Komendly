// Choose real site assets for an image-led template (per ratio) and fall back gracefully.
import type { Ratio } from "../../../../src/lib/ads/contracts";
import { RATIO_PIXELS } from "../../../../src/lib/ads/contracts";
import { PHOTO_KINDS, findBeforeAfter, fullBleedSafe, isLowRes, type BrandAsset } from "./imagery";
import type { ImageTemplateId, TemplateId } from "./layout";

export interface ImageChoice {
  template: TemplateId;
  assets: BrandAsset[];
}

const MIN_EDGE = 400;
const big = (a: BrandAsset) => Math.max(a.width, a.height) >= MIN_EDGE;
const area = (a: BrandAsset) => a.width * a.height;

/** Stable order: preferred keys, then non-face, then kind rank, then resolution; rotated by ad index for variety. */
function rank(list: BrandAsset[], preferred: string[], index: number, kinds: ReadonlyArray<BrandAsset["kind"]>): BrandAsset[] {
  const pref = list.filter((a) => preferred.includes(a.key)).sort((x, y) => preferred.indexOf(x.key) - preferred.indexOf(y.key));
  const rest = list
    .filter((a) => !preferred.includes(a.key))
    .sort((x, y) => Number(x.hasFace) - Number(y.hasFace) || kinds.indexOf(x.kind) - kinds.indexOf(y.kind) || area(y) - area(x) || (x.key < y.key ? -1 : 1));
  const top = rest.slice(0, 8);
  const k = top.length ? Math.abs(index) % top.length : 0;
  return [...pref, ...top.slice(k), ...top.slice(0, k), ...rest.slice(8)];
}

/**
 * Real assets for `id` at `ratio`, or the next template that the assets support:
 * fullbleed/caption -> split (low-res or face without box) ; collage(1 image) -> fullbleed ;
 * spotlight/device -> split ; split -> hero_product (screenshots) -> quote_thought ;
 * photo_before_after -> before_after (text).
 */
export function chooseImages(id: ImageTemplateId, assets: BrandAsset[], ratio: Ratio, preferred: string[], index: number): ImageChoice {
  const { width: W, height: H } = RATIO_PIXELS[ratio];
  const photos = assets.filter((a) => PHOTO_KINDS.includes(a.kind) && big(a));
  const kinds = ["photo", "illustration", "product"] as const;
  switch (id) {
    case "photo_fullbleed":
    case "photo_caption": {
      const ok = rank(photos.filter((a) => fullBleedSafe(a) && !isLowRes(a, W, H)), preferred, index, kinds);
      return ok[0] ? { template: id, assets: [ok[0]] } : chooseImages("photo_split", assets, ratio, preferred, index);
    }
    case "photo_collage": {
      const ok = rank(photos.filter((a) => fullBleedSafe(a)), preferred, index, kinds);
      if (ok.length >= 2) return { template: id, assets: ok.slice(0, 4) };
      return chooseImages("photo_fullbleed", assets, ratio, preferred, index);
    }
    case "product_spotlight": {
      const prod = rank(assets.filter((a) => a.kind === "product" && big(a)), preferred, index, ["product"]);
      if (prod[0]) return { template: id, assets: [prod[0]] };
      return chooseImages("photo_split", assets, ratio, preferred, index);
    }
    case "screenshot_device": {
      const shots = assets.filter((a) => a.kind === "screenshot" && a.width >= 600);
      const tallFirst = ratio === "9:16" ? [...shots].sort((x, y) => Number(y.height >= y.width * 1.4) - Number(x.height >= x.width * 1.4)) : shots.filter((a) => a.width >= a.height);
      const pick = rank(tallFirst.length ? tallFirst : shots, preferred, 0, ["screenshot"]);
      if (ratio === "9:16") pick.sort((x, y) => Number(y.height >= y.width * 1.4) - Number(x.height >= x.width * 1.4));
      return pick[0] ? { template: id, assets: [pick[0]] } : chooseImages("photo_split", assets, ratio, preferred, index);
    }
    case "photo_before_after": {
      const pair = findBeforeAfter(photos);
      return pair ? { template: id, assets: pair } : { template: "before_after", assets: [] };
    }
    case "photo_split":
    default: {
      const ok = rank(photos, preferred, index, kinds);
      if (ok[0]) return { template: "photo_split", assets: [ok[0]] };
      const shot = assets.find((a) => a.kind === "screenshot" && a.width >= 600);
      return { template: shot ? "hero_product" : "quote_thought", assets: [] };
    }
  }
}
