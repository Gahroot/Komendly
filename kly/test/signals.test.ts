import { describe, expect, it } from "vitest";
import { buildOutboundEmail, checkOutboundEmail, type OutboundCopyContext } from "../../src/lib/ads/outbound/copy";
import { activePeaks, seasonalPriority, seasonalSignal } from "../src/seasonal";
import { signalCopy } from "../src/sender";
import { GATED_SOURCES } from "../src/gated-sources";
import { applySignalBoost, detectAdlibSignals, detectCreativeGap, detectSingleAd, detectStaleCreative, MAX_SIGNAL_BOOST, signalBoost, signalOpener, signalsOf, withSignals, type AdlibSignalRow } from "../src/signals";
import { detectHomepageNews, detectNewDomain, detectNewShopify, detectSiteSignals, detectSitemapRefresh, rdapRegistration, robotsAllows } from "../src/site-signals";

const now = new Date("2026-11-26T12:00:00Z");
const row = (o: Partial<AdlibSignalRow> = {}): AdlibSignalRow => ({ active_ads: 1, first_seen: "Jun 5, 2024", ad_text_sample: "New Patient Special! Botox $12 a unit. Schedule today! Rated 5 stars by our clients.", ...o });

describe("ad library signals", () => {
  it("stale: single old ad, or old newest date; unknown with several ads", () => {
    expect(detectStaleCreative(row(), now)?.opener).toBe("Your longest-running Facebook ad has been live since Jun 2024.");
    expect(detectStaleCreative(row({ active_ads: 4 }), now)).toBeNull();
    expect(detectStaleCreative(row({ active_ads: 4, newest_ad_start: "2026-01-02" }), now)?.kind).toBe("stale_creative");
    expect(detectStaleCreative(row({ active_ads: 4, newest_ad_start: "2026-11-10" }), now)).toBeNull();
    expect(detectStaleCreative(row({ first_seen: "2026-11-01" }), now)).toBeNull();
    expect(detectStaleCreative(row({ first_seen: "nonsense" }), now)).toBeNull();
    expect(detectStaleCreative(row({ first_seen: "2026-05-12" }), now)?.opener).toContain("May 2026");
  });
  it("single ad", () => {
    expect(detectSingleAd(row({ active_ads: 1 }), now)?.opener).toMatch(/one ad/);
    expect(detectSingleAd(row({ active_ads: "2" }), now)?.opener).toMatch(/two ads/);
    expect(detectSingleAd(row({ active_ads: 3 }), now)).toBeNull();
    expect(detectSingleAd(row({ active_ads: 0 }), now)).toBeNull();
  });
  it("creative gap names only what the sample lacks", () => {
    expect(detectCreativeGap(row(), now)).toBeNull();
    const g = detectCreativeGap(row({ ad_text_sample: "Chiropractic changed the course of my life in 1996 and this is a big reason why I am here today.", formats: ["image"] }), now);
    expect(g?.evidence).toContain("no video");
    expect(g?.evidence).toContain("no clear offer");
    expect(g?.opener).toMatch(/^The Facebook ad I saw from you has no video and no clear offer\.$/);
    expect(detectCreativeGap(row({ ad_text_sample: "short" }), now)).toBeNull();
  });
  it("detectAdlibSignals combines", () => {
    expect(detectAdlibSignals(row(), now).map((s) => s.kind)).toEqual(["stale_creative", "single_ad"]);
  });
});

describe("boost, opener, storage", () => {
  it("boost is capped and never rescues a zero score", () => {
    const all = (["stale_creative", "single_ad", "creative_gap", "new_website", "seasonal"] as const).map((kind) => ({ kind }));
    expect(signalBoost(all)).toBe(MAX_SIGNAL_BOOST);
    expect(applySignalBoost(0, all)).toBe(0);
    expect(applySignalBoost(95, all)).toBe(100);
    expect(applySignalBoost(60, [{ kind: "single_ad" }, { kind: "single_ad" }])).toBe(65);
  });
  it("opener prefers the hardest fact; seasonal has none", () => {
    const sigs = detectAdlibSignals(row(), now);
    expect(signalOpener(sigs)).toMatch(/longest-running/);
    expect(signalOpener([seasonalSignal("roofers", new Date("2026-03-01"))!])).toBeNull();
  });
  it("round-trips through qualification JSON and ignores junk", () => {
    const q = withSignals({ score: 50 }, detectAdlibSignals(row(), now));
    expect(signalsOf(q)).toHaveLength(2);
    expect(signalsOf({ signals: [{ kind: "bogus" }, 3] })).toEqual([]);
    expect(withSignals({ a: 1 }, [])).toEqual({ a: 1 });
    expect(signalsOf(null)).toEqual([]);
  });
});

describe("seasonal", () => {
  it("opens N weeks before the peak and closes after it", () => {
    expect(activePeaks("roofers", new Date("2026-02-20")).map((a) => a.peak.id)).toContain("roof_storm"); // 5.5 weeks before Apr 1
    expect(activePeaks("roofers", new Date("2026-01-20")).some((a) => a.peak.id === "roof_storm")).toBe(false);
    expect(seasonalPriority("accountants", new Date("2026-12-10"))).toBe(1.5); // 5 weeks before Jan 15
    expect(seasonalPriority("accountants", new Date("2026-07-10"))).toBe(1);
    expect(seasonalPriority("hvac", new Date("2026-05-01"))).toBe(1.5);
    expect(seasonalPriority("hvac", new Date("2026-09-20"))).toBe(1);
  });
  it("signal carries the hook, not an opener", () => {
    const s = seasonalSignal("hvac", new Date("2026-04-20"))!;
    expect(s.hook).toMatch(/AC/);
    expect(s.opener).toBeNull();
    expect(seasonalSignal("notaniche", now)).toBeNull();
  });
});

describe("site signals (fixtures)", () => {
  it("RDAP new domain", () => {
    const rdap = { events: [{ eventAction: "registration", eventDate: "2026-10-02T10:00:00Z" }] };
    expect(detectNewDomain(rdapRegistration(rdap), now)?.opener).toContain("October 2026");
    expect(detectNewDomain(new Date("2019-01-01"), now)).toBeNull();
    expect(rdapRegistration({})).toBeNull();
  });
  it("Shopify products.json", () => {
    const p = { products: [{ created_at: "2026-10-20T00:00:00Z" }, { created_at: "2026-11-01T00:00:00Z" }] };
    expect(detectNewShopify(p, now)?.kind).toBe("new_shopify_store");
    expect(detectNewShopify({ products: [{ created_at: "2023-01-01T00:00:00Z" }] }, now)).toBeNull();
    expect(detectNewShopify({ products: Array.from({ length: 30 }, () => ({ created_at: "2026-11-01T00:00:00Z" })) }, now)).toBeNull();
    expect(detectNewShopify({ nope: 1 }, now)).toBeNull();
  });
  it("homepage phrases quote the match only", () => {
    expect(detectHomepageNews("Welcome! Grand Opening this Saturday", now)[0]?.opener).toBe('I saw "Grand Opening" on your website.');
    expect(detectHomepageNews("We moved. Our newest location is on Main", now)[0]?.kind).toBe("new_location");
    expect(detectHomepageNews("Family owned since 1980", now)).toEqual([]);
  });
  it("sitemap burst", () => {
    const urls = (d: string, n: number) => Array.from({ length: n }, () => `<url><lastmod>${d}</lastmod></url>`).join("");
    expect(detectSitemapRefresh(urls("2026-11-20", 6), now)?.kind).toBe("site_refresh");
    expect(detectSitemapRefresh(urls("2024-01-01", 8) + urls("2026-11-20", 5), now)).toBeNull();
    expect(detectSitemapRefresh(urls("2026-11-20", 2), now)).toBeNull();
  });
  it("robots", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /products.json", "/products.json")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /\nAllow: /sitemap.xml", "/sitemap.xml")).toBe(true);
    expect(robotsAllows("User-agent: Googlebot\nDisallow: /", "/")).toBe(true);
    expect(robotsAllows(null, "/x")).toBe(true);
  });
  it("detectSiteSignals honours robots and survives failures", async () => {
    const calls: string[] = [];
    const fetch = async (u: string) => {
      calls.push(u);
      if (u.endsWith("/robots.txt")) return { status: 200, text: "User-agent: *\nDisallow: /products.json" };
      if (u.startsWith("https://rdap.org")) return { status: 200, text: JSON.stringify({ events: [{ eventAction: "registration", eventDate: "2026-11-01T00:00:00Z" }] }) };
      if (u.endsWith("/sitemap.xml")) throw new Error("boom");
      return { status: 200, text: "<html><body>Now open in Denver</body></html>" };
    };
    const out = await detectSiteSignals("example-biz.com", fetch, now);
    expect(out.map((s) => s.kind).sort()).toEqual(["grand_opening", "new_website"]);
    expect(calls.some((c) => c.includes("products.json"))).toBe(false);
  });
});

describe("copy wiring", () => {
  const base: OutboundCopyContext = { step: 1, businessName: "Acme Med Spa", city: "Denver", niche: "med spas", senderName: "Nolan", claimUrl: "https://k.com/g/abc", unsubscribeUrl: "https://k.com/u/abc", postalAddress: "1 Main St, Denver, CO 80202" };
  it("opens with the real signal, still passes the compliance gate; absent signal changes nothing", () => {
    const q = withSignals({}, detectAdlibSignals(row(), now));
    const ctx = { ...base, ...signalCopy(q, now) };
    const m = buildOutboundEmail(ctx);
    expect(m.text.startsWith("Your longest-running Facebook ad has been live since Jun 2024.\n\n")).toBe(true);
    expect(checkOutboundEmail(m, ctx)).toBeNull();
    expect(buildOutboundEmail(base).text).not.toContain("longest-running");
    expect(buildOutboundEmail({ ...ctx, step: 2 }).text).not.toContain("longest-running");
  });
  it("seasonal hook is the fallback opener", () => {
    const ctx = { ...base, ...signalCopy({ signals: [seasonalSignal("hvac", new Date("2026-04-20"))] }, now) };
    expect(ctx.signalLine).toBeNull();
    expect(buildOutboundEmail(ctx).text).toContain("AC tune-ups");
  });
});

describe("gated sources", () => {
  it("are marked awaiting_prerequisite with evidence and yield nothing", async () => {
    expect(GATED_SOURCES.map((g) => g.id)).toEqual(["google_ads_transparency", "kickstarter_indiegogo", "google_business_new_listing"]);
    for (const g of GATED_SOURCES) { expect(g.status).toBe("awaiting_prerequisite"); expect(g.evidence.length).toBeGreaterThan(0); expect(await g.detect()).toEqual([]); }
  });
});
