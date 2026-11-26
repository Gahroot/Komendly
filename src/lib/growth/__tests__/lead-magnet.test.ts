import { describe, expect, it } from "vitest";
import { businessSignals, hostOf, isOwnBusinessDomain } from "../../ads/lead-qualify";
import { tradeTermFor, dreamLine } from "../../ads/lifecycle/trade-term";
import { fallbackCopy, checkCopy, type CopyContext } from "../../ads/lifecycle/copy";
import { FREE_ADS_TRADES, GENERATED_TRADE_SLUGS, normalizePicked, pickerOptions } from "../free-ads-trades";
import { tradeHero } from "../free-ads-trade-hero";
import { normalizeTrade } from "../../ads/trade";
import { buildContentQueue, isoWeek, tradesForWeek } from "../content-queue";
import { buildPayload, INDEXNOW_KEY, interpretStatus, MAX_URLS_PER_DAY, MAX_URLS_PER_RUN, normalizeUrls, selectUrls, submitToIndexNow } from "../indexnow";
import { getSystem } from "../systems";
import { existsSync } from "node:fs";

describe("business signals", () => {
  it("parses hosts from emails and urls", () => {
    expect(hostOf("Owner@Acme-Roofing.com")).toBe("acme-roofing.com");
    expect(hostOf("https://www.acme-roofing.com/about?x=1")).toBe("acme-roofing.com");
    expect(hostOf("not a url")).toBeNull();
  });
  it("separates real businesses from gmail and social profiles", () => {
    expect(businessSignals({ email: "a@gmail.com", website: "acmeroofing.com" })).toMatchObject({ is_business: true, website_own_domain: true, work_email: false });
    expect(businessSignals({ email: "a@gmail.com", website: "facebook.com/acme" }).is_business).toBe(false);
    expect(businessSignals({ email: "a@gmail.com" }).is_business).toBe(false);
    expect(businessSignals({ email: "sam@acmeroofing.com", website: "www.acmeroofing.com" })).toMatchObject({ is_business: true, email_matches_site: true });
    expect(isOwnBusinessDomain("myblog.wordpress.com")).toBe(false);
  });
});

describe("trade picker + pages", () => {
  it("every picker trade is a real playbook and a known industry", () => {
    for (const t of FREE_ADS_TRADES) {
      expect(normalizeTrade(t.slug), t.slug).toBe(t.slug);
      expect(tradeHero(t.slug), t.slug).not.toBeNull();
      expect(t.headline).toMatch(/^Free Facebook ads for your .+, made from your website$/);
      expect(t.headline).not.toMatch(/\|/);
    }
    expect(GENERATED_TRADE_SLUGS).not.toContain("roofers");
  });
  it("normalizes picked values and offers other", () => {
    expect(normalizePicked("OTHER")).toBe("other");
    expect(normalizePicked("plumbers")).toBe("plumbers");
    expect(normalizePicked("<script>")).toBeNull();
    expect(pickerOptions().at(-1)?.value).toBe("other");
  });
});

describe("lifecycle trade wording", () => {
  const ctx = (o: Partial<CopyContext> = {}): CopyContext => ({ kind: "start_nudge_1h", firstName: "Sam", brandName: null, offer: null, audience: null, pains: [], headlines: [], readyAdCount: 0, offerExpiresAt: null, ...o });
  it("maps trades and falls back to business", () => {
    expect(tradeTermFor("roofers")).toBe("roofing company");
    expect(tradeTermFor("bakeries")).toBeNull();
    expect(dreamLine(null)).toContain("your business");
  });
  it("start nudges lead with the outcome, one step, and pass the copy check", () => {
    for (const kind of ["start_nudge_1h", "start_nudge_1d", "start_nudge_3d", "verify_nudge"] as const) {
      const c = ctx({ kind, tradeTerm: "roofing company", code: "123456" });
      const copy = fallbackCopy(c);
      expect(copy.paragraphs.join(" ")).toMatch(/roofing company/i);
      expect(checkCopy(copy, c), kind).toBeNull();
    }
  });
});

describe("indexnow", () => {
  it("key file exists in public/", () => expect(existsSync(`public/${INDEXNOW_KEY}.txt`)).toBe(true));
  it("normalizes to same-host https urls without query", () => {
    expect(normalizeUrls(["/a?x=1", "https://www.komendly.com/a", "https://evil.com/x", "http://www.komendly.com/b"], "https://www.komendly.com")).toEqual(["https://www.komendly.com/a"]);
  });
  it("rate-limits per run and per day and skips recent", () => {
    const all = Array.from({ length: 1000 }, (_, i) => `https://www.komendly.com/p${i}`);
    expect(selectUrls(all, new Set(), 0)).toHaveLength(MAX_URLS_PER_RUN);
    expect(selectUrls(all, new Set(all.slice(0, 10)), 0)[0]).toBe(all[10]);
    expect(selectUrls(all, new Set(), MAX_URLS_PER_DAY - 5)).toHaveLength(5);
    expect(selectUrls(all, new Set(), MAX_URLS_PER_DAY)).toHaveLength(0);
  });
  it("builds the payload and interprets statuses", () => {
    expect(buildPayload("https://www.komendly.com", ["https://www.komendly.com/a"])).toMatchObject({ host: "www.komendly.com", keyLocation: `https://www.komendly.com/${INDEXNOW_KEY}.txt` });
    expect(interpretStatus(202)).toBe("ok");
    expect(interpretStatus(429)).toBe("rate_limited");
    expect(interpretStatus(403)).toBe("failed");
  });
  it("submits, and never throws", async () => {
    const ok = await submitToIndexNow("https://www.komendly.com", ["https://www.komendly.com/a"], (async () => new Response("", { status: 200 })) as typeof fetch);
    expect(ok).toMatchObject({ submitted: 1, status: "ok" });
    const bad = await submitToIndexNow("https://www.komendly.com", ["https://www.komendly.com/a"], (async () => { throw new Error("net"); }) as typeof fetch);
    expect(bad.status).toBe("failed");
    expect((await submitToIndexNow("https://www.komendly.com", [])).status).toBe("nothing_new");
  });
});

describe("content queue + systems", () => {
  it("registers the three new systems", () => {
    for (const k of ["content_queue", "indexnow", "kly_refill"]) expect(getSystem(k)).toBeTruthy();
  });
  it("labels weeks and rotates trades", () => {
    expect(isoWeek(new Date("2026-11-26T00:00:00Z"))).toBe("2026-W48");
    expect(tradesForWeek("2026-W48")).toHaveLength(3);
    expect(tradesForWeek("2026-W48")).not.toEqual(tradesForWeek("2026-W49"));
  });
  it("builds honest, tracked items", () => {
    const q = buildContentQueue(new Date("2026-11-26T00:00:00Z"));
    expect(q.items.length).toBeGreaterThanOrEqual(6);
    for (const i of q.items) {
      expect(i.link).toContain("utm_source=content_queue");
      expect(i.text).not.toMatch(/guarantee|\d+%|results/i);
    }
  });
});
