// Regressions from prod sessions 2026-11-14..17 (empty assistant replies, ENOENT after a cancel, render overload).
import { describe, expect, it } from "vitest";
import { ASK_INTRO, finalReply } from "../src/studio/events";
import { isRenderOverload, renderRetryPlan, renderWithRetries } from "../src/studio/render-retry";
import { errorReply, friendlyError } from "../src/studio/turn";
import { isLatestReply, studioWorkdir, waitForEarlierTurns } from "../src/studio/turn-order";

const ok = { code: 0, stdout: "", stderr: "" };
const overload = { code: 1, stdout: "", stderr: "headless dependencies:\n  sudo apt-get install -y libnss3\nThen verify with: npx hyperframes doctor\n" };
const broken = { code: 1, stdout: "", stderr: "SyntaxError: Unexpected token in index.html" };

describe("studio final render retries", () => {
  it("treats HyperFrames' misleading 'headless dependencies' (pthread EAGAIN) as overload", () => {
    expect(isRenderOverload(overload)).toBe(true);
    expect(isRenderOverload({ code: 1, stdout: "", stderr: "pthread_create: Resource temporarily unavailable (11)" })).toBe(true);
    expect(isRenderOverload(broken)).toBe(false);
  });

  it("waits minutes, not seconds, for capacity to come back", async () => {
    const waits: number[] = [];
    const results = [overload, overload, overload, ok];
    const calls: boolean[] = [];
    const rr = await renderWithRetries(async ({ workers1 }) => { calls.push(workers1); return results.shift() ?? ok; }, { signal: new AbortController().signal, sleep: async (ms) => { waits.push(ms); } });
    expect(rr.code).toBe(0);
    expect(calls).toEqual([false, false, true, true]);
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(120_000);
  });

  it("keeps the short plan for ordinary failures and stops on abort", async () => {
    expect(renderRetryPlan(false)).toHaveLength(2);
    let n = 0;
    const rr = await renderWithRetries(async () => { n++; return broken; }, { signal: new AbortController().signal, sleep: async () => {} });
    expect(rr.code).toBe(1);
    expect(n).toBe(3);
    const ac = new AbortController();
    let m = 0;
    await renderWithRetries(async () => { m++; ac.abort(); return overload; }, { signal: ac.signal, sleep: async () => {} });
    expect(m).toBe(1);
  });
});

describe("never an empty assistant message", () => {
  it("a failed turn with no streamed text still says something", () => {
    expect(errorReply("failed", "")).toBe(friendlyError("failed"));
    expect(errorReply("failed", "Working on the scene.")).toContain(friendlyError("failed"));
    expect(errorReply("render", "Your video is ready!")).toBe(friendlyError("render"));
  });

  it("a question turn without words gets an intro above the cards", () => {
    expect(finalReply("", { delivered: false, asked: true })).toBe(ASK_INTRO);
    expect(finalReply("Quick check:", { delivered: false, asked: true })).toBe("Quick check:");
  });
});

describe("overlapping turns of one session", () => {
  it("each job gets its own workdir", () => {
    expect(studioWorkdir("/tmp", "s1", "j1")).not.toBe(studioWorkdir("/tmp", "s1", "j2"));
  });

  it("waits for an earlier running turn, then goes", async () => {
    let busy = 2;
    const queries: Record<string, unknown>[] = [];
    const db = {
      adJob: { findFirst: async (a: { where: Record<string, unknown> }) => { queries.push(a.where); return busy-- > 0 ? { id: "old" } : null; } },
      studioMessage: { findFirst: async () => null },
    };
    const sleeps: number[] = [];
    const clear = await waitForEarlierTurns(db, { sessionId: "s1", jobId: "new", createdAt: new Date(), signal: new AbortController().signal, sleep: async (ms) => { sleeps.push(ms); } });
    expect(clear).toBe(true);
    expect(sleeps).toHaveLength(2);
    expect(queries[0]).toMatchObject({ type: "studio_turn", status: "running", id: { not: "new" }, payload: { path: ["sessionId"], equals: "s1" } });
  });

  it("gives up after the max wait", async () => {
    const db = { adJob: { findFirst: async () => ({ id: "old" }) }, studioMessage: { findFirst: async () => null } };
    const clear = await waitForEarlierTurns(db, { sessionId: "s", jobId: "j", createdAt: new Date(), signal: new AbortController().signal, maxWaitMs: 3_000, pollMs: 1_000, sleep: async () => {} });
    expect(clear).toBe(false);
  });

  it("an older (cancelled) turn does not own the session once a newer reply exists", async () => {
    const db = { adJob: { findFirst: async () => null }, studioMessage: { findFirst: async () => ({ id: "newer" }) } };
    expect(await isLatestReply(db, "s", "older")).toBe(false);
    expect(await isLatestReply(db, "s", "newer")).toBe(true);
  });
});
