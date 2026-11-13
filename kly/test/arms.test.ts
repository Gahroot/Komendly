import { describe, expect, it } from "vitest";
import { checkArmContent, judgeArms, leadReward, MIN_SAMPLES, pickArm, posteriorMean, seedArms, seededRng, type ArmStats } from "../src/arms";

const arm = (id: string, o: Partial<ArmStats> = {}): ArmStats => ({ id, dimension: "subject", key: id, status: "active", sends: 0, clicks: 0, positiveReplies: 0, signups: 0, paid: 0, revenueCents: 0, ...o });

describe("reward ladder", () => {
  it("paid > signup > positive reply > click > nothing", () => {
    const r = (o: Partial<Parameters<typeof leadReward>[0]>) => leadReward({ clicked: false, positive: false, signedUp: false, paid: false, revenueCents: 0, ...o });
    expect(r({ paid: true })).toBeGreaterThan(r({ signedUp: true }));
    expect(r({ signedUp: true })).toBeGreaterThan(r({ positive: true }));
    expect(r({ positive: true })).toBeGreaterThan(r({ clicked: true }));
    expect(r({ clicked: true })).toBeGreaterThan(r({}));
    expect(r({ paid: true, revenueCents: 50_000 })).toBe(1);
  });
  it("posterior mean follows the ladder for equal sends", () => {
    const m = (o: Partial<ArmStats>) => posteriorMean(arm("a", { sends: 100, ...o }));
    expect(m({ paid: 2, signups: 2 })).toBeGreaterThan(m({ signups: 2 }));
    expect(m({ signups: 2 })).toBeGreaterThan(m({ positiveReplies: 2 }));
    expect(m({ positiveReplies: 2 })).toBeGreaterThan(m({ clicks: 2 }));
  });
});

describe("Thompson selection", () => {
  it("is deterministic for a seed and favours the clearly better arm", () => {
    const arms = [arm("bad", { sends: 200, clicks: 2 }), arm("good", { sends: 200, signups: 30, clicks: 60, positiveReplies: 40 })];
    const rng = seededRng(42);
    let good = 0;
    for (let i = 0; i < 200; i++) if (pickArm(arms, rng, 0)?.id === "good") good++;
    expect(good).toBeGreaterThan(190);
    expect(pickArm(arms, seededRng(7), 0)?.id).toBe(pickArm(arms, seededRng(7), 0)?.id);
  });
  it("explores at 100% uniformly and handles no arms", () => {
    const arms = [arm("a"), arm("b"), arm("c")];
    const seen = new Set<string>();
    const rng = seededRng(1);
    for (let i = 0; i < 100; i++) seen.add(pickArm(arms, rng, 100)?.id ?? "");
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
    expect(pickArm([], rng, 20)).toBeNull();
  });
});

describe("champion / retire", () => {
  it("no verdict below the minimum samples", () => {
    expect(judgeArms([arm("a", { sends: MIN_SAMPLES - 1, signups: 20 }), arm("b", { sends: 10 })])).toEqual({ champion: null, retire: [] });
  });
  it("crowns the best mature arm and retires clearly worse ones, keeping at least 2 live", () => {
    const v = judgeArms([arm("a", { sends: 300, signups: 40, clicks: 80 }), arm("b", { sends: 300 }), arm("c", { sends: 300, clicks: 1 }), arm("d", { sends: 5 })]);
    expect(v.champion).toBe("a");
    expect(v.retire.sort()).toEqual(["b", "c"]);
    const two = judgeArms([arm("a", { sends: 300, signups: 40 }), arm("b", { sends: 300 })]);
    expect(two.retire).toEqual([]);
  });
  it("does not retire an arm that is only slightly worse", () => {
    const v = judgeArms([arm("a", { sends: 60, clicks: 6 }), arm("b", { sends: 60, clicks: 5 }), arm("c", { sends: 60, clicks: 5 })]);
    expect(v.retire).toEqual([]);
  });
});

describe("seeds", () => {
  it("every seed arm passes validation", () => {
    for (const a of seedArms()) expect(checkArmContent(a.dimension, a.content), `${a.dimension}/${a.key}`).toBeNull();
  });
});
