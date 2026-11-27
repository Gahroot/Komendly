import { describe, expect, it } from "vitest";
import { rewriteRetirements, seedArms } from "../src/arms";

const t = (iso: string) => new Date(iso);
describe("founder copy rewrite", () => {
  it("seeds the 3 Nolan bodies + follow-up and no longer seeds the old local bodies", () => {
    const keys = seedArms().filter((a) => a.dimension === "body" || a.dimension === "followup").map((a) => a.key);
    for (const k of ["q-who-does-ads", "q-more-jobs", "q-useful-or-not", "q-followup"]) expect(keys).toContain(k);
    for (const k of ["hz-gift-outcome", "hz-which-job", "hz-headline", "hz-followup"]) expect(keys).not.toContain(k);
    for (const k of ["nolan-meta-live", "nolan-would-you-run", "nolan-no-agency", "nolan-followup"]) expect(keys).not.toContain(k);
    for (const k of ["made-this", "headline-hook", "oc-want-one", "still-here"]) expect(keys).not.toContain(k);
  });
  it("retires old seeds and older local AI copy, keeps agency, subjects and newer AI arms (the Nolan variants are retired by the Hormozi rewrite)", () => {
    const arms = [
      { id: "old", dimension: "body", key: "made-this", status: "champion", content: { template: "x" }, origin: "seed", createdAt: t("2026-11-11T00:00:00Z") },
      { id: "oldfu", dimension: "followup", key: "still-here", status: "active", content: { template: "x" }, origin: "seed", createdAt: t("2026-11-11T00:00:00Z") },
      { id: "ai-old", dimension: "body", key: "ai-x", status: "active", content: { template: "x" }, origin: "ai", createdAt: t("2026-11-18T00:00:00Z") },
      { id: "ai-new", dimension: "body", key: "ai-y", status: "active", content: { template: "x" }, origin: "ai", createdAt: t("2026-11-25T00:00:00Z") },
      { id: "agency", dimension: "body", key: "agency-roster", status: "active", content: { template: "x", audience: "agency" }, origin: "seed", createdAt: t("2026-11-11T00:00:00Z") },
      { id: "subj", dimension: "subject", key: "made-you-something", status: "active", content: { template: "x" }, origin: "seed", createdAt: t("2026-11-11T00:00:00Z") },
      { id: "nolan", dimension: "body", key: "nolan-meta-live", status: "active", content: { template: "x" }, origin: "seed", createdAt: t("2026-11-21T00:00:00Z") },
      { id: "gone", dimension: "body", key: "too-busy", status: "retired", content: { template: "x" }, origin: "seed", createdAt: t("2026-11-11T00:00:00Z") },
    ];
    expect(rewriteRetirements(arms).sort()).toEqual(["ai-old", "nolan", "old", "oldfu"]);
  });
});
