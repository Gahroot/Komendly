/** Ozzy palette. Each key is one character used in the sprite grids. "." = transparent. */
export const OZZY_PALETTE = {
  o: "#1a0f3a", // outline
  i: "#2a1a6e", // indigo (hat shade)
  v: "#7b3cf0", // violet (hat / cape)
  l: "#a970ff", // light violet (hat light)
  m: "#d24dff", // magenta
  c: "#5ee6ff", // cyan
  g: "#ffcf4a", // gold
  w: "#fff1d6", // cream
  f: "#f08a2e", // fur orange
  s: "#c4621c", // fur shade
  n: "#2b1a12", // nose / dark
  e: "#ffffff", // eye shine
  p: "#ff7aa8", // pink (tongue / blush / heart)
  b: "#3a2a8a", // dark blue-violet (laptop / glasses)
} as const;

export type PaletteKey = keyof typeof OZZY_PALETTE;

/** Cells that receive the bloom pass. */
export const GLOW_KEYS: ReadonlySet<string> = new Set(["g", "c", "m", "e"]);

export function isPaletteKey(ch: string): ch is PaletteKey {
  return Object.prototype.hasOwnProperty.call(OZZY_PALETTE, ch);
}
