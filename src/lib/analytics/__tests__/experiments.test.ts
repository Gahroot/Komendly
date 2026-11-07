import { describe, expect, it } from "vitest";
import { EXPERIMENTS, applyOverride, assignVariant, completeAssignments, experimentParams, parseAssignments, serializeAssignments } from "../experiments";

describe("experiments", () => {
  it("assigns deterministically", () => {
    expect(assignVariant("abc", EXPERIMENTS.home_hero)).toBe(assignVariant("abc", EXPERIMENTS.home_hero));
  });
  it("splits roughly by weight", () => {
    let companion = 0;
    for (let i = 0; i < 4000; i++) if (assignVariant(`user-${i}`, EXPERIMENTS.home_hero) === "companion") companion++;
    expect(companion / 4000).toBeGreaterThan(0.45);
    expect(companion / 4000).toBeLessThan(0.55);
  });
  it("forces control when inactive", () => {
    expect(assignVariant("x", { ...EXPERIMENTS.home_hero, active: false })).toBe("control");
  });
  it("round-trips and drops junk", () => {
    const a = parseAssignments(serializeAssignments({ home_hero: "companion" }) + "|nope.x|home_hero.bad");
    expect(a).toEqual({ home_hero: "companion" });
  });
  it("keeps existing valid assignment and fills missing", () => {
    expect(completeAssignments("z", { home_hero: "control" }).home_hero).toBe("control");
    expect(completeAssignments("z", {}).home_hero).toBeDefined();
  });
  it("applies QA override and exposes params", () => {
    const a = applyOverride({ home_hero: "control" }, "home_hero.companion");
    expect(experimentParams(a)).toEqual({ exp_home_hero: "companion" });
  });
});
