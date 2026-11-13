import { describe, expect, it } from "vitest";
import { pickScore, wantsSilence } from "../src/studio/music-fallback";

describe("music fallback", () => {
  it("fits the style to the business", () => {
    expect(pickScore("cozy coffee shop promo", 15, "a").style).toBe("lofi");
    expect(pickScore("Black Friday sneaker sale, 40% off", 15, "a").style).toBe("pulse");
    expect(pickScore("invoicing SaaS feature promo", 20, "a").style).toBe("minimal");
    expect(pickScore("luxury real estate listing", 20, "a").style).toBe("cinematic");
  });
  it("varies per session and stays in range", () => {
    const a = pickScore("bold gym ad", 12, "s1"), b = pickScore("bold gym ad", 12, "s2");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(a.bpm as number).toBeGreaterThanOrEqual(116);
    expect(a.bpm as number).toBeLessThanOrEqual(140);
    expect(a.duration).toBe(12);
  });
  it("respects silence", () => {
    expect(wantsSilence("no music please")).toBe(true);
    expect(wantsSilence("music: lofi")).toBe(false);
  });
});
