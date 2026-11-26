import { describe, expect, it } from "vitest";
import {
  AI_LABEL, MAX_REELS_PER_DAY, REEL_FORMATS, REEL_TRADES, buildCaption, buildQueueItem, buildScript, checkReelCaption, checkScript, ctaDue, dailyCap,
  hookLibrary, isAuthOrPolicyError, isPaused, jitterMinutes, nextQueueState, parseSlotPlatform, reelDue, reelHash, reelSlotPlatform, staticShouldYield,
  withinCostCap, QUEUE_PLATFORMS, type ReelPlatform,
} from "../reels-core";
import { nextHook, rank, reelScore, suspendedFormats, type ReelPerf } from "../reels-learning";

describe("reel script (Hormozi unit)", () => {
  it("every hook x CTA variant passes the script check, calls out the person in 3s and is 15-30s", () => {
    for (const h of hookLibrary()) for (const cta of [false, true]) {
      const s = buildScript(h, cta);
      expect(checkScript(s), h.id).toBeNull();
      expect(s.scenes[0]!.seconds).toBeLessThanOrEqual(3);
      expect(s.scenes[0]!.text).toMatch(/^[A-Za-z ]+: /);
    }
  });
  it("rejects hype, fake proof and a missing call-out", () => {
    const s = buildScript(hookLibrary()[0]!, false);
    expect(checkScript({ ...s, scenes: s.scenes.map((x, i) => (i === 2 ? { ...x, text: "Get more leads guaranteed" } : x)) })).toMatch(/hype/);
    expect(checkScript({ ...s, scenes: s.scenes.map((x, i) => (i === 2 ? { ...x, text: "Our real customer said wow" } : x)) })).toMatch(/fake/);
    expect(checkScript({ ...s, scenes: s.scenes.map((x, i) => (i === 0 ? { ...x, text: "Hey everyone" } : x)) })).toMatch(/call out/);
  });
  it("gives 10:1", () => {
    expect([0, 8, 9, 10, 19].map(ctaDue)).toEqual([false, false, true, false, true]);
  });
});

describe("captions", () => {
  const plats: ReelPlatform[] = ["facebook", "instagram"];
  it("built captions pass with and without CTA; UTM link only on CTA reels where links are allowed", () => {
    for (const h of hookLibrary()) for (const cta of [false, true]) for (const p of plats) {
      const s = buildScript(h, cta);
      const c = buildCaption(p, s);
      expect(checkReelCaption(c, p, { withCta: cta, hookId: h.id }), `${h.id} ${p} ${cta}`).toBeNull();
      expect(c).toContain(AI_LABEL);
      if (p === "facebook" && cta) expect(c).toContain("utm_source=facebook&utm_medium=reel&utm_campaign=");
    }
  });
  it("rejects missing AI label, links on IG, hype, extra CTA", () => {
    expect(checkReelCaption("Three tips for your ad that are useful and plain.", "instagram")).toMatch(/AI/);
    expect(checkReelCaption(`Tips. ${AI_LABEL}. https://x.com/a?utm_source=instagram`, "instagram", { withCta: true })).toMatch(/links/);
    expect(checkReelCaption(`Guaranteed results for sure. ${AI_LABEL}, animated cartoon.`, "facebook")).toMatch(/hype/);
    expect(checkReelCaption(`Nice tips here for you. ${AI_LABEL}. Free ads from your website, link in bio`, "instagram", { withCta: false })).toMatch(/give-only/);
  });
});

describe("caps, slots, pause", () => {
  it("caps default 1, max 3", () => {
    expect(dailyCap({})).toBe(1);
    expect(dailyCap({ REELS_PER_DAY: "2" })).toBe(2);
    expect(dailyCap({ REELS_PER_DAY: "99" })).toBe(MAX_REELS_PER_DAY);
    expect(dailyCap({ REELS_PER_DAY: "x" })).toBe(1);
  });
  it("slot key round trips; jitter is deterministic and bounded", () => {
    expect(parseSlotPlatform(reelSlotPlatform("instagram", 2))).toEqual({ platform: "instagram", slot: 2 });
    expect(parseSlotPlatform("facebook")).toBeNull();
    expect(jitterMinutes("2026-11-26", "facebook", 1)).toBe(jitterMinutes("2026-11-26", "facebook", 1));
    const j = Array.from({ length: 30 }, (_, i) => jitterMinutes(`2026-11-${i + 1}`, "facebook", 1));
    expect(Math.max(...j)).toBeLessThan(180);
    expect(new Set(j).size).toBeGreaterThan(10);
    expect(reelDue(9 * 60 - 1, 9, "d", "facebook", 1)).toBe(false);
    expect(reelDue(24 * 60 - 1, 9, "d", "facebook", 1)).toBe(true);
  });
  it("pause uses the latest pause/resume event", () => {
    const e = (name: string, t: number) => ({ name, props: { platform: "facebook" }, createdAt: new Date(t) });
    expect(isPaused([e("reel_paused", 1)], "facebook")).toBe(true);
    expect(isPaused([e("reel_paused", 1), e("reel_resumed", 2)], "facebook")).toBe(false);
    expect(isPaused([e("reel_paused", 1)], "instagram")).toBe(false);
  });
  it("classifies auth/policy errors", () => {
    expect(isAuthOrPolicyError("Meta me/accounts: Error validating access token: Session has expired (OAuthException 190)")).toBe(true);
    expect(isAuthOrPolicyError("Meta x: (#200) permission denied")).toBe(true);
    expect(isAuthOrPolicyError("Meta media container still processing")).toBe(false);
  });
  it("static yields to a reel that is posted or about to be, then falls back", () => {
    const b = { reelsOn: true, paused: false, hourEt: 9 };
    expect(staticShouldYield({ ...b, reelPostedToday: true, reelReady: true, etHour: 20 })).toBe(true);
    expect(staticShouldYield({ ...b, reelPostedToday: false, reelReady: true, etHour: 10 })).toBe(true);
    expect(staticShouldYield({ ...b, reelPostedToday: false, reelReady: true, etHour: 14 })).toBe(false);
    expect(staticShouldYield({ ...b, reelPostedToday: false, reelReady: false, etHour: 10 })).toBe(false);
    expect(staticShouldYield({ ...b, reelsOn: false, reelPostedToday: true, reelReady: true, etHour: 10 })).toBe(false);
  });
  it("cost cap", () => {
    expect(withinCostCap(400_000, 50_000, {})).toBe(true);
    expect(withinCostCap(480_000, 50_000, {})).toBe(false);
    expect(withinCostCap(0, 1, { REELS_DAILY_COST_CAP_MICROS: "0" })).toBe(false);
  });
  it("hash dedupes hook+asset", () => {
    expect(reelHash("a", "x")).toBe(reelHash("a", "x"));
    expect(reelHash("a", "x")).not.toBe(reelHash("a", "y"));
  });
});

describe("publish queue", () => {
  it("builds checked per-platform items within limits", () => {
    for (const cta of [false, true]) for (const p of QUEUE_PLATFORMS) {
      const s = buildScript(hookLibrary()[2]!, cta);
      const q = buildQueueItem(p, s, "r1");
      expect(typeof q, `${p} ${cta}`).toBe("object");
      if (typeof q === "object") {
        expect(q.caption).toContain(AI_LABEL);
        expect(q.status).toBe("queued");
        if (p === "x") expect(q.caption.length).toBeLessThanOrEqual(280);
        if (p === "tiktok") expect(q.link).toBeNull();
      }
    }
  });
  it("retries with backoff, pauses on auth, fails after 5", () => {
    const now = new Date("2026-11-26T00:00:00Z");
    const q = buildQueueItem("x", buildScript(hookLibrary()[0]!, false), "r1") as Exclude<ReturnType<typeof buildQueueItem>, string>;
    const a = nextQueueState(q, { ok: false, error: "timeout" }, now);
    expect(a.status).toBe("queued");
    expect(a.nextAttemptAt).toBe("2026-11-26T01:00:00.000Z");
    expect(nextQueueState(a, { ok: false, error: "timeout" }, now).nextAttemptAt).toBe("2026-11-26T02:00:00.000Z");
    expect(nextQueueState(q, { ok: false, error: "OAuthException token expired" }, now).status).toBe("paused");
    expect(nextQueueState({ ...q, attempts: 4 }, { ok: false, error: "boom" }, now).status).toBe("failed");
    expect(nextQueueState(q, { ok: true, postUrl: "u" }, now).status).toBe("posted");
  });
});

const perf = (o: Partial<ReelPerf>): ReelPerf => ({ reelId: "r", platform: "instagram", hookId: "roofers:tips", trade: "roofers", format: "tip_list", seconds: 20, plays: 1000, reach: 800, shares: 10, saves: 10, likes: 20, comments: 2, follows: 1, linkClicks: 0, ...o });

describe("learning", () => {
  it("ranks by weighted score and groups lengths", () => {
    const r = rank([perf({ hookId: "a", shares: 50 }), perf({ hookId: "b", shares: 0, saves: 0 }), perf({ hookId: "a", seconds: 28 })], "hookId");
    expect(r[0]!.key).toBe("a");
    expect(r[0]!.n).toBe(2);
    expect(rank([perf({ seconds: 16 }), perf({ seconds: 27 })], "length").map((x) => x.key).sort()).toEqual(["15-19s", "25-30s"]);
    expect(reelScore(perf({ plays: 0, reach: 0, shares: 1, saves: 0, likes: 0, comments: 0, follows: 0 }))).toBe(10);
  });
  it("suspends only data-rich, no-traction formats, never all of them", () => {
    const dead = Array.from({ length: 5 }, () => perf({ format: "makeover", plays: 20, reach: 20, shares: 0, saves: 0, likes: 0, comments: 0, follows: 0 }));
    const good = Array.from({ length: 5 }, () => perf({ format: "tip_list" }));
    expect(suspendedFormats([...dead, ...good])).toEqual(["makeover"]);
    expect(suspendedFormats(dead.slice(0, 4))).toEqual([]);
    const all = REEL_FORMATS.flatMap((f) => dead.map((d) => ({ ...d, format: f })));
    expect(suspendedFormats(all)).toEqual([]);
  });
  it("explores with no data, mixes ~70/30 with data, never repeats a hash, skips suspended formats", () => {
    const first = nextHook("2026-11-26", 0, [], []);
    expect(first?.mode).toBe("explore");
    const perfs = [perf({ hookId: "roofers:tips", shares: 40 })];
    let ex = 0;
    const history: { hookId: string; trade: string; format: "tip_list"; hash: string }[] = [];
    for (let i = 0; i < 100; i++) {
      const n = nextHook(`d${i}`, i, history.slice(-10), perfs);
      expect(n).not.toBeNull();
      if (n!.mode === "exploit") ex++;
      expect(history.slice(-10).some((h) => h.hash === reelHash(n!.hook.id, "v1"))).toBe(false);
      history.push({ hookId: n!.hook.id, trade: n!.hook.trade, format: "tip_list", hash: reelHash(n!.hook.id, "v1") });
    }
    expect(ex).toBeGreaterThan(50);
    expect(ex).toBeLessThan(90);
    const dead = Array.from({ length: 5 }, () => perf({ format: "makeover", plays: 5, reach: 5, shares: 0, saves: 0, likes: 0, comments: 0, follows: 0 }));
    const good = Array.from({ length: 5 }, () => perf({}));
    for (let i = 0; i < 40; i++) expect(nextHook(`z${i}`, i, [], [...dead, ...good])!.hook.format).not.toBe("makeover");
    expect(REEL_TRADES.length).toBeGreaterThan(0);
  });
});
