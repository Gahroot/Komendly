import { describe, expect, it } from "vitest";
import { writeCopy } from "../src/lifecycle/copywriter";
import type { AIProvider } from "../src/providers/types";
import type { CopyContext } from "../../src/lib/ads/lifecycle/copy";

const usage = { costMicros: 0, latencyMs: 1 };
function fake(json: unknown): AIProvider {
  return { name: "codex", text: async () => ({ text: "", json, usage }), image: async () => { throw new Error("no"); }, health: async () => ({ ok: true }) };
}
const ctx: CopyContext = { kind: "offer_24h", firstName: "Jane", brandName: "Acme", offer: "Coffee", audience: "office workers", pains: ["slow mornings"], headlines: ["Wake up faster"], readyAdCount: 11, offerExpiresAt: new Date("2026-11-04T00:00:00Z") };
const now = new Date("2026-11-03T00:00:00Z");

describe("lifecycle copywriter", () => {
  it("uses valid AI copy", async () => {
    const r = await writeCopy(fake({ subject: "Acme's launch offer ends tomorrow", preheader: "p", paragraphs: ["Hi Jane,", "Your first month of Ozzy Ad Department is $97, then $197 a month."], ctaLabel: "See the offer" }), ctx, now);
    expect(r.source).toBe("ai");
  });
  it("falls back on invented prices", async () => {
    const r = await writeCopy(fake({ subject: "Deal", preheader: "p", paragraphs: ["Hi Jane,", "Only $19 today!"], ctaLabel: "Buy" }), ctx, now);
    expect(r.source).toBe("fallback");
    expect(r.copy.paragraphs.join(" ")).toContain("$97");
  });
  it("falls back when the provider throws", async () => {
    const p = fake(null);
    const r = await writeCopy({ ...p, text: async () => { throw new Error("codex down"); } }, ctx, now);
    expect(r.source).toBe("fallback");
  });
});
