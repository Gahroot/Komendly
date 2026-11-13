import { describe, expect, it } from "vitest";
import { encryptToken, tokenKey } from "../../src/lib/ads/meta/core/crypto";
import { checkCaption, choosePage, etDay, fallbackCaptions, hashtagCount, ownedContent, pickContent, showcaseContent, socialGate, socialLink } from "../../src/lib/kly/social-core";
import { socialTick } from "../src/social";
import { fakeDb } from "./fakes";

const KEY = Buffer.alloc(32, 7).toString("base64");
const NOON_ET = new Date("2026-11-13T17:00:00Z"); // 12:00 in New York

describe("captions", () => {
  const fb = socialLink("facebook");
  it("accepts a calm Facebook caption with the link once", () => {
    expect(checkCaption(`G'day! Ozzy turned a plumber's website into a tidy little ad. Paste yours and get 10 free ads. ${fb} #SmallBusiness`, "facebook")).toBeNull();
  });
  it("rejects hype, missing links, links on IG and hashtag spam", () => {
    expect(checkCaption(`Guaranteed results for your shop, act now and see. ${fb}`, "facebook")).toBe("hype or promise");
    expect(checkCaption("A nice long caption about ads without any link in it at all, mate.", "facebook")).toMatch(/link/);
    expect(checkCaption(`Paste your website and Ozzy makes you ten free ads. ${socialLink("instagram")} link in bio`, "instagram")).toMatch(/links/);
    expect(checkCaption("Paste your website and Ozzy makes you ten free ads. Have a look.", "instagram")).toMatch(/bio/);
    expect(checkCaption("Paste your website and Ozzy makes you free ads. Link in bio. #a #b #c #d", "instagram")).toBe("too many hashtags");
    expect(hashtagCount("#one and #two, not a#three")).toBe(2);
  });
  it("fallback captions always pass the checks", () => {
    for (const c of [...ownedContent(), showcaseContent({ adId: "ad1", brandName: "Acme Bakery", handle: "@acme" })]) {
      const cap = fallbackCaptions(c);
      expect(checkCaption(cap.facebook, "facebook")).toBeNull();
      expect(checkCaption(cap.instagram, "instagram")).toBeNull();
    }
  });
});

describe("pickContent", () => {
  const pool = ownedContent();
  it("never repeats while unused content remains", () => {
    const recent: Array<{ ref: string; at: Date }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      const day = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
      const c = pickContent(pool, recent, day);
      expect(c).not.toBeNull();
      if (!c) return;
      expect(seen.has(c.ref)).toBe(false);
      seen.add(c.ref);
      recent.push({ ref: c.ref, at: new Date(Date.UTC(2026, 10, 1 + i)) });
    }
    // Everything used: the least recently used comes back first.
    expect(pickContent(pool, recent, "2026-12-31")?.ref).toBe(recent[0]?.ref);
  });
  it("prefers consented showcases on example days and tips on tip days", () => {
    const withShowcase = [showcaseContent({ adId: "zz", brandName: null, handle: null }), ...pool];
    expect(pickContent(withShowcase, [], "2026-11-14")?.kind).toBe(Math.floor(Date.parse("2026-11-14T00:00:00Z") / 86_400_000) % 2 ? "tip" : "showcase");
    expect(pickContent([], [], "2026-11-14")).toBeNull();
  });
  it("IG images are JPEGs", () => {
    for (const c of pool) expect(c.igImageUrl).toMatch(/\.jpg$/);
  });
});

describe("gate", () => {
  const base = { socialEnabled: true, socialHourEt: 10, connected: true, hasTokenKey: true, now: NOON_ET };
  it("is off unless switched on and connected", () => {
    expect(socialGate({ ...base, socialEnabled: false })).toBe("switched off");
    expect(socialGate({ ...base, connected: false })).toBe("Komendly Page not connected");
    expect(socialGate({ ...base, hasTokenKey: false })).toBe("ADS_TOKEN_KEY not set");
    expect(socialGate({ ...base, socialHourEt: 13 })).toBe("not posting hour yet");
    expect(socialGate(base)).toBeNull();
    expect(etDay(new Date("2026-11-14T03:00:00Z"))).toBe("2026-11-13");
  });

  it("socialTick touches nothing when off, and never calls Meta without a connection", async () => {
    const calls: string[] = [];
    const f = async (u: string | URL) => (calls.push(String(u)), new Response("{}"));
    const off = fakeDb();
    expect(await socialTick({ db: off.db, settings: { socialEnabled: false, socialHourEt: 0 }, provider: null, env: { ADS_TOKEN_KEY: KEY }, now: NOON_ET, fetch: f })).toEqual({ skipped: "switched off" });
    expect(off.calls).toHaveLength(0);
    const noConn = fakeDb();
    expect(await socialTick({ db: noConn.db, settings: { socialEnabled: true, socialHourEt: 0 }, provider: null, env: { ADS_TOKEN_KEY: KEY }, now: NOON_ET, fetch: f })).toEqual({ skipped: "Komendly Page not connected" });
    expect(noConn.of("klySocialPost", "create")).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("posts once per platform per day and skips platforms already claimed", async () => {
    const conn = { id: "komendly", pageId: "P1", pageName: "Komendly", pageTokenEnc: encryptToken("page-token", tokenKey(KEY)), igUserId: null, igUsername: null };
    const calls: string[] = [];
    const f = async (u: string | URL) => (calls.push(String(u)), new Response(JSON.stringify({ id: "photo1", post_id: "P1_9" })));
    const fresh = fakeDb({ klySocialConnection: { findUnique: () => conn }, klySocialPost: { create: () => ({ id: "row1" }) } });
    const r = await socialTick({ db: fresh.db, settings: { socialEnabled: true, socialHourEt: 0 }, provider: null, env: { ADS_TOKEN_KEY: KEY }, now: NOON_ET, fetch: f });
    expect(r).toEqual({ posted: [{ platform: "facebook", ok: true, id: "P1_9" }] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/P1/photos");
    const already = fakeDb({ klySocialConnection: { findUnique: () => conn }, klySocialPost: { findMany: (a) => ((a as { where: { day?: string } }).where.day ? [{ platform: "facebook" }] : []) } });
    expect(await socialTick({ db: already.db, settings: { socialEnabled: true, socialHourEt: 0 }, provider: null, env: { ADS_TOKEN_KEY: KEY }, now: NOON_ET, fetch: f })).toEqual({ skipped: "already posted today" });
    const raced = fakeDb({ klySocialConnection: { findUnique: () => conn }, klySocialPost: { create: () => { throw new Error("Unique constraint failed"); } } });
    expect(await socialTick({ db: raced.db, settings: { socialEnabled: true, socialHourEt: 0 }, provider: null, env: { ADS_TOKEN_KEY: KEY }, now: NOON_ET, fetch: f })).toEqual({ posted: [] });
    expect(calls).toHaveLength(1);
  });
});

describe("choosePage", () => {
  const p = (id: string, name: string) => ({ id, name, accessToken: "t", igUserId: null, igUsername: null });
  it("picks the configured, only, or Komendly-named Page", () => {
    expect(choosePage([p("1", "Other")])).toMatchObject({ id: "1" });
    expect(choosePage([p("1", "Other"), p("2", "Komendly")])).toMatchObject({ id: "2" });
    expect(choosePage([p("1", "A"), p("2", "B")])).toMatch(/KLY_SOCIAL_PAGE_ID/);
    expect(choosePage([p("1", "A")], "9")).toMatch(/not among/);
  });
});
