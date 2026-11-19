import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Safari doesn't paint the ad cards (transform + backdrop-blur layers) in CSS multi-column columns 2+.
describe("ad grids", () => {
  it.each(["ad-gallery.tsx", "locked-bonus-section.tsx"])("%s uses grid, not CSS columns", (file) => {
    const src = readFileSync(join(__dirname, "..", file), "utf8");
    expect(src).not.toMatch(/\b(sm:|lg:)?columns-\d/);
    expect(src).toMatch(/grid items-start gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3/);
  });
});
