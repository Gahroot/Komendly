import { layer, type Layer } from "./layer";

export const ZZZ = [
  layer(30, 8, ["lll", ".l.", "lll"]),
  layer(33, 3, ["llll", "..l.", ".l..", "llll"]),
];
export const QUESTION = layer(32, 4, ["ccc", "..c", ".c.", "...", ".c."]);
export const BANG = layer(33, 4, ["g", "g", "g", ".", "g"]);
export const HEART = layer(31, 4, ["pp.pp", "ppppp", ".ppp.", "..p.."]);
export const SPARKLE = layer(0, 0, [".g.", "geg", ".g."]);

/** Gold crescent arc behind the Ascended form, generated as a pixel grid. */
function crescent(): Layer {
  const rows: string[] = [];
  const cx = 19.5;
  const cy = 21;
  for (let y = 0; y < 38; y++) {
    let row = "";
    for (let x = 0; x < 40; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const d2 = Math.hypot(x - cx - 3, y - cy + 2);
      const inRing = d <= 19 && d >= 17.2 && d2 >= 17.5;
      row += inRing && y < 30 ? (d > 18.3 ? "g" : "w") : ".";
    }
    rows.push(row);
  }
  return layer(0, 0, rows);
}
export const CRESCENT = crescent();
