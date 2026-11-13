import { describe, expect, it } from "vitest";
import { pickStudioModel } from "../src/studio/model-choice";

describe("pickStudioModel", () => {
  it("first video on Sol high, edits on Luna high", () => {
    expect(pickStudioModel({ env: {}, hasVideo: false })).toEqual({ model: "gpt-6.1-sol", thinking: "high", edit: false });
    expect(pickStudioModel({ env: {}, hasVideo: true })).toEqual({ model: "gpt-6-luna", thinking: "high", edit: true });
  });
  it("env overrides, and STUDIO_EDIT_MODEL=same keeps one model", () => {
    expect(pickStudioModel({ env: { STUDIO_AGENT_MODEL: "x", STUDIO_AGENT_THINKING: "max" }, hasVideo: false })).toEqual({ model: "x", thinking: "max", edit: false });
    expect(pickStudioModel({ env: { STUDIO_EDIT_MODEL: "same", STUDIO_AGENT_MODEL: "x" }, hasVideo: true })).toEqual({ model: "x", thinking: "high", edit: false });
    expect(pickStudioModel({ env: { STUDIO_EDIT_MODEL: "y", STUDIO_EDIT_THINKING: "medium" }, hasVideo: true })).toEqual({ model: "y", thinking: "medium", edit: true });
  });
});
