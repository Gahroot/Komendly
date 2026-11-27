// Evidence that a PERSON has a page open, not a mail scanner or link sandbox. Scanners fetch the page and many run its
// JavaScript, so "JS ran" proves nothing; they typically never move a pointer, scroll, type or touch, and a sandbox
// that does wait does not usually stay on a visible, focused page. Pure: the browser objects are injected so it is
// unit-tested in node. Client-safe (no imports).

/** Trusted input on the page while the tab is visible counts at once. */
export const HUMAN_EVENTS = ["pointermove", "pointerdown", "scroll", "keydown", "touchstart"] as const;
/** Or this much time on the page while it is visible AND the document has focus (summed, not necessarily in a row). */
export const DWELL_MS = 5_000;
export const POLL_MS = 500;

export type HumanSignal = "input" | "dwell";

interface InputLike {
  /** false = dispatched by a script (a sandbox faking input), not by the user agent. */
  isTrusted?: boolean;
}

export interface HumanWatchEnv {
  win: {
    addEventListener(type: string, fn: (e: InputLike) => void, opts?: { capture?: boolean; passive?: boolean }): void;
    removeEventListener(type: string, fn: (e: InputLike) => void, opts?: { capture?: boolean }): void;
  };
  doc: { visibilityState: string; hasFocus(): boolean };
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  now(): number;
}

/**
 * Calls `onHuman` once, with the first signal seen, then stops watching. Returns a cleanup (use it as the effect cleanup:
 * it also stops a watch that never fired).
 */
export function watchHuman(env: HumanWatchEnv, onHuman: (signal: HumanSignal) => void): () => void {
  let done = false;
  let visibleMs = 0;
  let last = env.now();
  const opts = { capture: true, passive: true };
  const visible = () => env.doc.visibilityState === "visible";
  const stop = () => {
    done = true;
    for (const t of HUMAN_EVENTS) env.win.removeEventListener(t, onInput, { capture: true });
    env.clearInterval(timer);
  };
  const fire = (s: HumanSignal) => {
    if (done) return;
    stop();
    onHuman(s);
  };
  function onInput(e: InputLike) {
    if (e.isTrusted === false || !visible()) return;
    fire("input");
  }
  for (const t of HUMAN_EVENTS) env.win.addEventListener(t, onInput, opts);
  const timer = env.setInterval(() => {
    const t = env.now();
    // A long gap (sleeping laptop, throttled background tab) is not time spent looking at the page.
    const dt = Math.min(Math.max(0, t - last), POLL_MS * 4);
    last = t;
    if (!visible() || !env.doc.hasFocus()) return;
    visibleMs += dt;
    if (visibleMs >= DWELL_MS) fire("dwell");
  }, POLL_MS);
  return () => {
    if (!done) stop();
  };
}
