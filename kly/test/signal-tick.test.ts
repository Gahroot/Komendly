import { describe, expect, it } from "vitest";
import { buildOutboundEmail, checkOutboundEmail, checkVariant, type OutboundCopyContext } from "../../src/lib/ads/outbound/copy";
import { politeFetch } from "../src/polite-fetch";
import { intentScan, placeSourceFor, signalTick, siteSignalScan } from "../src/signal-tick";
import { signalCopy } from "../src/sender";
import { detectHomepageNews, detectNewDomain, detectNewShopify, detectSitemapRefresh } from "../src/site-signals";
import { fakeDb } from "./fakes";

const now = new Date("2026-11-26T12:00:00Z");
const place = { id: "ovt:1", niche: "med spas", category: "med_spa", name: "Acme", website: "https://acme.test/", domain: "acme.test", phone: null, city: "Denver", cityKey: "denver", state: "CO", postcode: null, lon: null, lat: null, confidence: 0.9, release: "r", source: "overture", email: null, usedAt: null, createdAt: now };
const site = async (u: string) => {
  if (u.endsWith("/robots.txt")) return { status: 404, text: "" };
  if (u.startsWith("https://rdap.org")) return { status: 200, text: JSON.stringify({ events: [{ eventAction: "registration", eventDate: "2026-10-01T00:00:00Z" }] }) };
  return { status: 404, text: "" };
};
const rssBody = `<rss><channel><item><title>Facebook ads manager needed</title><link>https://jobs.example/9</link><description>need help running ads</description></item></channel></rss>`;
const intentFetch = async (u: string) => (u.includes("hn.algolia") ? { status: 200, text: JSON.stringify({ hits: [{ objectID: "7", title: "Looking for Facebook ads help", story_text: "can anyone recommend someone?" }] }) } : u.includes("weworkremotely") ? { status: 200, text: rssBody } : { status: 403, text: "robots" });

describe("signalTick gating", () => {
  it("does nothing (no DB, no fetch) unless enabled by env", async () => {
    const f = fakeDb();
    const r = await signalTick({ db: f.db, env: {}, now, rt: { siteAt: 0, intentAt: 0 }, fetch: async () => { throw new Error("network"); } });
    expect(r).toEqual({ site: null, intent: null });
    expect(f.calls).toHaveLength(0);
  });
  it("runs once per interval when enabled", async () => {
    const f = fakeDb({ klyPlace: { findMany: () => [place] }, adsEvent: { findMany: () => [] } });
    const rt = { siteAt: 0, intentAt: 0 };
    const env = { KLY_SIGNALS_ENABLED: "1" };
    const a = await signalTick({ db: f.db, env, now, rt, fetch: site });
    const b = await signalTick({ db: f.db, env, now: new Date(now.getTime() + 60_000), rt, fetch: site });
    expect(a.site).toEqual({ scanned: 1, hits: 1 });
    expect(b.site).toBeNull();
  });
});

describe("siteSignalScan", () => {
  it("writes a signal: KlyPlace + lead_signal event, marks the original used, skips recently scanned domains", async () => {
    const f = fakeDb({ klyPlace: { findMany: () => [place] }, adsEvent: { findMany: () => [] } });
    expect(await siteSignalScan(f.db, site, now)).toEqual({ scanned: 1, hits: 1 });
    const up = f.of("klyPlace", "upsert")[0] as { create: { id: string; source: string; usedAt: null } };
    expect(up.create).toMatchObject({ id: "signal:acme.test", source: "signal:new_website", usedAt: null });
    const names = (f.of("adsEvent", "create") as { data: { name: string; props: { signals?: { kind: string }[] } } }[]).map((c) => c.data.name);
    expect(names).toEqual(["signal_scan", "lead_signal"]);
    expect(f.of("klyPlace", "update")[0]).toMatchObject({ where: { id: "ovt:1" } });
    const seen = fakeDb({ klyPlace: { findMany: () => [place] }, adsEvent: { findMany: () => [{ props: { domain: "acme.test" } }] } });
    expect(await siteSignalScan(seen.db, site, now)).toEqual({ scanned: 0, hits: 0 });
  });
  it("no signal -> only the scan marker", async () => {
    const f = fakeDb({ klyPlace: { findMany: () => [place] }, adsEvent: { findMany: () => [] } });
    expect(await siteSignalScan(f.db, async () => ({ status: 404, text: "" }), now)).toEqual({ scanned: 1, hits: 0 });
    expect(f.of("klyPlace", "upsert")).toHaveLength(0);
  });
  it("tags sources", () => expect(placeSourceFor("new_shopify_store")).toBe("signal:new_shopify"));
});

describe("intentScan", () => {
  it("queues scored posts as intent_opportunity with url/text/score/draft, deduping known ids", async () => {
    const f = fakeDb({ adsEvent: { findMany: () => [] } });
    const r = await intentScan(f.db, intentFetch, now);
    expect(r.added).toBeGreaterThanOrEqual(2);
    const props = (f.of("adsEvent", "create") as { data: { name: string; props: Record<string, unknown> } }[])[0]!;
    expect(props.data.name).toBe("intent_opportunity");
    expect(props.data.props).toMatchObject({ status: "new" });
    for (const k of ["url", "text", "score", "draft"]) expect(props.data.props[k]).toBeDefined();
    const dup = fakeDb({ adsEvent: { findMany: () => [{ props: { id: "hackernews:https://news.ycombinator.com/item?id=7" } }, { props: { id: "jobs_rss:https://jobs.example/9" } }] } });
    expect((await intentScan(dup.db, intentFetch, now)).added).toBe(0);
  });
});

describe("politeFetch", () => {
  it("sends the Komendly UA and skips robots-disallowed paths", async () => {
    const seen: { url: string; ua: string }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      seen.push({ url, ua: (init.headers as Record<string, string>)["user-agent"]! });
      return new Response(url.endsWith("robots.txt") ? "User-agent: *\nDisallow: /r/" : "ok", { status: 200 });
    }) as unknown as typeof fetch;
    const pf = politeFetch({ fetchImpl: impl, gapMs: 0, sleep: async () => {} });
    expect((await pf("https://www.reddit.com/r/x/new.json")).status).toBe(403);
    expect((await pf("https://www.reddit.com/ok")).status).toBe(200);
    expect(seen.every((s) => /Komendly/.test(s.ua))).toBe(true);
    expect(seen.some((s) => s.url.includes("/r/x/"))).toBe(false);
  });
});

describe("signal lines in cold email never overclaim", () => {
  const base: OutboundCopyContext = { step: 1, businessName: "Acme Med Spa", city: "Denver", niche: "med spas", senderName: "Nolan", claimUrl: "https://k.com/g/abc", unsubscribeUrl: "https://k.com/u/abc", postalAddress: "1 Main St, Denver, CO 80202" };
  const sigs = [
    detectNewDomain(new Date("2026-10-01"), now),
    detectNewShopify({ products: [{ created_at: "2026-10-20T00:00:00Z" }] }, now),
    ...detectHomepageNews("Grand opening this Saturday", now),
  ].filter((s) => s !== null);
  it("each opener passes checkOutboundEmail and quotes only its evidence", () => {
    expect(sigs).toHaveLength(3);
    for (const s of sigs) {
      const ctx = { ...base, ...signalCopy({ signals: [s] }, now) };
      const m = buildOutboundEmail(ctx);
      expect(ctx.signalLine).toBe(s!.opener);
      expect(m.text.startsWith(s!.opener!)).toBe(true);
      expect(checkOutboundEmail(m, ctx)).toBeNull();
      expect(s!.opener).not.toMatch(/\bnew (website|store)\b|just launched|struggl|your ads/i);
    }
    expect(checkVariant("body", "{headline}\n\nI made 3 ads for {business}: {link}")).toBeNull();
  });
  it("weak evidence yields no opener: sitemap refresh, 'we're open' hours, old/full-page shopify", () => {
    const xml = Array.from({ length: 6 }, () => "<lastmod>2026-11-20</lastmod>").join("");
    expect(detectSitemapRefresh(xml, now)?.opener).toBeNull();
    expect(detectHomepageNews("We're open Mon-Fri 9-5", now)).toEqual([]);
    expect(detectNewShopify({ products: [{ created_at: "2025-01-01" }] }, now)).toBeNull();
  });
});
