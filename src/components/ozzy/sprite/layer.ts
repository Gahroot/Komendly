/** A pixel layer: rows of palette keys placed at (x, y) on the 40x40 grid. */
export interface Layer {
  readonly x: number;
  readonly y: number;
  readonly rows: readonly string[];
}

export const GRID = 40;

export function layer(x: number, y: number, rows: readonly string[]): Layer {
  return { x, y, rows };
}

/** Mirror a layer horizontally around the grid's centre column. */
export function mirror(src: Layer): Layer {
  const w = Math.max(...src.rows.map((r) => r.length));
  return {
    x: GRID - src.x - w,
    y: src.y,
    rows: src.rows.map((r) => r.padEnd(w, ".").split("").reverse().join("")),
  };
}

export function shift(src: Layer, dx: number, dy: number): Layer {
  return { x: src.x + dx, y: src.y + dy, rows: src.rows };
}
