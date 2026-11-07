/** Per-material colour ramps, lightest first. */
export type Material =
  | "fur"
  | "cream"
  | "hat"
  | "cape"
  | "gold"
  | "eye"
  | "white"
  | "nose"
  | "tongue"
  | "cyan"
  | "magenta"
  | "hatDark"
  | "irisLow"
  | "blush"
  | "glyph"
  | "holo"
  | "holoDark"
  | "leather"
  | "rock"
  | "rockTop";

export interface MaterialDef {
  ramp: readonly string[];
  /** Flat materials skip lighting and use ramp[0]. */
  flat?: boolean;
  emissive?: boolean;
}

export const MATERIALS: Record<Material, MaterialDef> = {
  fur: { ramp: ["#ffc178", "#f7a04a", "#f08a2e", "#c4621c", "#8a3f12"] },
  cream: { ramp: ["#fffaf0", "#fff1d6", "#ffe1b8", "#e8b98a"] },
  hat: { ramp: ["#c9a2ff", "#a970ff", "#8f55f5", "#6a2fd6", "#4a1c9e", "#2e1170"] },
  cape: { ramp: ["#a970ff", "#8f55f5", "#6a2fd6", "#4a1c9e", "#2e1170"] },
  gold: { ramp: ["#fff3b0", "#ffcf4a", "#e8a21c", "#a8620e"], emissive: true },
  eye: { ramp: ["#1a0f3a"], flat: true },
  white: { ramp: ["#ffffff"], flat: true },
  nose: { ramp: ["#3a2a5a", "#1a0f3a"] },
  tongue: { ramp: ["#ff7aa0", "#e0507e"] },
  hatDark: { ramp: ["#6a2fd6", "#4a1c9e", "#2e1170"] },
  irisLow: { ramp: ["#3a2a8e"], flat: true },
  glyph: { ramp: ["#e9dcff"], flat: true, emissive: true },
  holo: { ramp: ["#a6f4ff", "#5ee6ff", "#1fb3d6"], emissive: true },
  holoDark: { ramp: ["#127a99"], flat: true, emissive: true },
  leather: { ramp: ["#9a6236", "#7a4a26", "#5a3418"] },
  rock: { ramp: ["#3a1a4a", "#2a1238"] },
  rockTop: { ramp: ["#7a4a9e", "#5a2a7a"] },
  blush: { ramp: ["#ff9a7a"], flat: true },
  cyan: { ramp: ["#e6fdff", "#5ee6ff", "#1fb3d6"], emissive: true },
  magenta: { ramp: ["#f0a6ff", "#d24dff", "#9a1fcc"], emissive: true },
};

export const OUTLINE = "#1a0f3a";

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
