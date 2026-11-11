import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without types
import { autoAnswer, decideAsk, isTechnicalQuestion } from "../src/modules/ezmotion/agent/ask-filter.mjs";

const q = (id: string, question: string, options: { label: string; recommended?: boolean }[] = [], kind = "choice") => ({ id, question, kind, options });
const tech = q("t", "The studio has too many background preview sessions open to export your video. May I close those sessions and continue?", [
  { label: "Yes, close them and finish the video", recommended: true },
  { label: "No, leave them open and stop for now" },
]);

describe("studio ask filter", () => {
  it("flags technical questions (the live bug) but not creative ones", () => {
    expect(isTechnicalQuestion(tech)).toBe(true);
    expect(isTechnicalQuestion(q("m", "Should it have music?", [{ label: "Yes, an upbeat track" }, { label: "Keep it silent" }]))).toBe(false);
    expect(isTechnicalQuestion(q("w", "Where will people mostly watch it?", [{ label: "Instagram and TikTok" }]))).toBe(false);
    expect(isTechnicalQuestion(q("i", "Can I install a font package?"))).toBe(true);
  });
  it("auto-answers technical questions with the recommended option", () => {
    expect(autoAnswer(tech)).toBe("Yes, close them and finish the video");
    expect(autoAnswer(q("c", "Continue?", [], "confirm"))).toBe("yes");
    expect(autoAnswer(q("x", "Anything?"))).toMatch(/go ahead/);
  });
  it("forwards creative questions only in the first turn before building, and only once", () => {
    const creative = [q("w", "Where will people mostly watch it?", [{ label: "Reels", recommended: true }]), q("m", "Music?", [{ label: "Upbeat" }])];
    expect(decideAsk([...creative, tech], { turnIndex: 0, building: false, askedBefore: false })).toEqual({ forward: creative, answers: { t: "Yes, close them and finish the video" } });
    expect(decideAsk(creative, { turnIndex: 0, building: true, askedBefore: false }).forward).toEqual([]);
    expect(decideAsk(creative, { turnIndex: 2, building: false, askedBefore: false }).forward).toEqual([]);
    expect(decideAsk(creative, { turnIndex: 0, building: false, askedBefore: true }).answers).toEqual({ w: "Reels", m: "Upbeat" });
  });
});
