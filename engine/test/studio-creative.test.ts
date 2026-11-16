import { describe, expect, it } from "vitest";
import { conceptPrompt, editReworkPrompt, needsRework, reworkPrompt, tastePrompt } from "../src/studio/creative";
import { turnPrompt } from "../src/studio/brief";

describe("creative direction", () => {
  it("concept prompt carries the request and the brand assets", () => {
    const p = conceptPrompt({ userText: "15s promo for my bakery", brand: { name: "Crumb", url: "https://crumb.co", colors: [{ hex: "#C05A3A", role: "primary" }], photos: [{ file: "a.jpg", caption: "croissants" }], site: [{ file: "01-hero.png", kind: "hero", label: "Fresh daily" }] } });
    expect(p).toContain("15s promo for my bakery");
    expect(p).toContain("brand/photos/a.jpg (croissants)");
    expect(p).toContain("brand/site/01-hero.png");
    expect(conceptPrompt({ userText: "x", brand: null })).toContain("No brand on file");
  });
  it("rework only when it matters", () => {
    expect(needsRework({ score: 8, templated: false, broken: [], notes: ["x"], requestDone: true, missed: "" })).toBe(false);
    expect(needsRework({ score: 9, templated: false, broken: ["2s text overlaps"], notes: [], requestDone: true, missed: "" })).toBe(true);
    expect(needsRework({ score: 6, templated: false, broken: [], notes: [], requestDone: true, missed: "" })).toBe(true);
    expect(needsRework({ score: 7, templated: true, broken: [], notes: [], requestDone: true, missed: "" })).toBe(true);
    expect(reworkPrompt({ score: 5, templated: true, broken: ["3s cut-off text"], notes: ["add depth"], requestDone: true, missed: "" })).toContain("FIX: 3s cut-off text");
  });
  it("turn prompt points the builder at the concept", () => {
    expect(turnPrompt({ userText: "hi", firstTurn: true, attached: [], concept: true })).toContain("./concept.md");
    expect(turnPrompt({ userText: "hi", firstTurn: true, attached: [] })).not.toContain("concept.md");
  });
});

import { sameSite } from "../src/studio/turn";
describe("launch brand match", () => {
  it("matches hosts without www", () => {
    expect(sameSite("https://www.komendly.com", "https://komendly.com/x")).toBe(true);
    expect(sameSite("https://bridgetowndental.com", "https://www.komendly.com")).toBe(false);
    expect(sameSite(null, "https://a.com")).toBe(false);
  });
});

import { isForSomeoneElse } from "../src/studio/turn";
describe("client work", () => {
  it("spots videos for someone else", () => {
    expect(isForSomeoneElse("This one is for a client, not my business: don't use my logo")).toBe(true);
    expect(isForSomeoneElse("make a promo for my bakery")).toBe(false);
  });
});

describe("taste review on revisions", () => {
  const base = { score: 5, templated: true, broken: [] as string[], notes: [] as string[], requestDone: true, missed: "" };
  it("reworks a revision only when the change didn't land or something is broken", () => {
    expect(needsRework(base, true)).toBe(false);
    expect(needsRework({ ...base, requestDone: false, missed: "the end card is still green" }, true)).toBe(true);
    expect(needsRework({ ...base, broken: ["14s headline unreadable"] }, true)).toBe(true);
    const p = editReworkPrompt({ ...base, requestDone: false, missed: "the end card is still green", broken: ["14s headline unreadable"] });
    expect(p).toContain("NOT DONE YET: the end card is still green");
    expect(p).toContain("FIX: 14s headline unreadable");
    expect(p).toContain("Keep everything else exactly");
  });
  it("the revision prompt names the latest message and works without a concept", () => {
    const p = tastePrompt({ sheet: { times: [1, 2] }, concept: null, userText: "make a promo\n\nmake the end card blue", latest: "make the end card blue" });
    expect(p).toContain("LATEST message (the change to check):\nmake the end card blue");
    expect(p).not.toContain("original concept");
    expect(tastePrompt({ sheet: { times: [1] }, concept: "C", userText: "x" })).toContain("The original concept:\nC");
  });
});

describe("stoppedMidWork", () => {
  it("spots a progress note and leaves real replies alone", async () => {
    const { stoppedMidWork } = await import("../src/studio/turn");
    expect(stoppedMidWork("I’m checking the roof photos so the ad can use real Lakeside project imagery and keep the urgency calm and credible.")).toBe(true);
    expect(stoppedMidWork("Let me build the scenes now.")).toBe(true);
    expect(stoppedMidWork("Here's your video: warm amber light and the preorder date up front.")).toBe(false);
    expect(stoppedMidWork("Do you want it vertical or square?")).toBe(false);
    expect(stoppedMidWork("Your video is ready. I made the end card bigger.")).toBe(false);
  });
});
