import { describe, expect, it } from "vitest";
import { encryptToken, tokenKey } from "../../src/lib/ads/meta/core/crypto";
import { igReelInsights, publishFacebookReel, publishInstagramReel } from "../../src/lib/kly/social-core";
import { buildCaption, buildScript, hookLibrary, type ReelReadyProps } from "../../src/lib/growth/reels-core";
import { reelInsightsTick, reelsTick } from "../src/reels";
import { fakeDb } from "./fakes";

const KEY = Buffer.alloc(32, 9).toString("base64");
const NOON_ET = new Date("2026-11-13T17:00:00Z");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const noSleep = async () => undefined;

describe("reel request building (mocked fetch, never live)", () => {
  it("Facebook reel: start -> rupload with file_url header -> status poll -> finish PUBLISHED", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const f = async (u: string | URL, init?: RequestInit) => {
      calls.push({ url: String(u), init });
      const url = String(u);
      if (url.includes("/video_reels") && String(init?.body).includes("upload_phase=start")) return json({ video_id: "V1", upload_url: "https://rupload.facebook.com/video-upload/v25.0/V1" });
      if (url.startsWith("https://rupload")) return json({ success: true });
      if (url.includes("/V1?")) return json({ status: { uploading_phase: { status: "complete" } } });
      return json({ success: true });
    };
    const id = await publishFacebookReel({ f, version: "v25.0", pageId: "P1", token: "tok", videoUrl: "https://www.komendly.com/api/reels/r1/video", caption: "cap", sleep: noSleep });
    expect(id).toBe("V1");
    expect(calls).toHaveLength(4);
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v25.0/P1/video_reels");
    expect(String(calls[0]!.init?.body)).toContain("upload_phase=start");
    expect(calls[1]!.url).toBe("https://rupload.facebook.com/video-upload/v25.0/V1");
    expect(calls[1]!.init?.headers).toEqual({ Authorization: "OAuth tok", file_url: "https://www.komendly.com/api/reels/r1/video" });
    const fin = String(calls[3]!.init?.body);
    expect(fin).toContain("upload_phase=finish");
    expect(fin).toContain("video_id=V1");
    expect(fin).toContain("video_state=PUBLISHED");
    expect(fin).toContain("description=cap");
  });
  it("Facebook reel: upload error surfaces, nothing is finished", async () => {
    const calls: string[] = [];
    const f = async (u: string | URL, init?: RequestInit) => {
      calls.push(String(u));
      if (String(init?.body).includes("start")) return json({ video_id: "V1", upload_url: "https://rupload.facebook.com/x" });
      return json({ error: "bad file" }, 400);
    };
    await expect(publishFacebookReel({ f, version: "v25.0", pageId: "P1", token: "t", videoUrl: "u", caption: "c", sleep: noSleep })).rejects.toThrow(/upload/);
    expect(calls).toHaveLength(2);
  });
  it("Instagram reel: REELS container with video_url, polls FINISHED, then media_publish", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    let polls = 0;
    const f = async (u: string | URL, init?: RequestInit) => {
      const url = String(u);
      calls.push({ url, body: String(init?.body ?? "") });
      if (url.endsWith("/IG1/media")) return json({ id: "C1" });
      if (url.includes("/C1?")) return json({ status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" });
      return json({ id: "M1" });
    };
    expect(await publishInstagramReel({ f, version: "v25.0", igUserId: "IG1", token: "t", videoUrl: "https://v/x", caption: "cap", sleep: noSleep })).toBe("M1");
    expect(calls[0]!.body).toContain("media_type=REELS");
    expect(calls[0]!.body).toContain("video_url=https%3A%2F%2Fv%2Fx");
    expect(calls.at(-1)!.url).toMatch(/IG1\/media_publish$/);
    expect(calls.at(-1)!.body).toContain("creation_id=C1");
  });
  it("insights: one failing metric does not blank the others; all failing = empty metrics", async () => {
    const f = async (u: string | URL) => {
      const m = new URL(String(u)).searchParams.get("metric");
      return m === "shares" ? json({ error: { message: "(#10) permission", code: 10 } }, 400) : json({ data: [{ total_value: { value: 7 } }] });
    };
    const r = await igReelInsights(f, "v25.0", "M1", "t");
    expect(r.metrics.views).toBe(7);
    expect(r.metrics.shares).toBeUndefined();
    expect(r.errors[0]).toMatch(/shares/);
    const dead = await igReelInsights(async () => json({ error: { message: "nope" } }, 400), "v25.0", "M1", "t");
    expect(Object.keys(dead.metrics)).toHaveLength(0);
  });
});

function readyProps(): ReelReadyProps {
  const h = hookLibrary()[0]!;
  const s = buildScript(h, false);
  return { reelId: "2026-11-13-r-1", hookId: h.id, trade: h.trade, format: h.format, seconds: s.seconds, withCta: false, hash: "x", key: "k", scriptKey: "s", day: "2026-11-13", script: "v", captions: { facebook: buildCaption("facebook", s), instagram: buildCaption("instagram", s) }, costMicros: 0 };
}
const conn = { id: "komendly", pageId: "P1", pageName: "K", pageTokenEnc: encryptToken("page-token", tokenKey(KEY)), igUserId: "IG1", igUsername: "k" };
const flag = (enabled: boolean) => ({ adsFeatureFlag: { findUnique: () => ({ enabled }) } });

describe("reelsTick", () => {
  const base = { settings: { socialEnabled: true, socialHourEt: 0 }, env: { ADS_TOKEN_KEY: KEY }, now: NOON_ET, sleep: noSleep };
  const mkFetch = (calls: string[]) => async (u: string | URL, init?: RequestInit) => {
    const url = String(u);
    calls.push(url);
    if (url.includes("/video_reels") && String(init?.body).includes("start")) return json({ video_id: "V1", upload_url: "https://rupload.facebook.com/u" });
    if (url.startsWith("https://rupload")) return json({ success: true });
    if (url.includes("/V1?")) return json({ status: { video_status: "ready" } });
    if (url.endsWith("/IG1/media")) return json({ id: "C1" });
    if (url.includes("/C1?")) return json({ status_code: "FINISHED" });
    return json({ id: "M1", success: true });
  };
  const handlers = (extra: Record<string, Record<string, (a: unknown) => unknown>> = {}) => ({
    ...flag(true),
    klySocialConnection: { findUnique: () => conn },
    adsEvent: { findMany: (a: unknown) => ((a as { where: { name: unknown } }).where.name === "reel_ready" ? [{ props: readyProps() }] : []), create: () => ({}) },
    klySocialPost: { create: () => ({ id: "row1" }) },
    ...extra,
  });

  it("is off by default (flag missing) and never calls Meta", async () => {
    const calls: string[] = [];
    const d = fakeDb({ adsFeatureFlag: { findUnique: () => null } });
    expect(await reelsTick({ db: d.db, ...base, fetch: mkFetch(calls) })).toEqual({ skipped: "sys_reels off" });
    expect(calls).toHaveLength(0);
  });
  it("posts a Facebook + Instagram reel once, claiming '<platform>_reel:1' with sourceKind reel", async () => {
    const calls: string[] = [];
    const d = fakeDb(handlers());
    const r = await reelsTick({ db: d.db, ...base, now: new Date("2026-11-13T23:50:00Z"), fetch: mkFetch(calls) });
    expect(r).toEqual({ posted: [{ platform: "facebook", slot: 1, ok: true, id: "V1" }, { platform: "instagram", slot: 1, ok: true, id: "M1" }] });
    const claims = d.of("klySocialPost", "create") as Array<{ data: { platform: string; sourceKind: string; imageUrl: string } }>;
    expect(claims.map((c) => c.data.platform)).toEqual(["facebook_reel:1", "instagram_reel:1"]);
    expect(claims[0]!.data.sourceKind).toBe("reel");
    expect(claims[0]!.data.imageUrl).toBe("https://www.komendly.com/api/reels/2026-11-13-r-1/video");
  });
  it("respects the daily cap: today's slot already claimed => no second reel at cap 1; slot 2 only when cap allows", async () => {
    const calls: string[] = [];
    const taken = [{ platform: "facebook_reel:1" }, { platform: "instagram_reel:1" }];
    const mk = () => fakeDb(handlers({ klySocialPost: { findMany: (a: unknown) => ((a as { where: { day?: string } }).where.day ? taken : []), create: () => ({ id: "row" }) } }));
    const late = new Date("2026-11-13T23:50:00Z");
    expect(await reelsTick({ db: mk().db, ...base, now: late, fetch: mkFetch(calls) })).toEqual({ posted: [] });
    expect(calls).toHaveLength(0);
    const two = await reelsTick({ db: mk().db, ...base, env: { ADS_TOKEN_KEY: KEY, REELS_PER_DAY: "2" }, now: new Date("2026-11-14T04:50:00Z"), fetch: mkFetch(calls) });
    expect("posted" in two && two.posted.map((p) => p.slot)).toEqual([2, 2]);
  });
  it("a lost claim race posts nothing", async () => {
    const calls: string[] = [];
    const d = fakeDb(handlers({ klySocialPost: { create: () => { throw new Error("Unique constraint failed"); } } }));
    expect(await reelsTick({ db: d.db, ...base, now: new Date("2026-11-13T23:50:00Z"), fetch: mkFetch(calls) })).toEqual({ posted: [] });
    expect(calls).toHaveLength(0);
  });
  it("auth/policy error records reel_paused and a paused platform is skipped afterwards", async () => {
    const f = async () => json({ error: { message: "Error validating access token: Session has expired", code: 190 } }, 400);
    const d = fakeDb(handlers());
    const r = await reelsTick({ db: d.db, ...base, now: new Date("2026-11-13T23:50:00Z"), fetch: f });
    expect("posted" in r && r.posted.every((p) => !p.ok)).toBe(true);
    const ev = (d.of("adsEvent", "create") as Array<{ data: { name: string } }>).map((e) => e.data.name);
    expect(ev).toContain("reel_paused");
    const calls: string[] = [];
    const paused = fakeDb(handlers({ adsEvent: { findMany: (a: unknown) => {
      const n = (a as { where: { name: unknown } }).where.name;
      return n === "reel_ready" ? [{ props: readyProps() }] : [{ name: "reel_paused", props: { platform: "facebook" }, createdAt: new Date() }, { name: "reel_paused", props: { platform: "instagram" }, createdAt: new Date() }];
    }, create: () => ({}) } }));
    expect(await reelsTick({ db: paused.db, ...base, now: new Date("2026-11-13T23:50:00Z"), fetch: mkFetch(calls) })).toEqual({ posted: [] });
    expect(calls).toHaveLength(0);
  });
  it("a caption that fails the checks is never published", async () => {
    const calls: string[] = [];
    const bad = { ...readyProps(), captions: { facebook: "Guaranteed results! Made by Ozzy, AI. buy now friends", instagram: "no label here at all, just text long enough to pass" } };
    const d = fakeDb(handlers({ adsEvent: { findMany: (a: unknown) => ((a as { where: { name: unknown } }).where.name === "reel_ready" ? [{ props: bad }] : []), create: () => ({}) } }));
    expect(await reelsTick({ db: d.db, ...base, now: new Date("2026-11-13T23:50:00Z"), fetch: mkFetch(calls) })).toEqual({ posted: [] });
    expect(calls).toHaveLength(0);
  });
});

describe("reelInsightsTick", () => {
  it("logs insights unavailable (does not throw) when Graph refuses, and still stores a learning event", async () => {
    const d = fakeDb({
      ...flag(true),
      klySocialConnection: { findUnique: () => conn },
      klySocialPost: { findMany: () => [{ sourceRef: "r1", platform: "instagram_reel:1", postId: "M1" }] },
      adsEvent: { findFirst: () => null, findMany: () => [], create: () => ({}) },
    });
    const r = await reelInsightsTick({ db: d.db, settings: { socialEnabled: true, socialHourEt: 0 }, env: { ADS_TOKEN_KEY: KEY }, now: NOON_ET, fetch: async () => json({ error: { message: "(#10) permission", code: 10 } }, 400) });
    expect(r).toEqual({ measured: 0, unavailable: true });
    const names = (d.of("adsEvent", "create") as Array<{ data: { name: string } }>).map((e) => e.data.name);
    expect(names).toEqual(["reel_insights", "reel_learning"]);
  });
});
