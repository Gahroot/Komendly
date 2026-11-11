import { describe, expect, it } from "vitest";
import { applyEvent, applyEvents, ozzyEventFor, type ThreadMessage } from "../thread";

function msg(over: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "a1", role: "assistant", content: "", status: "queued", createdAt: "2026-11-10T00:00:00Z", uploadIds: [], steps: [], previews: [],
    question: null, renderIds: [], phase: null, phaseLabel: null, error: null, final: false, ...over,
  };
}
const ev = (id: number, type: string, data: Record<string, unknown>, messageId: string | null = "a1") => ({ id: String(id), type, data, messageId });

describe("applyEvents", () => {
  it("streams text, steps, previews, a render and finishes", () => {
    const [m] = applyEvents([msg()], [
      ev(1, "status", { phase: "thinking", label: "Thinking" }),
      ev(2, "text_delta", { text: "Hel" }),
      ev(3, "text_delta", { text: "lo" }),
      ev(4, "tool", { label: "Building scene 1" }),
      ev(5, "preview", { key: "p1", caption: "Frame" }),
      ev(6, "render", { renderId: "r1" }),
      ev(7, "render", { renderId: "r1" }),
      ev(8, "done", { messageId: "a1" }),
    ]);
    expect(m).toMatchObject({ content: "Hello", status: "done", phase: "done", renderIds: ["r1"], steps: [{ label: "Building scene 1" }] });
    expect(m?.previews).toHaveLength(1);
  });
  it("never re-appends deltas onto final content", () => {
    const [m] = applyEvents([msg({ content: "Hello", final: true, status: "done" })], [ev(1, "text_delta", { text: "Hello" })]);
    expect(m?.content).toBe("Hello");
  });
  it("parses questions defensively and marks cancel as cancelled", () => {
    const [m] = applyEvents([msg()], [
      ev(1, "question", { question: "Which vibe?", options: [{ label: "Bold" }, { nope: 1 }, { label: "Calm", value: "calm", recommended: true }] }),
      ev(2, "error", { message: "Stopped", code: "cancelled" }),
    ]);
    expect(m?.question?.options).toEqual([{ label: "Bold", value: "Bold", hint: undefined, recommended: false }, { label: "Calm", value: "calm", hint: undefined, recommended: true }]);
    expect(m?.status).toBe("cancelled");
  });
  it("falls back to the latest assistant message", () => {
    const out = applyEvents([msg({ id: "u", role: "user" }), msg()], [ev(1, "text_delta", { text: "x" }, null)]);
    expect(out[1]?.content).toBe("x");
  });
});

describe("ozzyEventFor", () => {
  it("maps phases", () => {
    expect(ozzyEventFor(ev(1, "status", { phase: "building" }))).toMatchObject({ event: { type: "generation:start" } });
    expect(ozzyEventFor(ev(1, "error", { code: "cancelled" }))).toBeNull();
  });
});

describe("progress events", () => {
  const base = () => [msg({ id: "a", role: "assistant", status: "streaming" })];
  const ev = (type: string, data: Record<string, unknown>, id = "1") => ({ id, messageId: "a", type, data });
  it("sets clamped pct, label, eta and rendering phase", () => {
    const out = applyEvent(base(), ev("progress", { pct: 140, label: "Rendering", etaSec: 12.4 }));
    expect(out[0]?.progress).toEqual({ pct: 100, label: "Rendering", etaSec: 12 });
    expect(out[0]?.phase).toBe("rendering");
  });
  it("omits eta when absent and keeps the last label", () => {
    let out = applyEvent(base(), ev("progress", { pct: 10, label: "Frames" }));
    out = applyEvent(out, ev("progress", { pct: 20 }, "2"));
    expect(out[0]?.progress).toEqual({ pct: 20, label: "Frames", etaSec: undefined });
  });
  it("ignores malformed pct", () => {
    const b = base();
    expect(applyEvent(b, ev("progress", { pct: "x" }))).toBe(b);
  });
  it("clears on render and done", () => {
    let out = applyEvent(base(), ev("progress", { pct: 50, label: "R" }));
    expect(applyEvent(out, ev("render", { renderId: "r1" }, "2"))[0]?.progress).toBeNull();
    out = applyEvent(out, ev("done", {}, "3"));
    expect(out[0]?.progress).toBeNull();
    expect(out[0]?.status).toBe("done");
  });
});

describe("multi-question asks", () => {
  it("keeps every question of one ask, deduped on replay, and composes one answer message", async () => {
    const { applyEvent: foldEvent, composeAnswers } = await import("../thread");
    const base = { id: "a1", role: "assistant", content: "", status: "streaming", createdAt: "", uploadIds: [], steps: [], previews: [], question: null, renderIds: [], phase: null, phaseLabel: null, error: null, final: false } as never;
    const q = (n: string) => ({ id: n, messageId: "a1", type: "question", data: { question: n, options: [{ label: `${n}-yes`, recommended: true }, { label: `${n}-no` }] } });
    let msgs = [base] as never[];
    for (const e of [q("Where?"), q("Visuals?"), q("Music?"), q("Music?")]) msgs = foldEvent(msgs, e as never) as never[];
    const m = msgs[0] as { questions: { question: string }[]; question: { question: string } };
    expect(m.questions.map((x) => x.question)).toEqual(["Where?", "Visuals?", "Music?"]);
    expect(m.question.question).toBe("Music?");
    expect(composeAnswers(m.questions as never, { 0: "Instagram", 2: "Upbeat" })).toBe("Where? → Instagram\nMusic? → Upbeat");
    expect(composeAnswers([m.questions[0]] as never, { 0: "Instagram" })).toBe("Instagram");
  });
});

describe("phase orbs", () => {
  it("map every phase and step label to a starry orb animation", async () => {
    const { orbFor, PHASE_ORB } = await import("@/components/studio-chat/phase-orb");
    expect(Object.keys(PHASE_ORB).sort()).toEqual(["building", "done", "error", "looking", "rendering", "reviewing", "thinking"]);
    expect(orbFor("building", "Reading your website")).toBe("searching");
    expect(orbFor("building", "Cutting your footage")).toBe("weaving");
    expect(orbFor("building", "Building the scenes")).toBe("connecting");
    expect(orbFor("rendering", "Rendering your video")).toBe("working");
    expect(orbFor(null)).toBe("breathing");
  });
});
