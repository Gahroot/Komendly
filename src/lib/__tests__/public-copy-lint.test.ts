import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DREAM_HEADLINE, DREAM_SUB, DREAM_PROCESS, OBJECTION_STACK } from "../ads/dream-copy";
import { AUTOPILOT_GUARANTEE_LINE } from "../ads/public-offer";
import { autopilotOfferCopy } from "../ads/roofer-offer";

const BANNED = [/guarantee[ds]? (leads|sales|revenue|roi)/i, /\bget \d+ (leads|customers|sign-?ups|appointments)/i, /one[- ]click/i];
const FILES = ["src/app/page.tsx", "src/app/pricing/layout.tsx", "src/app/free-ads/page.tsx", "src/app/free-ads/roofers/page.tsx", "src/components/billing/team-offer.tsx", "src/components/billing/ozzy-pricing.tsx", "src/components/ads/team/team-offer.tsx", "src/components/ads/autopilot-offer-card.tsx", "src/components/ads/offer-nudge.tsx", "src/components/ads/offer-download-modal.tsx", "src/components/studio/studio-hero.tsx", "src/components/studio/studio-closing.tsx"];

describe("public offer copy lint", () => {
  const strings = [DREAM_HEADLINE, DREAM_SUB, DREAM_PROCESS, AUTOPILOT_GUARANTEE_LINE, ...OBJECTION_STACK.flatMap((o) => [o.worry, o.answer]), JSON.stringify(autopilotOfferCopy(3))];
  it("shared copy has no banned promise phrases", () => {
    for (const s of strings) for (const re of BANNED) expect(s).not.toMatch(re);
  });
  it("page sources have no banned promise phrases", () => {
    for (const f of FILES) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const re of BANNED) expect(src, `${f} ${re}`).not.toMatch(re);
    }
  });
  it("headline sells the dream and has no jargon", () => {
    expect(DREAM_HEADLINE).not.toMatch(/credit|Ad Department|AI Marketing Team/i);
  });
});
