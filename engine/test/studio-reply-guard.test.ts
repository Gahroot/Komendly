import { describe, expect, it } from "vitest";
import { NO_VIDEO_REPLY, finalReply, userFacingText } from "../src/studio/events";

describe("studio reply guard", () => {
  it("drops the live technical reply (greghumble9, 11 Nov)", () => {
    const live = "The stalled setup attempt is stopped. Your animation is saved; visual checks remain blocked by studio capacity.";
    expect(userFacingText(live)).toBe("");
    expect(finalReply(live, { delivered: false, asked: false })).toBe(NO_VIDEO_REPLY);
  });
  it("keeps creative sentences and drops only technical ones", () => {
    const t = "**Your 15-second video is ready**, with upbeat music. I restarted the preview server twice. The headline and ending can be changed.";
    expect(userFacingText(t)).toBe("**Your 15-second video is ready**, with upbeat music. The headline and ending can be changed.");
  });
  it("never claims a video that wasn't delivered (julesbp89, 11 Nov)", () => {
    const t = "**Your 15-second social video is ready**, with upbeat music and a “Start for Free” ending.";
    expect(finalReply(t, { delivered: false, asked: false })).toBe(NO_VIDEO_REPLY);
    expect(finalReply(t, { delivered: true, asked: false })).toBe(t);
  });
  it("keeps a refusal or a plain answer when there's no video", () => {
    const t = "I can't create explicit sexual videos. I can help make a sensual, non-explicit scene with clearly adult characters.";
    expect(finalReply(t, { delivered: false, asked: false })).toBe(t);
  });
  it("keeps questions and paragraph breaks", () => {
    const t = "Love it.\n\nWhere will people mostly watch it?";
    expect(finalReply(t, { delivered: false, asked: true })).toBe(t);
  });
});

describe("studio reply guard: leftover task chatter (live, 11 Nov)", () => {
  it("drops 'earlier stopped task' lines; a delivered video falls back to a plain line", () => {
    const t = "The earlier stopped task is resolved; it doesn’t affect your finished video.";
    expect(userFacingText(t)).toBe("");
    expect(finalReply(t, { delivered: true, asked: false })).toBe("Here's your video.");
  });
  it("keeps creative uses of the same words", () => {
    const t = "Your romantic scene is ready, with warm lighting and a slow fade to black.";
    expect(finalReply(t, { delivered: true, asked: false })).toBe(t);
  });
});

describe("reply guard: delivery machinery", () => {
  it("drops render/stills wording but keeps the creative summary", async () => {
    const { finalReply } = await import("../src/studio/events");
    const out = finalReply("**Ready for the studio to finish.** The animated cup, steam, music and order-ahead message are in place, with transition stills checked.", { delivered: true, asked: false });
    expect(out).not.toMatch(/studio to finish|stills/i);
    const keep = finalReply("Here's your 10-second promo with steam, a latte-art cup and an order-ahead ending.", { delivered: true, asked: false });
    expect(keep).toContain("latte-art cup");
  });
});
