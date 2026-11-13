import { describe, expect, it } from "vitest";
import { toolKind, turnTimer } from "../src/studio/timing";

describe("studio turn timing", () => {
  it("classifies agent tools", () => {
    expect(toolKind("bash", "npx hf snapshot . --at 1,2")).toBe("snapshot");
    expect(toolKind("bash", "node contact-sheet.mjs out")).toBe("contact_sheet");
    expect(toolKind("bash", "hf render . -o x.mp4")).toBe("render");
    expect(toolKind("bash", "npx hyperframes lint")).toBe("preview");
    expect(toolKind("write", "index.html")).toBe("edit");
    expect(toolKind("read", "studio.md")).toBe("read");
    expect(toolKind("bash", "ls")).toBe("shell");
  });
  it("sums phases and tool time with an injected clock", () => {
    let t = 0;
    const tm = turnTimer(() => t);
    tm.phase("restore"); t = 100;
    tm.phase("agent"); t = 150;
    tm.toolStart("bash", "hf snapshot"); t = 250;
    tm.toolEnd(); t = 300;
    tm.toolStart("bash", "hf snapshot"); t = 330;
    tm.toolStart("write", "index.html"); t = 340; // a new start closes the open one
    tm.toolEnd(); t = 500;
    tm.phase("render"); t = 600;
    const s = tm.summary();
    expect(s.totalMs).toBe(600);
    expect(s.phases).toEqual({ restore: 100, agent: 400, render: 100 });
    expect(s.tools).toEqual({ edit: { n: 1, ms: 10 }, snapshot: { n: 2, ms: 130 } });
    expect(s.toolMs).toBe(140);
    expect(s.thinkMs).toBe(260);
  });
});
