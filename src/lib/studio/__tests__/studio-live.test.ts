import { describe, expect, it } from "vitest";
import type { LiveManifest } from "../contracts";
import { isLiveVersion, liveEntryPath, liveFileFor, liveHeaders, liveTokenMatches, parseLiveManifest, parseRange } from "../live";
import { applyEvents, ozzyEventFor, type ThreadMessage } from "../thread";

const manifest: LiveManifest = {
  token: "t".repeat(32),
  entry: "comp/index.html",
  width: 1080,
  height: 1920,
  files: { "comp/index.html": { key: "studio/w/s/live/m-1/comp/index.html", type: "text/html", size: 10 }, "uploads/a b.mp4": { key: "k2", type: "video/mp4", size: 1000 } },
};

const asst = (over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id: "a1", role: "assistant", content: "", status: "streaming", createdAt: "", uploadIds: [], steps: [], previews: [], question: null, renderIds: [], phase: "building", phaseLabel: null, error: null, final: false, ...over,
});

describe("live preview (web)", () => {
  it("parses manifests and serves only listed files", () => {
    expect(parseLiveManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(parseLiveManifest("{}")).toBeNull();
    expect(parseLiveManifest("nope")).toBeNull();
    expect(liveFileFor(manifest, ["comp", "index.html"])?.key).toBe("studio/w/s/live/m-1/comp/index.html");
    expect(liveFileFor(manifest, ["uploads", "a b.mp4"])?.key).toBe("k2");
    expect(liveFileFor(manifest, ["comp", "..", "comp", "index.html"])).toBeNull();
    expect(liveFileFor(manifest, ["constructor"])).toBeNull();
    expect(liveFileFor(manifest, [])).toBeNull();
  });
  it("checks tokens, versions and builds the entry path", () => {
    expect(liveTokenMatches(manifest, "t".repeat(32))).toBe(true);
    expect(liveTokenMatches(manifest, "x".repeat(32))).toBe(false);
    expect(liveTokenMatches(manifest, "t")).toBe(false);
    expect(isLiveVersion("cmabc-2")).toBe(true);
    expect(isLiveVersion("../x")).toBe(false);
    expect(liveEntryPath("s1", "m-1", manifest)).toBe(`/api/studio/live/s1/m-1/${"t".repeat(32)}/comp/index.html`);
  });
  it("parses ranges and never caches", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=200-", 100)).toBe("invalid");
    expect(liveHeaders("text/html")["Cache-Control"]).toBe("private, no-store");
  });
  it("folds live events into the message (latest version wins) and replays on reload", () => {
    const out = applyEvents([asst()], [
      { id: "1", messageId: "a1", type: "live", data: { version: "a1-1", ratio: "9:16", width: 1080, height: 1920 } },
      { id: "2", messageId: "a1", type: "live", data: { version: "a1-2", ratio: "16:9", width: 1920, height: 1080 } },
      { id: "3", messageId: "a1", type: "live", data: { version: "../bad" } },
    ]);
    expect(out[0]?.live).toEqual({ version: "a1-2", ratio: "16:9", width: 1920, height: 1080 });
    expect(ozzyEventFor({ id: "1", messageId: "a1", type: "live", data: {} })?.line).toBe("Here's a live preview!");
  });
});

