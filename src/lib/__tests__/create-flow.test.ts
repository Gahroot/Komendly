import { describe, expect, it } from "vitest";
import { clipCounts, parseFlow, stageFromStatus } from "@/lib/create-flow";

describe("stageFromStatus", () => {
  it("maps composite + clip statuses to honest stages", () => {
    expect(stageFromStatus({ status: "pending" })).toBe("pending");
    expect(stageFromStatus({ status: "generating_clips", clips: [{ status: "pending" }] })).toBe("script");
    expect(stageFromStatus({ status: "generating_clips", clips: [{ status: "generating_audio" }, { status: "pending" }] })).toBe("voicing");
    expect(stageFromStatus({ status: "generating_clips", clips: [{ status: "completed" }, { status: "generating_video" }] })).toBe("animating");
    expect(stageFromStatus({ status: "stitching" })).toBe("finishing");
    expect(stageFromStatus({ status: "completed" })).toBe("finishing");
    expect(stageFromStatus({ status: "completed", finalVideoUrl: "https://x/v.mp4" })).toBe("ready");
    expect(stageFromStatus({ status: "failed" })).toBe("failed");
  });

  it("counts finished clips", () => {
    expect(clipCounts({ status: "generating_clips", clips: [{ status: "completed" }, { status: "pending" }] })).toEqual({ done: 1, total: 2 });
  });
});

describe("parseFlow", () => {
  it("rejects junk and fills defaults", () => {
    expect(parseFlow(null)).toBeNull();
    expect(parseFlow("{")).toBeNull();
    expect(parseFlow(JSON.stringify({ reviewText: "x" }))).toBeNull();
    const f = parseFlow(JSON.stringify({ reviewId: "r1", reviewText: "Great", rating: 9, length: "60" }));
    expect(f).toMatchObject({ reviewId: "r1", rating: 5, length: "60", gender: "any", businessName: "My business" });
  });
});
