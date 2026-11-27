import { describe, expect, it } from "vitest";
import { DWELL_MS, HUMAN_EVENTS, POLL_MS, watchHuman, type HumanSignal, type HumanWatchEnv } from "../human-signal";

/** A fake window/document/clock: tick() advances time by one poll and runs the interval. */
function fake() {
  const listeners = new Map<string, Array<(e: { isTrusted?: boolean }) => void>>();
  let t = 1_000_000;
  let timer: (() => void) | null = null;
  const doc = { visibilityState: "visible", focused: true, hasFocus() { return this.focused; } };
  const env: HumanWatchEnv = {
    win: {
      addEventListener: (type, fn) => void listeners.set(type, [...(listeners.get(type) ?? []), fn]),
      removeEventListener: (type, fn) => void listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)),
    },
    doc,
    setInterval: (fn) => ((timer = fn), 1),
    clearInterval: () => void (timer = null),
    now: () => t,
  };
  const fired: HumanSignal[] = [];
  const stop = watchHuman(env, (s) => fired.push(s));
  return {
    doc, fired, stop,
    emit: (type: string, e: { isTrusted?: boolean } = { isTrusted: true }) => (listeners.get(type) ?? []).slice().forEach((f) => f(e)),
    tick: (n = 1) => { for (let i = 0; i < n; i++) { t += POLL_MS; timer?.(); } },
    listenerCount: () => [...listeners.values()].reduce((a, l) => a + l.length, 0),
    running: () => timer !== null,
  };
}

describe("watchHuman", () => {
  it("fires 'input' on the first real interaction while visible, once", () => {
    for (const type of HUMAN_EVENTS) {
      const f = fake();
      f.emit(type);
      f.emit(type);
      expect(f.fired).toEqual(["input"]);
    }
  });
  it("ignores script-dispatched events and input while the tab is hidden", () => {
    const f = fake();
    f.emit("pointermove", { isTrusted: false });
    f.doc.visibilityState = "hidden";
    f.emit("scroll");
    expect(f.fired).toEqual([]);
    f.doc.visibilityState = "visible";
    f.emit("keydown");
    expect(f.fired).toEqual(["input"]);
  });
  it("fires 'dwell' after 5 s visible AND focused, not before", () => {
    const f = fake();
    f.tick(DWELL_MS / POLL_MS - 1);
    expect(f.fired).toEqual([]);
    f.tick();
    expect(f.fired).toEqual(["dwell"]);
  });
  it("does not count time while hidden or unfocused (a headless scanner)", () => {
    const f = fake();
    f.doc.focused = false;
    f.tick(60);
    f.doc.focused = true;
    f.doc.visibilityState = "hidden";
    f.tick(60);
    expect(f.fired).toEqual([]);
  });
  it("stops watching after it fires, and cleanup stops a watch that never fired", () => {
    const f = fake();
    f.emit("scroll");
    expect(f.listenerCount()).toBe(0);
    expect(f.running()).toBe(false);
    const g = fake();
    expect(g.listenerCount()).toBe(HUMAN_EVENTS.length);
    g.stop();
    expect(g.listenerCount()).toBe(0);
    expect(g.running()).toBe(false);
    g.emit("scroll");
    expect(g.fired).toEqual([]);
  });
});
