import { describe, expect, it } from "vitest";
import { summarizeWarmup, type WarmupBox } from "../warmup-stats";

const now = new Date("2026-12-10T17:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
const box = (id: string, domain: string, o: Partial<WarmupBox> = {}): WarmupBox => ({ id, domain, provider: "maildoso", paused: false, warmupEnabled: true, warmupSince: ago(20), coldStartedAt: null, ...o });

describe("summarizeWarmup", () => {
  it("counts ready / warming / paused per domain with inbox placement", () => {
    const boxes = [box("a", "trykomendly.com"), box("b", "trykomendly.com", { warmupSince: ago(3) }), box("c", "comendly.com", { paused: true }), box("g", "getkomendly.com", { provider: "gmail" })];
    const p = new Map([["a", { inbox: 95, spam: 5, missing: 0 }], ["b", { inbox: 30, spam: 0, missing: 1 }], ["c", { inbox: 50, spam: 50, missing: 0 }]]);
    const s = summarizeWarmup(boxes, p, new Map([["trykomendly.com", 70]]), now);
    expect(s).toMatchObject({ mailboxes: 3, ready: 1, warming: 1, paused: 1, sentToday: 70 });
    expect(s.domains.find((d) => d.domain === "trykomendly.com")).toMatchObject({ ready: 1, warming: 1, minDays: 4, inboxPct: 125 / 130 });
  });
});
