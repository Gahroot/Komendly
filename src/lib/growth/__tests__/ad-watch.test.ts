import { describe, expect, it } from "vitest";
import {
  activeSubscriptions, adWatchConfirmUrl, adWatchDueWeek, adWatchSubject, AD_WATCH_EXTRA_RULES, AD_WATCH_OFFER, buildConfirmEmail, buildWeeklyEmail, isoWeekKey,
  normalizeFbPage, optedOut, parseAdWatchInput, pickNewAds, signAdWatchToken, verifyAdWatchToken, weekSendAt, type AdlibAd, type AdlibPageScan, type AdWatchEventRow,
} from "../ad-watch";
import { HARD_RULES, precheck } from "../review-gate";
import { getSystem, systemForTouch } from "../systems";
import { renderLifecycleText } from "../../ads/lifecycle/template";

const NOW = new Date("2026-11-23T14:00:00Z"); // Monday
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const ad = (id: string, startedDaysAgo: number, o: Partial<AdlibAd> = {}): AdlibAd => ({ adArchiveId: id, startedAt: day(startedDaysAgo), runDays: startedDaysAgo, format: "image", body: `Body ${id}`, snapshotUrl: `https://www.facebook.com/ads/library/?id=${id}`, ...o });
const scan = (pageId: string, ads: AdlibAd[]): AdlibPageScan => ({ pageId, pageName: `Rival ${pageId}`, liveAds: ads, scannedAt: NOW.toISOString() });
const ev = (id: string, name: string, at: string, props: object): AdWatchEventRow => ({ id, name, createdAt: at, props });

describe("registry", () => {
  it("ad_watch is a growth system with utm_source ad_watch", () => {
    expect(getSystem("ad_watch")?.utmSource).toBe("ad_watch");
    expect(systemForTouch({ utm_source: "ad_watch" })).toBe("ad_watch");
  });
});

describe("input", () => {
  it("normalizes Facebook Pages and rejects others", () => {
    expect(normalizeFbPage("facebook.com/joesplumbing")).toBe("https://www.facebook.com/joesplumbing");
    expect(normalizeFbPage("https://m.facebook.com/joesplumbing/?ref=x")).toBe("https://www.facebook.com/joesplumbing");
    expect(normalizeFbPage("https://www.facebook.com/profile.php?id=1000123456")).toBe("https://www.facebook.com/profile.php?id=1000123456");
    expect(normalizeFbPage("123456789")).toBe("123456789");
    expect(normalizeFbPage("https://evil.com/joes")).toBeNull();
    expect(normalizeFbPage("https://facebook.com/groups/abc")).toBeNull();
  });
  it("validates email, trade, city, 1-5 pages (deduped)", () => {
    const ok = parseAdWatchInput({ email: " Joe@Example.com ", trade: "Plumber", city: "Austin", pages: ["facebook.com/a1", "https://www.facebook.com/a1", "fb.com/b2"] });
    expect(ok).toEqual({ ok: true, input: { email: "joe@example.com", trade: "Plumber", city: "Austin", pages: ["https://www.facebook.com/a1", "https://www.facebook.com/b2"] } });
    expect(parseAdWatchInput({ email: "nope", trade: "x1", city: "y1", pages: ["fb.com/a1"] }).ok).toBe(false);
    expect(parseAdWatchInput({ email: "a@b.co", trade: "Roofer", city: "Reno", pages: [] }).ok).toBe(false);
    expect(parseAdWatchInput({ email: "a@b.co", trade: "Roofer", city: "Reno", pages: ["fb.com/a1", "fb.com/a2", "fb.com/a3", "fb.com/a4", "fb.com/a5", "fb.com/a6"] }).ok).toBe(false);
  });
});

describe("tokens", () => {
  it("confirm expires, unsub doesn't, tampering fails", () => {
    const url = adWatchConfirmUrl("https://x.test", "sub1", "s3cret", NOW);
    const t = new URL(url).searchParams.get("t")!;
    expect(verifyAdWatchToken(t, "s3cret", NOW)).toMatchObject({ a: "confirm", s: "sub1" });
    expect(verifyAdWatchToken(t, "s3cret", new Date(NOW.getTime() + 8 * 86_400_000))).toBeNull();
    expect(verifyAdWatchToken(t, "other", NOW)).toBeNull();
    const u = signAdWatchToken({ a: "unsub", s: "sub1" }, "s3cret");
    expect(verifyAdWatchToken(u, "s3cret", new Date("2030-01-01"))).toEqual({ a: "unsub", s: "sub1" });
    expect(verifyAdWatchToken(`${u}x`, "s3cret")).toBeNull();
  });
});

describe("weeks", () => {
  it("ISO week keys across year ends", () => {
    expect(isoWeekKey(new Date("2026-11-23T00:00:00Z"))).toBe("2026-W48");
    expect(isoWeekKey(new Date("2026-11-22T23:59:59Z"))).toBe("2026-W47");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2025-12-29T12:00:00Z"))).toBe("2026-W01");
    expect(weekSendAt(new Date("2026-11-26T10:00:00Z")).toISOString()).toBe("2026-11-23T13:00:00.000Z");
  });
  it("due once per ISO week, from Monday 13:00 UTC", () => {
    const sub = { weeksDone: new Set<string>(), confirmedAt: new Date("2026-11-01T00:00:00Z") };
    expect(adWatchDueWeek(sub, new Date("2026-11-23T12:59:00Z"))).toBeNull();
    expect(adWatchDueWeek(sub, NOW)).toBe("2026-W48");
    expect(adWatchDueWeek(sub, new Date("2026-11-27T10:00:00Z"))).toBe("2026-W48"); // catch-up after downtime
    expect(adWatchDueWeek({ ...sub, weeksDone: new Set(["2026-W48"]) }, NOW)).toBeNull();
  });
});

describe("subscription state", () => {
  const sub = (id: string, at: string, email = "joe@x.com", pages = ["https://www.facebook.com/a1"]) => ev(id, "ad_watch_subscribed", at, { email, trade: "Plumber", city: "Austin", pages });
  it("needs double opt-in", () => {
    expect(activeSubscriptions([sub("s1", "2026-11-01")])).toHaveLength(0);
    const subs = activeSubscriptions([sub("s1", "2026-11-01"), ev("c1", "ad_watch_confirmed", "2026-11-01T01:00:00Z", { subId: "s1", email: "joe@x.com" })]);
    expect(subs.map((s) => s.subId)).toEqual(["s1"]);
  });
  it("opt-out wins over earlier subs; a later re-subscribe + confirm works again", () => {
    const base = [sub("s1", "2026-11-01"), ev("c1", "ad_watch_confirmed", "2026-11-01T01:00:00Z", { subId: "s1" }), ev("u1", "ad_watch_unsubscribed", "2026-11-05", { email: "JOE@x.com", subId: "s1" })];
    expect(activeSubscriptions(base)).toHaveLength(0);
    expect(optedOut(base, "joe@x.com", new Date("2026-11-01"))).toBe(true);
    // Old confirm link clicked after the opt-out: still out.
    expect(activeSubscriptions([...base, ev("c1b", "ad_watch_confirmed", "2026-11-06", { subId: "s1" })])).toHaveLength(0);
    const again = [...base, sub("s2", "2026-11-10"), ev("c2", "ad_watch_confirmed", "2026-11-10T01:00:00Z", { subId: "s2" })];
    expect(activeSubscriptions(again).map((s) => s.subId)).toEqual(["s2"]);
    expect(optedOut(again, "joe@x.com", new Date("2026-11-10"))).toBe(false);
  });
  it("newest confirmed sub per email replaces the old list; sent/skipped weeks and seen ads tracked", () => {
    const subs = activeSubscriptions([
      sub("s1", "2026-11-01"), ev("c1", "ad_watch_confirmed", "2026-11-01", { subId: "s1" }),
      sub("s2", "2026-11-03", "joe@x.com", ["https://www.facebook.com/b2"]), ev("c2", "ad_watch_confirmed", "2026-11-03", { subId: "s2" }),
      ev("x1", "ad_watch_sent", "2026-11-09T13:00:00Z", { subId: "s2", week: "2026-W46", adIds: ["1", "2"] }),
      ev("x2", "ad_watch_skipped", "2026-11-16T13:00:00Z", { subId: "s2", week: "2026-W47" }),
    ]);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.pages).toEqual(["https://www.facebook.com/b2"]);
    expect([...subs[0]!.seen]).toEqual(["1", "2"]);
    expect([...subs[0]!.weeksDone].sort()).toEqual(["2026-W46", "2026-W47"]);
    expect(subs[0]!.lastSentAt?.toISOString()).toBe("2026-11-09T13:00:00.000Z");
  });
});

describe("new since last send", () => {
  it("only last week's ads, never repeats, newest first, spread across rivals, max 3", () => {
    const scans = [scan("p1", [ad("a1", 1), ad("a2", 2), ad("a3", 3), ad("old", 20)]), scan("p2", [ad("b1", 4), ad("b1", 4)]), scan("p3", [ad("c1", 6)])];
    expect(pickNewAds(scans, new Set(), NOW).map((a) => a.adArchiveId)).toEqual(["a1", "b1", "c1"]);
    expect(pickNewAds(scans, new Set(["b1", "c1"]), NOW).map((a) => a.adArchiveId)).toEqual(["a1", "a2", "a3"]);
    expect(pickNewAds(scans, new Set(["a1", "a2", "a3", "b1", "c1"]), NOW)).toEqual([]);
    expect(pickNewAds([scan("p1", [ad("bad", 1, { startedAt: "nope" })])], new Set(), NOW)).toEqual([]);
  });
});

describe("weekly email", () => {
  const ads = pickNewAds([scan("p1", [ad("a1", 1, { headline: "Call us today for 20% off", runDays: 1 })]), scan("p2", [ad("b1", 2, { format: "video", body: "" })])], new Set(), NOW);
  const e = buildWeeklyEmail({ base: "https://www.komendly.com", sub: { subId: "s1", trade: "Plumber", city: "Austin" }, ads, week: "2026-W48", unsubscribeUrl: "https://www.komendly.com/api/ad-watch/unsubscribe?t=abc" });
  const text = renderLifecycleText(e.input);
  it("true count in subject, remix links with utm_source=ad_watch, offer + unsubscribe + postal in footer", () => {
    expect(e.subject).toBe("2 new ads your competitors launched this week");
    expect(adWatchSubject(1)).toBe("1 new ad your competitors launched this week");
    const links = e.input.blocks![0]!.items.map((i) => new URL(i.href));
    expect(links.map((u) => u.pathname)).toEqual(["/remix", "/remix"]);
    expect(links.every((u) => u.searchParams.get("utm_source") === "ad_watch")).toBe(true);
    expect(links[0]!.searchParams.get("ad")).toBe("https://www.facebook.com/ads/library/?id=a1");
    expect(text).toContain(AD_WATCH_OFFER);
    expect(AD_WATCH_OFFER).toMatch(/\$97 the first month, then \$197\/month, cancel anytime.*free pack of 10 ads/);
    expect(text).toContain("Unsubscribe: https://www.komendly.com/api/ad-watch/unsubscribe?t=abc");
    expect(text).toContain("2211 Cole St, Birmingham, MI 48009");
    expect(text).toContain('"Call us today for 20% off"');
  });
  it("own words pass the deterministic precheck (competitor quotes masked); facts carry the real data", () => {
    expect(e.ownText).not.toContain("Call us today");
    expect(precheck({ system: "ad_watch", kind: "email", itemKey: "k", content: e.ownText })).toEqual([]);
    expect(precheck({ system: "ad_watch", kind: "email", itemKey: "k", content: text })).toContain("asks for a call or text");
    expect(e.facts).toContain("a1");
    expect(HARD_RULES.length + AD_WATCH_EXTRA_RULES.length).toBeGreaterThan(10);
  });
  it("minimal revision drops quotes, dates and day counts but keeps links, offer and unsubscribe", () => {
    const m = buildWeeklyEmail({ base: "https://www.komendly.com", sub: { subId: "s1", trade: "Plumber", city: "Austin" }, ads, week: "2026-W48", unsubscribeUrl: "https://www.komendly.com/api/ad-watch/unsubscribe?t=abc", detail: "minimal" });
    const t = renderLifecycleText(m.input);
    expect(t).not.toContain("Call us today");
    expect(t).not.toMatch(/started (on )?\w+ \d|live \d/);
    expect(t).toContain("Rival p1 · Image ad Make my version: https://www.komendly.com/remix?ad=");
    expect(t).toContain(AD_WATCH_OFFER);
    expect(t).toContain("Unsubscribe: ");
    expect(m.subject).toBe(e.subject);
  });
  it("confirmation email states what they get and how to ignore", () => {
    const c = buildConfirmEmail({ base: "https://www.komendly.com", confirmUrl: "https://www.komendly.com/api/ad-watch/confirm?t=z", trade: "Roofer", city: "Reno", pages: ["https://www.facebook.com/a1"] });
    expect(c.text).toContain("https://www.komendly.com/api/ad-watch/confirm?t=z");
    expect(c.text).toMatch(/ignore this email/);
    expect(c.html).toContain("facebook.com/a1");
  });
});
