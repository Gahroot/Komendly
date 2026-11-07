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

  it("renders a frame fast enough for the live mascot", () => {
    sdfFrame(INITIAL_OZZY, 0, false, false); // warm-up: parts are built lazily on first use
    // Best batch of 6 (not the mean): background load inflates some batches, the fastest reflects real cost.
    // Measured ~4-5ms per frame on an idle M-series Mac; the live renderer draws at most 12 frames/s.
    let best = Infinity;
    for (let batch = 0; batch < 6; batch++) {
      const t0 = performance.now();
      for (let i = 0; i < 10; i++) sdfFrame(INITIAL_OZZY, (batch * 10 + i) * 0.1, false, false);
      best = Math.min(best, (performance.now() - t0) / 10);
    }
    expect(best).toBeLessThan(10);
  });
});
