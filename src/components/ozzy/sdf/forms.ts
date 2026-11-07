/** Per-form props, pose and face for the SDF rig. Same base body; only these differ. */
import type { OzzyExpression, OzzyForm, OzzyState } from "../types";
import { P, type Part } from "./model";
import { arc, capsule, circle, ellipse, polygon, star, subtract, union, type Vec } from "./primitives";
import type { Pose } from "./rig";

export const SDF_FORM_LIST = ["classic", "joyful", "explorer", "creator", "developer", "adventurer", "chill", "ascended"] as const satisfies readonly OzzyForm[];

const armR = P("armR", "pawR", "fur", 6.8, capsule([37.5, 45], [37, 54], 2.4, 2.7), 3);
const armL = P("armL", "pawL", "fur", 6.8, capsule([26.5, 45], [27, 54], 2.4, 2.7), 3);
/** Cape sleeve draping over the upper forearm so raised paws read as attached. */
const sleeveR = P("sleeveR", "pawR", "cape", 9.5, union(capsule([37.5, 45.5], [37.6, 50.5], 2.9, 3.3), polygon([[34.2, 50], [41, 50], [40.2, 52.5], [35, 52]])), 4, true);
const sleeveL = P("sleeveL", "pawL", "cape", 9.5, union(capsule([26.5, 45.5], [26.4, 50.5], 2.9, 3.3), polygon([[29.8, 50], [23, 50], [23.8, 52.5], [29, 52]])), 4, true);

function sparkle(cx: number, cy: number, r: number): Vec[] {
  const k = r * 0.28;
  return [[cx, cy - r], [cx + k, cy - k], [cx + r, cy], [cx + k, cy + k], [cx, cy + r], [cx - k, cy + k], [cx - r, cy], [cx - k, cy - k]];
}

function joyful(): Part[] {
  return [armR, sleeveR, P("sparkle", "fx", "gold", 40, polygon(sparkle(54, 9, 4)), 1.5), P("sparkle2", "fx", "gold", 40, polygon(sparkle(59, 15, 1.8)), 1)];
}

function explorer(): Part[] {
  return [
    armR,
    sleeveR,
    P("ring1", "ring1", "cyan", 41, subtract(ellipse(54, 27, 8.5, 2.6, -0.3), ellipse(54, 27, 7.4, 1.7, -0.3)), 1),
    P("ring2", "ring2", "magenta", 39, subtract(ellipse(54, 27, 7.5, 2.3, 0.7), ellipse(54, 27, 6.5, 1.4, 0.7)), 1),
    P("orb", "orb", "magenta", 40, circle(54, 27, 5), 5),
    P("orbCore", "orb", "glyph", 40.5, circle(52.5, 25.5, 1.5), 1),
  ];
}

function creator(): Part[] {
  const k = union(capsule([30, 46.5], [30, 52], 0.6), capsule([30.6, 49.3], [34, 46.5], 0.6), capsule([30.6, 49.3], [34, 52], 0.6));
  return [
    P("lid", "root", "hat", 6.5, polygon([[20, 43], [44, 43], [46, 56], [18, 56]], 1), 6, true),
    P("glyph", "root", "glyph", 6.6, k, 1),
    P("base", "root", "hatDark", 6.4, polygon([[14, 56], [50, 56], [51, 58.5], [13, 58.5]], 0.5), 2),
  ];
}

function developer(): Part[] {
  const lines = Array.from({ length: 5 }, (_, i) => capsule([4, 22 + i * 2], [15, 22 + i * 2], 0.25));
  return [
    armL,
    sleeveL,
    P("panel", "panel", "holo", 40, polygon([[2, 20], [16, 20], [16, 31], [2, 31]], 1), 2),
    P("scan", "panel", "holoDark", 41, union(...lines), 1),
    P("mountain", "panel", "glyph", 42, polygon([[4.5, 30], [8.5, 24.5], [11, 27.5], [12.5, 26], [14.5, 30]]), 1),
    P("sun", "panel", "gold", 42, circle(12.5, 22.8, 1.3), 1),
  ];
}

function adventurer(): Part[] {
  const frame = union(circle(26, 17.6, 3.3), circle(38, 17.6, 3.3), capsule([28, 17.6], [36, 17.6], 0.7));
  return [
    P("strap", "body", "leather", 6.5, capsule([24, 40], [41, 53], 1.1), 1.5, true),
    P("satchel", "body", "leather", 6.6, polygon([[38, 50], [46, 50], [45.5, 56.5], [38.5, 56.5]], 1), 3, true),
    P("flap", "body", "leather", 6.7, polygon([[37.8, 50], [46.2, 50], [45, 53], [39, 53]], 0.6), 1.5, true),
    P("buckle", "body", "gold", 6.8, circle(42, 53, 0.8), 1),
    P("gogFrame", "hat", "nose", 23, union(frame, circle(26, 17.6, 3.8), circle(38, 17.6, 3.8)), 1.5),
    P("gogLens", "hat", "cyan", 23.5, union(circle(26, 17.6, 2.7), circle(38, 17.6, 2.7)), 2),
    P("gogGlint", "hat", "white", 24, union(circle(25.2, 16.8, 0.7), circle(37.2, 16.8, 0.7)), 1),
  ];
}

function chill(): Part[] {
  const z = (x: number, y: number, k: number) => union(capsule([x, y], [x + k, y], 0.45), capsule([x + k, y], [x, y + k], 0.45), capsule([x, y + k], [x + k, y + k], 0.45));
  return [
    P("tailWrap", "root", "fur", 7.5, union(capsule([51, 55], [24, 58.6], 3.4, 2.8), circle(46, 54.2, 3.2), circle(40, 55.3, 3), circle(34, 56.4, 2.9), circle(28.5, 57.4, 2.7), circle(52, 52.5, 2.6)), 3, true),
    P("tailWrapTip", "root", "cream", 7.6, union(circle(20.5, 58, 2.7), circle(18, 56.4, 1.7), circle(17.6, 59.4, 1.5), circle(22.5, 56, 1.4)), 2, true),
    P("z1", "fx", "glyph", 40, z(48, 16, 3), 1),
    P("z2", "fx", "glyph", 40, z(53, 7, 5), 1),
  ];
}

function ascended(): Part[] {
  return [
    P("crescent", "root", "gold", 0, union(arc(32, 31, 22, 0.9, -Math.PI, 0.18), arc(32, 31, 22, 0.9, Math.PI - 0.18, Math.PI)), 1),
    P("arcSp1", "fx", "white", 0.1, polygon(sparkle(10.5, 27, 2)), 1),
    P("arcSp2", "fx", "white", 0.1, polygon(sparkle(47.5, 15.5, 1.6)), 1),
    P("capeWing", "wing", "cape", 0.8, polygon([[21, 38], [20, 50], [15, 56], [11, 53.5], [7, 55.5], [4, 51], [1, 50], [3, 45], [1.5, 41], [8, 38.5]], 1), 6, true),
    P("wingFold1", "wing", "hatDark", 0.9, capsule([17, 41], [12, 53], 0.9, 0.6), 1),
    P("wingFold2", "wing", "hatDark", 0.9, capsule([12, 40.5], [5.5, 50.5], 0.8, 0.5), 1),
    P("ledge", "root", "rock", 0.5, polygon([[15, 58], [49, 58], [52, 64], [12, 64]], 1), 4),
    P("ledgeTop", "root", "rockTop", 0.6, polygon([[15, 57.6], [49, 57.6], [49.4, 59], [14.6, 59]], 0.5), 1),
    P("starCore", "hat", "white", 22.5, star(30.5, 12, 1.8, 0), 1),
    P("sp1", "fx", "gold", 40, polygon(sparkle(54, 9, 3)), 1.5),
    P("sp2", "fx", "gold", 40, polygon(sparkle(8, 16, 2.2)), 1),
    P("sp3", "fx", "glyph", 40, polygon(sparkle(57, 30, 1.6)), 1),
  ];
}

const BUILD: Record<(typeof SDF_FORM_LIST)[number], () => Part[]> = { classic: () => [], joyful, explorer, creator, developer, adventurer, chill, ascended };

export function formProps(form: (typeof SDF_FORM_LIST)[number]): Part[] {
  return BUILD[form]();
}

/** Face the form wants when the state is on its neutral default. */
export function formFace(form: OzzyForm, e: OzzyExpression): OzzyExpression {
  if (e !== "neutral") return e;
  return form === "joyful" ? "happy" : form === "creator" ? "focused" : form === "developer" ? "excited" : form === "chill" ? "sleepy" : form === "adventurer" ? "cool" : e;
}

export function formPose(form: OzzyForm, s: OzzyState, w: number, t: number): Pose {
  const pulse = Math.sin(w * 4);
  if (form === "joyful") {
    const tw = 0.55 + 0.45 * Math.abs(Math.sin(w * 3));
    return { head: { rot: 0.1 }, pawR: { rot: -1.7 }, fx: { sx: tw, sy: tw } };
  }
  if (form === "explorer") {
    const r = 1 + s.orb * 0.15 + pulse * 0.03;
    return {
      pawR: { rot: -2 + Math.sin(w * 2) * 0.05 },
      eyes: { dx: 1, dy: -0.3 },
      head: { rot: -0.05 },
      orb: { sx: r, sy: r, dy: Math.sin(w * 1.5) * 0.8 },
      ring1: { rot: w * 1.2 },
      ring2: { rot: -w * 0.9 },
    };
  }
  if (form === "creator") {
    const typing = s.motion === "type" && w > 0;
    const beat = Math.floor(t / 0.12) % 2;
    return {
      pawL: { dy: -11 + (typing && beat ? 1 : 0) },
      pawR: { dy: -11 + (typing && !beat ? 1 : 0) },
      eyes: { dy: 0.6 },
      head: { rot: 0, dy: 0.5 },
    };
  }
  if (form === "developer") {
    const flick = Math.sin(t * 37) > 0.93 ? 0.4 : 0;
    return { pawL: { rot: 1.85 }, eyes: { dx: -1 }, head: { rot: -0.05 }, panel: { dx: flick, dy: 9 + Math.sin(w * 1.3) * 0.6 } };
  }
  if (form === "adventurer") {
    return { body: { rot: -0.03 }, head: { dy: 0.8, rot: 0.04 }, eyes: { dx: 0.5 } };
  }
  if (form === "chill") {
    const rise = still(w) ? 0 : (w * 0.4) % 1;
    const f = 1 - rise * 0.6;
    const by = 0.62 * (1.015 + Math.sin(w * 1.6) * 0.015);
    return {
      body: { sx: 1.35, sy: by },
      head: { sx: 1 / 1.35, sy: 1 / by, dy: 9, rot: 0.08 },
      hat: { rot: 0.18, dy: 1.5, dx: 1 },
      earL: { rot: -1.1, dy: 7, dx: 6, sy: 0.75 },
      earR: { rot: 1.1, dy: 7, dx: -6, sy: 0.75 },
      tail: { sx: 0.01, sy: 0.01 },
      pawL: { dx: -3 },
      pawR: { dx: 3 },
      fx: { dy: -rise * 6, sx: f, sy: f },
    };
  }
  if (form === "ascended") {
    const fl = Math.sin(w * 3);
    const tw = 0.6 + 0.4 * Math.abs(Math.sin(w * 2.5));
    return { body: { sy: 1.04 }, head: { dy: -0.6, rot: -0.03 }, cape: { rot: -0.03 }, wing: { rot: -0.08 + fl * 0.07, sx: 1 + fl * 0.05 }, fx: { sx: tw, sy: tw } };
  }
  return {};
}

const still = (w: number): boolean => w === 0;
