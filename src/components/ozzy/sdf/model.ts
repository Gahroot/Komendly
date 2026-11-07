/** Ozzy part list (classic form) in 64x64 model space, plus face variants. */
import type { OzzyExpression } from "../types";
import type { Material } from "./materials";
import { arc, capsule, circle, ellipse, polygon, star, subtract, union, type Sdf } from "./primitives";
import type { Bone } from "./rig";

export interface Part {
  id: string;
  bone: Bone;
  mat: Material;
  z: number;
  sdf: Sdf;
  /** Dome radius for lighting height (cells). */
  dome?: number;
  /** Draw a dark sel-out line where this part overlaps lower parts. */
  line?: boolean;
  /** Model-space bounds [x0,y0,x1,y1] (inclusive margin) for fast rejection. */
  box: readonly [number, number, number, number];
}

function bounds(sdf: Sdf): [number, number, number, number] {
  let x0 = 64;
  let y0 = 64;
  let x1 = -1;
  let y1 = -1;
  for (let y = -4; y < 68; y += 0.5) {
    for (let x = -4; x < 68; x += 0.5) {
      if (sdf(x, y) < 1) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return [x0 - 1, y0 - 1, x1 + 1, y1 + 1];
}

export const P = (id: string, bone: Bone, mat: Material, z: number, sdf: Sdf, dome = 6, line = false): Part => ({ id, bone, mat, z, sdf, dome, line, box: bounds(sdf) });

export function classicBody(): Part[] {
  const brim = polygon([[8, 23.5], [14, 20], [32, 18.8], [50, 20], [56, 23.5], [50, 23.3], [32, 22.6], [14, 23.3]], 1);
  const fluffL = union(circle(19, 29.5, 2.7), circle(17, 33, 2.7), circle(19, 36.3, 2.5));
  const fluffR = union(circle(45, 29.5, 2.7), circle(47, 33, 2.7), circle(45, 36.3, 2.5));
  return [
    P("cape", "cape", "cape", 1, polygon([[20, 38], [44, 38], [51, 57], [13, 57]], 1.5), 8, true),
    P("tail", "tail", "fur", 2, union(capsule([43, 54], [53, 42], 4.6, 4), circle(48, 47, 5)), 5),
    P("tailTip", "tail", "cream", 3, union(circle(53.8, 40, 3.4), circle(52, 38, 2), circle(56, 41.5, 1.8)), 3),
    P("body", "body", "fur", 4, ellipse(32, 47.5, 12, 9.5), 10),
    P("haunchL", "body", "fur", 5, ellipse(22.5, 52, 5, 4.5), 4),
    P("haunchR", "body", "fur", 5, ellipse(41.5, 52, 5, 4.5), 4),
    P("chest", "body", "cream", 6, ellipse(32, 48, 6, 7), 5),
    P("pawL", "pawL", "cream", 7, ellipse(28.3, 55.2, 3.6, 2.3), 2.5, true),
    P("pawR", "pawR", "cream", 7, ellipse(35.7, 55.2, 3.6, 2.3), 2.5, true),
    P("toesL", "pawL", "nose", 8, union(capsule([27.3, 55], [27.3, 56], 0.35), capsule([29.3, 55], [29.3, 56], 0.35)), 1),
    P("toesR", "pawR", "nose", 8, union(capsule([34.7, 55], [34.7, 56], 0.35), capsule([36.7, 55], [36.7, 56], 0.35)), 1),
    P("collarL", "cape", "cape", 9, polygon([[19.5, 38.5], [30.5, 39.5], [25.5, 42.3], [18.5, 41.3]], 0.9), 3, true),
    P("collarR", "cape", "cape", 9, polygon([[44.5, 38.5], [33.5, 39.5], [38.5, 42.3], [45.5, 41.3]], 0.9), 3, true),
    P("clasp", "cape", "gold", 10, star(32, 41, 3), 2),
    P("earL", "earL", "fur", 11, polygon([[16, 24], [25, 22], [14, 6]], 0.8), 4),
    P("earLin", "earL", "cream", 12, polygon([[17.5, 22.5], [22.5, 21.5], [15.5, 11]], 0.3), 2),
    P("earLtip", "earL", "nose", 12, polygon([[14, 6], [15.6, 9.5], [13.8, 9.2]], 0.3), 1),
    P("earR", "earR", "fur", 11, polygon([[48, 24], [39, 22], [50, 6]], 0.8), 4),
    P("earRin", "earR", "cream", 12, polygon([[46.5, 22.5], [41.5, 21.5], [48.5, 11]], 0.3), 2),
    P("earRtip", "earR", "nose", 12, polygon([[50, 6], [48.4, 9.5], [50.2, 9.2]], 0.3), 1),
    P("head", "head", "fur", 14, union(ellipse(32, 30.5, 13.5, 9.5), fluffL, fluffR), 9),
    P("cheekL", "head", "cream", 15, ellipse(18.5, 36.5, 3.2, 1.8), 2),
    P("cheekR", "head", "cream", 15, ellipse(45.5, 36.5, 3.2, 1.8), 2),
    P("muzzle", "head", "cream", 16, ellipse(32, 35, 7.5, 4.6), 4, true),
    P("blushL", "head", "blush", 17, ellipse(22.5, 34, 1.6, 0.8), 1),
    P("blushR", "head", "blush", 17, ellipse(41.5, 34, 1.6, 0.8), 1),
    P("cone", "hat", "hat", 19, polygon([[21, 19.5], [43, 19.5], [38.5, 6.5], [33, 4]], 1.2), 8),
    P("hatTip", "hatTip", "hat", 18, polygon([[34, 5], [42, 3.2], [47.5, 5], [50, 9], [47.5, 8.8], [43.5, 7.2], [37, 9]], 1), 3),
    P("hatFold", "hatTip", "hat", 18, polygon([[36, 5], [44, 4.5], [46.5, 8.5], [38, 10.5]], 0.5), 3),
    P("hatTipEnd", "hatTip", "hat", 18, circle(49.2, 9.8, 1.4), 1.5),
    P("band", "hat", "hatDark", 20, polygon([[21.3, 16.6], [42.7, 16.6], [42.5, 19.2], [21.5, 19.2]], 0.3), 1.5),
    P("brim", "hat", "hat", 21, brim, 3, true),
    P("hatStar", "hat", "gold", 22, star(30.5, 12, 4.6, 0), 2.5),
  ];
}

const EYE_L = 25.5;
const EYE_R = 38.5;
const EYE_Y = 29.5;

function eyes(kind: "open" | "arc" | "closed" | "star" | "glasses" | "wide" | "focus"): Part[] {
  const out: Part[] = [];
  for (const ex of [EYE_L, EYE_R]) {
    const f = ex === EYE_L ? "L" : "R";
    if (kind === "open" || kind === "wide" || kind === "focus") {
      const ry = kind === "focus" ? 2.4 : 3.6;
      const rx = kind === "wide" ? 3.3 : 3;
      out.push(P(`eye${f}`, "eyes", "eye", 30, ellipse(ex, EYE_Y, rx, ry), 1));
      out.push(P(`iris${f}`, "eyes", "irisLow", 30.5, ellipse(ex, EYE_Y + ry * 0.55, rx * 0.7, ry * 0.4), 1));
      out.push(P(`glint${f}`, "eyes", "white", 31, polygon([[ex - 2, EYE_Y - 2.2], [ex, EYE_Y - 2.2], [ex, EYE_Y - 0.2], [ex - 2, EYE_Y - 0.2]]), 1));
      out.push(P(`glint2${f}`, "eyes", "white", 31, circle(ex + 1.5, EYE_Y + 1.5, 0.55), 1));
    } else if (kind === "arc") {
      out.push(P(`eye${f}`, "eyes", "eye", 30, arc(ex, EYE_Y + 1.2, 2.6, 0.6, -Math.PI, 0), 1));
    } else if (kind === "closed") {
      out.push(P(`eye${f}`, "eyes", "eye", 30, arc(ex, EYE_Y - 0.5, 2.6, 0.55, 0.2, Math.PI - 0.2), 1));
    } else if (kind === "star") {
      out.push(P(`eye${f}`, "eyes", "gold", 30, star(ex, EYE_Y, 3.2), 1));
    }
  }
  if (kind === "glasses") {
    out.push(P("shades", "head", "eye", 30, union(polygon([[23, 28], [31, 28], [30, 33], [24, 33]], 0.3), polygon([[33, 28], [41, 28], [40, 33], [34, 33]], 0.3), capsule([30, 29], [34, 29], 0.6)), 1));
    out.push(P("shadeGlint", "head", "white", 31, capsule([25, 29.5], [26.5, 29.5], 0.5), 1));
  }
  return out;
}

function mouth(kind: "smile" | "tongue" | "open" | "flat" | "wavy" | "grin"): Part[] {
  const nose = P("nose", "head", "nose", 32, ellipse(32, 32.6, 2.2, 1.4), 1.5);
  const out: Part[] = [nose];
  if (kind === "smile" || kind === "tongue") {
    out.push(P("mouth", "head", "eye", 32, union(arc(30.2, 34.2, 1.8, 0.45, 0.2, Math.PI - 0.4), arc(33.8, 34.2, 1.8, 0.45, 0.6, Math.PI - 0.2)), 1));
    if (kind === "tongue") out.push(P("tongue", "head", "tongue", 31, subtract(ellipse(32, 37.4, 1.8, 1.8), circle(32, 35, 1.4)), 1.5));
  } else if (kind === "grin") {
    // Confident closed smirk: flat-ish left, right corner curling up.
    out.push(P("mouth", "head", "eye", 32, union(capsule([29, 35.4], [32, 35.9], 0.5), capsule([32, 35.9], [34.6, 35.1], 0.5), capsule([34.6, 35.1], [35.6, 33.9], 0.45)), 1));
  } else if (kind === "open") {
    out.push(P("mouth", "head", "eye", 32, ellipse(32, 36.5, 1.5, 1.7), 1));
  } else if (kind === "wavy") {
    out.push(P("mouth", "head", "eye", 32, union(arc(30.5, 36.4, 1.2, 0.45, -Math.PI, 0), arc(33, 36, 1.2, 0.45, 0, Math.PI)), 1));
  } else {
    out.push(P("mouth", "head", "eye", 32, capsule([30.5, 36], [33.5, 36], 0.5), 1));
  }
  return out;
}

const heart = union(circle(30.7, 3.8, 1.6), circle(33.3, 3.8, 1.6), polygon([[29.2, 4.4], [34.8, 4.4], [32, 7.4]]));

/** `grin`: confident smirk instead of shades for "cool" (adventurer wears goggles). */
export function faceParts(e: OzzyExpression, blink: boolean, grin = false): Part[] {
  const map: Record<OzzyExpression, [Parameters<typeof eyes>[0], Parameters<typeof mouth>[0]]> = {
    neutral: ["open", "tongue"],
    happy: ["arc", "tongue"],
    excited: ["star", "tongue"],
    surprised: ["wide", "open"],
    cool: ["glasses", "smile"],
    confused: ["open", "wavy"],
    love: ["arc", "smile"],
    sleepy: ["closed", "flat"],
    focused: ["focus", "flat"],
  };
  const [ek, mk] = grin && e === "cool" ? (["open", "grin"] as const) : map[e];
  const out = [...eyes(blink && ek !== "glasses" ? "closed" : ek), ...mouth(mk)];
  if (e === "love") out.push(P("heart", "root", "magenta", 40, heart, 1));
  if (e === "surprised") out.push(P("bang", "root", "gold", 40, union(capsule([52, 18], [52, 23], 0.8), circle(52, 25.6, 0.8)), 1));
  if (e === "confused") out.push(P("q", "root", "cyan", 40, union(arc(52, 18.5, 2, 0.6, -Math.PI, 0.9), capsule([53.2, 20], [52, 22], 0.6), circle(52, 24.4, 0.7)), 1));
  return out;
}
