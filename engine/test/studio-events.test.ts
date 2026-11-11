import { describe, expect, it } from "vitest";
import { StudioEventMapper, friendlyTool, parseChildLine, scrub, type StudioEventRow } from "../src/studio/events";

function mapper() {
  let t = 0;
  const rows: StudioEventRow[] = [];
  const m = new StudioEventMapper((r) => rows.push(...r), () => t, 150);
  return { m, rows, advance: (ms: number) => (t += ms) };
}

describe("friendly tool labels", () => {
  it("maps raw tool calls to plain words", () => {
    expect(friendlyTool("bash", "'/usr/bin/node' '/x/hf.mjs' render ./promo --output renders/v1.mp4")?.label).toBe("Rendering your video");
    expect(friendlyTool("bash", "node /b/contact-sheet.mjs a.png b.png")?.label).toBe("Checking the frames");
    expect(friendlyTool("ls", "uploads")?.label).toBe("Watching your footage");
    expect(friendlyTool("read", "./uploads/clip.mp4")?.label).toBe("Watching your footage");
    expect(friendlyTool("bash", "ffprobe -v error uploads/clip.mp4")?.label).toBe("Watching your footage");
    expect(friendlyTool("write", "promo/index.html")?.label).toBe("Building the scenes");
    expect(friendlyTool("web_fetch", "https://komendly.com")?.label).toBe("Reading your website");
    expect(friendlyTool("generate_image", "")?.label).toBe("Painting an image");
    expect(friendlyTool("ask_user", "")).toBeNull();
    expect(friendlyTool("task_output", "")).toBeNull();
  });
  it("never puts the raw argument in the label", () => {
    const f = friendlyTool("bash", "cat /Users/secret/.ezcoder/auth.json");
    expect(f?.label).not.toMatch(/auth|Users/);
  });
});

describe("event mapping", () => {
  it("batches text deltas into one row per ~150ms", () => {
    const { m, rows, advance } = mapper();
    m.handle({ type: "text_delta", text: "Hel" });
    advance(50);
    m.handle({ type: "text_delta", text: "lo " });
    m.tick();
    expect(rows.filter((r) => r.type === "text_delta")).toHaveLength(0);
    advance(120);
    m.tick();
    expect(rows).toEqual([{ type: "text_delta", data: { text: "Hello " } }]);
  });
  it("emits status on phase changes and dedupes repeated tool labels", () => {
    const { m, rows } = mapper();
    m.handle({ type: "tool", name: "ls", arg: "uploads" });
    m.handle({ type: "tool", name: "read", arg: "uploads/a.mp4" });
    m.handle({ type: "tool", name: "write", arg: "ad/index.html" });
    expect(rows).toEqual([
      { type: "status", data: { phase: "looking", label: "Watching your footage" } },
      { type: "tool", data: { label: "Watching your footage" } },
      { type: "status", data: { phase: "building", label: "Building the scenes" } },
      { type: "tool", data: { label: "Building the scenes" } },
    ]);
  });
  it("flushes pending text before a tool row and keeps the final message as the last segment", () => {
    const { m, rows } = mapper();
    m.handle({ type: "text_delta", text: "Let me look." });
    m.handle({ type: "tool", name: "ls", arg: "uploads" });
    m.handle({ type: "text_delta", text: "Here's your video." });
    m.flush();
    expect(rows[0]).toEqual({ type: "text_delta", data: { text: "Let me look.\n\n" } });
    expect(m.finalText()).toBe("Here's your video.");
  });
  it("maps a question and scrubs paths and tokens", () => {
    const { m, rows } = mapper();
    m.handle({ type: "question", question: "Where will people watch it?", options: [{ label: "Instagram", recommended: true }, { label: "YouTube" }] });
    expect(rows[0]).toEqual({ type: "question", data: { question: "Where will people watch it?", options: [{ label: "Instagram", recommended: true }, { label: "YouTube" }], allowOther: true } });
    expect(scrub("saved /tmp/studio/abc/project/renders/v1.mp4 with sk-abcdefghijklmnopqrstu")).toBe("saved ./renders/v1.mp4 with [hidden]");
    expect(scrub("see /Users/me/.ezcoder/auth.json")).toBe("see [file]");
  });
  it("parses child lines and ignores noise", () => {
    expect(parseChildLine('{"type":"tool","name":"ls","arg":"."}')).toEqual({ type: "tool", name: "ls", arg: "." });
    expect(parseChildLine("warning: something")).toBeNull();
    expect(parseChildLine("{broken")).toBeNull();
  });
});
