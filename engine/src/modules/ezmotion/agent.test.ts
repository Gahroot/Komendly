import { describe, expect, it } from "vitest";
import { agentBrief, ratioDir } from "./agent";

describe("motion agent brief", () => {
  it("is what a person would type: site, hype, audience, size, length, in at most 4 sentences", () => {
    const b = agentBrief({ url: "https://wearedobi.com", brandName: "DOBI", audience: "Michigan home buyers tired of endless listings", ratios: ["9:16"], seconds: 15 });
    expect(b).toContain("https://wearedobi.com");
    expect(b).toMatch(/hype/i);
    expect(b).toMatch(/super fast cuts and energetic/);
    expect(b).toMatch(/motion blur/);
    expect(b).toContain("9:16");
    expect(b).toContain("15 seconds");
    expect(b).toContain(`./${ratioDir("9:16")}/index.html`);
    expect(b).toContain("./brand/rules.txt");
    expect(b.split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(6);
    expect(b.split(/\s+/).length).toBeLessThan(110);
  });
  it("asks for extra paid sizes in the same run", () => {
    const b = agentBrief({ url: "https://x.test", brandName: "X", ratios: ["4:5", "1:1", "9:16"], seconds: 15 });
    expect(b).toContain("./video-4x5/index.html");
    expect(b).toContain("./video-1x1");
    expect(b).toContain("./video-9x16");
  });
});

describe("motion agent brief extras", () => {
  it("points at the facts file and the reviewer note only when present", () => {
    const plain = agentBrief({ url: "https://x.test", brandName: "X", ratios: ["9:16"], seconds: 15 });
    expect(plain).not.toContain("facts.txt");
    expect(plain).not.toContain("review.txt");
    const full = agentBrief({ url: "https://x.test", brandName: "X", ratios: ["9:16"], seconds: 15, facts: true, review: true });
    expect(full).toContain("./brand/facts.txt");
    expect(full).toContain("./brand/review.txt");
    expect(full.split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(6);
  });
});

describe("motion agent brief music + guidance", () => {
  it("points at the bundled track only when copied", async () => {
    expect(agentBrief({ url: "https://x.test", brandName: "X", ratios: ["9:16"], seconds: 15 })).not.toContain("music.mp3");
    expect(agentBrief({ url: "https://x.test", brandName: "X", ratios: ["9:16"], seconds: 15, music: true })).toContain("./brand/beats.json");
    const { motionQualityGuidance } = await import("./quality-guidance");
    expect(motionQualityGuidance()).toMatch(/super fast cuts and energetic/);
  });
  it("blur settings default to the Railway budget and honor env", async () => {
    const { blurSettings } = await import("./quality-render");
    expect(blurSettings({})).toEqual({ fps: 30, samples: 3, shutter: 270, quality: "looks" });
    expect(blurSettings({ EZMOTION_BLUR_SAMPLES: "4", EZMOTION_BLUR_WORKERS: "10" })).toMatchObject({ samples: 4, workers: 10 });
  });
});
