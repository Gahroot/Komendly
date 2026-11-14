import { describe, expect, it } from "vitest";
import { fixGsapUrls } from "../src/studio/script-urls";

describe("gsap url guard", () => {
  it("repairs a doubled path and keeps plugins", () => {
    const r = fixGsapUrls('<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap@3.14.2/dist/gsap.min.js"></script><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap@3.14.2/dist/SplitText.min.js"></script>');
    expect(r.fixed).toBe(2);
    expect(r.html).toContain('"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"');
    expect(r.html).toContain('"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/SplitText.min.js"');
  });
  it("leaves good URLs alone", () => {
    for (const u of ["https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js", "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js", "https://unpkg.com/gsap@3.12.5/dist/ScrollTrigger.min.js"]) {
      expect(fixGsapUrls(`<script src="${u}"></script>`).fixed).toBe(0);
    }
  });
});
