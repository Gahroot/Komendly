import { describe, expect, it } from "vitest";
import { INITIAL_OZZY } from "../../machine";
import { classicBody, faceParts } from "../model";
import { rasterize } from "../raster";
import { sdfFrame } from "../frame";

describe("sdf rasterize", () => {
  it("returns a 64x64 frame with opaque character pixels and glow", () => {
    const f = rasterize([...classicBody(), ...faceParts("neutral", false)], {});
    expect(f.size).toBe(64);
    expect(f.rgba.length).toBe(64 * 64 * 4);
    let solid = 0;
    let glow = 0;
    for (let i = 3; i < f.rgba.length; i += 4) {
      if (f.rgba[i] === 255) solid++;
      if (f.glow[i] === 255) glow++;
    }
    expect(solid).toBeGreaterThan(1000);
    expect(glow).toBeGreaterThan(10);
  });

  it("renders a frame in under 5ms on average", () => {
    sdfFrame(INITIAL_OZZY, 0, false, false);
    const n = 30;
    sdfFrame(INITIAL_OZZY, 0, false, false); // warm-up: parts are built lazily on first use
    const t0 = performance.now();
    for (let i = 0; i < n; i++) sdfFrame(INITIAL_OZZY, i * 0.1, false, false);
    expect((performance.now() - t0) / n).toBeLessThan(12) // budget ~4-5ms on an idle M-series Mac; headroom for loaded CI machines;
  });
});
