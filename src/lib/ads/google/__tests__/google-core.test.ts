import { describe, expect, it, vi } from "vitest";
import { GoogleAdsClient } from "../core/client";
import { budgetSuggestion, draftKeywords, draftSearchCopy, toMicros } from "../core/draft";
import { checkReadiness, listAccounts, mapBilling, readinessFrom, suggestGeo } from "../core/ops";
import { activationOperations, parseGooglePublishPayload, publishToGoogle, searchOperations, youtubeId, type GooglePublishStore, type KindResult } from "../core/publish";
import { aggregatePolicy, syncCampaigns } from "../core/sync";
import { cleanText, displayWidth, searchCopyErrors } from "../core/text";
import { normalizeCustomerId } from "../core/types";

const ENV = { GOOGLE_ADS_CLIENT_ID: "cid", GOOGLE_ADS_CLIENT_SECRET: "sec", GOOGLE_ADS_MANAGER_ID: "111-222-3333", GOOGLE_ADS_MANAGER_REFRESH_TOKEN: "mrt", GOOGLE_ADS_API_VERSION: "v26" };

type Call = { url: string; headers: Record<string, string>; body: any };
function mockFetch(handler: (url: string, body: any) => unknown) {
  const calls: Call[] = [];
  const f = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body });
    const out = handler(url, body);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out ?? {}), { status: 200 });
  });
  return { f, calls };
}
const client = (f: any) => new GoogleAdsClient({ auth: { token: async () => "at" }, fetch: f, version: "v26" });

// Odd/long inputs incl. emoji, ALL CAPS, wide chars, repeated punctuation.
const WEIRD = [
  "🔥🔥 HUGE SALE!!! Best Roofing In Austin Texas Guaranteed Today Only!!!",
  "Supercalifragilisticexpialidocious-roofing-and-gutters-company-of-texas",
  "東京の最高の屋根修理サービス、今すぐお問い合わせください",
  "   ...Leading punctuation & trailing joiners and   ",
  "★★★★★ Rated #1 ✓ Free quote ™ • Call now ☎",
  "",
  "a".repeat(400),
  "Café crème brûlée — the best in town… really?? yes!!",
];

describe("limit-safe drafting", () => {
  it("every headline <=30, description <=90, path <=15, no '!' in headlines, passes validator", () => {
    for (const a of WEIRD) for (const b of WEIRD) {
      const copy = draftSearchCopy(
        { brandName: a || "Acme", landingPage: "https://acme.test", mainOffer: `${b}, roof repair and gutters`, location: `${a.slice(0, 20)}, TX`, facts: [b] },
        [{ headline: a, body: b, cta: b.slice(0, 20) }, { headline: b, body: a, cta: null }],
      );
      expect(copy.headlines.length).toBeGreaterThanOrEqual(3);
      expect(copy.headlines.length).toBeLessThanOrEqual(15);
      expect(copy.descriptions.length).toBeGreaterThanOrEqual(2);
      expect(copy.descriptions.length).toBeLessThanOrEqual(4);
      for (const h of copy.headlines) { expect(displayWidth(h)).toBeLessThanOrEqual(30); expect(h).not.toContain("!"); expect(h).not.toMatch(/\p{Extended_Pictographic}/u); }
      for (const d of copy.descriptions) expect(displayWidth(d)).toBeLessThanOrEqual(90);
      expect(displayWidth(copy.path1)).toBeLessThanOrEqual(15);
      expect(displayWidth(copy.path2)).toBeLessThanOrEqual(15);
      expect(searchCopyErrors(copy)).toEqual([]);
    }
  });
  it("cleans editorial problems and counts wide characters as 2", () => {
    expect(cleanText("HUGE SALE!!! 🔥")).toBe("Huge Sale.");
    expect(cleanText("Call now!! Really??", { allowExclamation: true })).toBe("Call now! Really?");
    expect(displayWidth("東京")).toBe(4);
    expect(searchCopyErrors({ headlines: ["Great Roofs!", "A", "B"], descriptions: ["x", "y"], path1: "", path2: "p" }).join(" ")).toMatch(/"!"[\s\S]*Path 2 needs Path 1/);
  });
  it("keywords are phrase/exact, short, deduped, with the city", () => {
    const kws = draftKeywords({ brandName: "Acme", landingPage: "x", mainOffer: "Roof repair, gutter cleaning", location: "Austin, TX" });
    expect(kws).toContainEqual({ text: "roof repair austin", match: "EXACT" });
    for (const k of kws) { expect(k.text.length).toBeLessThanOrEqual(80); expect(k.text.split(" ").length).toBeLessThanOrEqual(10); }
    expect(new Set(kws.map((k) => k.match + k.text)).size).toBe(kws.length);
  });
  it("budget in account currency; micros", () => {
    expect(budgetSuggestion("gbp")).toEqual({ suggestedDaily: 15, currency: "GBP", min: 4 });
    expect(budgetSuggestion(null).currency).toBe("USD");
    expect(toMicros(12.345)).toBe(12_350_000);
  });
});

const payload = (over: Record<string, unknown> = {}) => parseGooglePublishPayload({
  adIds: ["ad1"], customerId: "123-456-7890", campaigns: ["search"], dailyBudget: 20,
  geo: [{ kind: "location", id: "1026201", name: "Austin", type: "City", countryCode: "US" }, { kind: "radius", lat: 30.2, lng: -97.7, miles: 10, label: "Near" }],
  keywords: [{ text: "roof repair", match: "PHRASE" }], search: { headlines: ["Roof Repair", "Acme Roofing", "Free Roof Check"], descriptions: ["Local roof repair in Austin.", "Call Acme today."], path1: "roofs", path2: "austin" },
  finalUrl: "https://acme.test/", ...over,
});

describe("mutate payloads", () => {
  it("search: everything PAUSED, Google Search only, Maximize clicks with cap", () => {
    const ops = searchOperations("1234567890", "Komendly Search", payload({ maxCpc: 2.5 })) as any[];
    const camp = ops.find((o) => o.campaignOperation).campaignOperation.create;
    expect(camp.status).toBe("PAUSED");
    expect(camp.networkSettings).toEqual({ targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false });
    expect(camp.targetSpend).toEqual({ cpcBidCeilingMicros: "2500000" });
    expect(ops.find((o) => o.adGroupOperation).adGroupOperation.create.status).toBe("PAUSED");
    const ad = ops.find((o) => o.adGroupAdOperation).adGroupAdOperation.create;
    expect(ad.status).toBe("PAUSED");
    expect(ad.ad.responsiveSearchAd.headlines).toHaveLength(3);
    expect(ops.filter((o) => o.campaignCriterionOperation)).toHaveLength(2);
    expect(ops.find((o) => o.campaignBudgetOperation).campaignBudgetOperation.create.amountMicros).toBe("20000000");
  });
  it("rejects bad payloads server-side", () => {
    expect(() => payload({ search: { headlines: ["x".repeat(31), "b", "c"], descriptions: ["a", "b"], path1: "", path2: "" } })).toThrow(/longer than 30/);
    expect(() => payload({ customerId: "12" })).toThrow(/customerId/);
    expect(() => payload({ geo: [] })).toThrow(/geo/);
    expect(() => payload({ youtubeVideoUrl: "https://example.com/v" })).toThrow(/youtube/);
    expect(youtubeId("https://www.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
  });
  it("activation enables ads, ad group, campaign; pause only the campaign", () => {
    expect(activationOperations({ campaignResource: "c", adGroupResource: "g", adResources: ["a"] }, "enable")).toHaveLength(3);
    expect(activationOperations({ campaignResource: "c" }, "pause")).toEqual([{ campaignOperation: { update: { resourceName: "c", status: "PAUSED" }, updateMask: "status" } }]);
  });
});

function memStore(over: Partial<GooglePublishStore> = {}) {
  const results: Record<string, KindResult> = {};
  const store: GooglePublishStore = {
    loadAds: async () => [{ id: "ad1", eligible: true, headline: "Roof repair", body: "Fast local roof repair.", cta: "Book", ratios: ["1:1"] }],
    image: async (adId, ratio) => ({ adId, ratio, bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" }),
    logo: async () => new Uint8Array([9]),
    setResult: async (k, r) => { results[k] = r; },
    ...over,
  };
  return { store, results };
}

describe("publish + rollback", () => {
  it("rolls back a created search campaign when demand gen fails", async () => {
    const { f, calls } = mockFetch((url, body) => {
      if (url.endsWith("googleAds:search")) return { results: [] };
      const ops = body.mutateOperations as any[];
      if (ops.some((o) => o.campaignOperation?.create?.advertisingChannelType === "DEMAND_GEN")) return new Response(JSON.stringify({ error: { code: 400, message: "bad", details: [{ errors: [{ message: "Image too small.", errorCode: { imageError: "IMAGE_TOO_SMALL" } }] }] } }), { status: 400 });
      if (ops[0].campaignBudgetOperation?.create) return { mutateOperationResponses: ops.map((o, i) => ({ [Object.keys(o)[0]!.replace("Operation", "Result")]: { resourceName: `customers/1234567890/x/${i + 1}` } })) };
      return { mutateOperationResponses: [] };
    });
    const { store, results } = memStore();
    const s = await publishToGoogle({ client: client(f), store, payload: payload({ campaigns: ["search", "demand_gen"] }), businessName: "Acme", currency: "USD", now: () => new Date("2026-11-27T10:00:00Z") });
    expect(s).toEqual({ created: [], failed: ["search", "demand_gen"], rolledBack: true });
    const removes = calls.flatMap((c) => (c.body?.mutateOperations ?? []).filter((o: any) => o.campaignOperation?.remove || o.campaignBudgetOperation?.remove));
    expect(removes.length).toBe(2);
    expect(results.search!.status).toBe("failed");
    expect(results.demand_gen!.error).toContain("Image too small");
  });
  it("refuses ads that are not ready/QC-passed", async () => {
    const { f, calls } = mockFetch(() => ({}));
    const { store, results } = memStore({ loadAds: async () => [{ id: "ad1", eligible: false, headline: "", body: null, cta: null, ratios: [] }] });
    const s = await publishToGoogle({ client: client(f), store, payload: payload(), businessName: "Acme", currency: "USD", now: () => new Date() });
    expect(s.created).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(results.search!.error).toMatch(/quality checks/);
  });
  it("demand gen uses multi-asset ad, PAUSED, business name <= 25, respects the minimum budget", async () => {
    const { f, calls } = mockFetch((url, body) => {
      if (url.endsWith("googleAds:search")) return { results: [{ currencyConstant: { demandGenInfo: { minimumBudgetPerDayMicros: "5000000" } } }] };
      return { mutateOperationResponses: (body.mutateOperations as any[]).map((_, i) => ({ r: { resourceName: `customers/1/campaigns/${i}` } })) };
    });
    const { store } = memStore();
    await publishToGoogle({ client: client(f), store, payload: payload({ campaigns: ["demand_gen"] }), businessName: "An Extremely Long Business Name LLC", currency: "USD", now: () => new Date() });
    const ops = calls.find((c) => c.url.endsWith("googleAds:mutate"))!.body.mutateOperations as any[];
    const ad = ops.find((o) => o.adGroupAdOperation).adGroupAdOperation.create;
    expect(ad.status).toBe("PAUSED");
    expect(ad.ad.demandGenMultiAssetAd.businessName.length).toBeLessThanOrEqual(25);
    expect(ad.ad.demandGenMultiAssetAd.squareMarketingImages).toHaveLength(1);
    expect(ops.find((o) => o.campaignOperation).campaignOperation.create.status).toBe("PAUSED");
    const low = memStore();
    const s = await publishToGoogle({ client: client(f), store: low.store, payload: payload({ campaigns: ["demand_gen"], dailyBudget: 2 }), businessName: "Acme", currency: "USD", now: () => new Date() });
    expect(s.failed).toEqual(["demand_gen"]);
    expect(low.results.demand_gen!.error).toMatch(/at least 5 USD/);
  });
});

describe("readiness + ops", () => {
  it("maps billing/account/link into blockers", () => {
    expect(mapBilling(["APPROVED"])).toBe("ok");
    expect(mapBilling(["PENDING"])).toBe("missing");
    expect(mapBilling([])).toBe("missing");
    expect(readinessFrom({ billing: "ok", account: "ok", managerLink: "none" }, false).canPublish).toBe(true);
    const r = readinessFrom({ billing: "missing", account: "suspended", managerLink: "pending" }, true);
    expect(r.canPublish).toBe(false);
    expect(r.blockers.length).toBe(3);
  });
  it("checkReadiness over mocked REST (oauth, login-customer-id header, no developer-token)", async () => {
    const { f, calls } = mockFetch((_u, body) => (String(body.query).includes("billing_setup") ? { results: [{ billingSetup: { status: "APPROVED" } }] } : { results: [{ customer: { status: "ENABLED" } }] }));
    vi.stubGlobal("fetch", f);
    try {
      const r = await checkReadiness({ kind: "oauth", refreshToken: "rt" }, "123-456-7890", "9998887777", ENV);
      expect(r).toEqual({ billing: "ok", account: "ok", managerLink: "none", canPublish: true, blockers: [] });
      expect(calls[0]!.url).toBe("https://googleads.googleapis.com/v26/customers/1234567890/googleAds:search");
      expect(calls[0]!.headers["login-customer-id"]).toBe("9998887777");
      expect(calls[0]!.headers["developer-token"]).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });
  it("listAccounts walks manager hierarchies and skips managers", async () => {
    const { f } = mockFetch((url) => {
      if (url.endsWith("listAccessibleCustomers")) return { resourceNames: ["customers/1000000001"] };
      return { results: [
        { customerClient: { clientCustomer: "customers/1000000001", manager: true, descriptiveName: "MCC" } },
        { customerClient: { clientCustomer: "customers/2000000002", manager: false, descriptiveName: "Shop", currencyCode: "EUR", timeZone: "Europe/Paris", status: "ENABLED", testAccount: true } },
      ] };
    });
    vi.stubGlobal("fetch", f);
    try {
      expect(await listAccounts({ kind: "oauth", refreshToken: "rt" }, ENV)).toEqual([{ customerId: "2000000002", name: "Shop", currency: "EUR", timeZone: "Europe/Paris", manager: false, status: "ENABLED", test: true, loginCustomerId: "1000000001" }]);
    } finally { vi.unstubAllGlobals(); }
  });
  it("suggestGeo returns location picks", async () => {
    const { f } = mockFetch(() => ({ geoTargetConstantSuggestions: [{ geoTargetConstant: { id: "1026201", name: "Austin", canonicalName: "Austin,Texas,United States", targetType: "City", countryCode: "US", status: "ENABLED" } }] }));
    vi.stubGlobal("fetch", f);
    try {
      const r = await suggestGeo({ kind: "manager" }, "Austin", "US", ENV);
      expect(r[0]).toMatchObject({ kind: "location", id: "1026201", type: "City", countryCode: "US" });
    } finally { vi.unstubAllGlobals(); }
  });
  it("normalizes customer ids", () => {
    expect(normalizeCustomerId("123-456-7890")).toBe("1234567890");
    expect(normalizeCustomerId("12345")).toBeNull();
  });
});

describe("sync", () => {
  it("maps policy, serving and cost micros", async () => {
    const { f } = mockFetch((_u, body) => String(body.query).includes("FROM campaign ")
      ? { results: [{ campaign: { resourceName: "customers/1/campaigns/5", status: "PAUSED" }, metrics: { impressions: "100", clicks: "7", costMicros: "12345678", conversions: 1.5 } }] }
      : { results: [{ campaign: { resourceName: "customers/1/campaigns/5" }, adGroupAd: { policySummary: { approvalStatus: "DISAPPROVED", reviewStatus: "REVIEWED", policyTopicEntries: [{ topic: "DESTINATION_NOT_WORKING", type: "PROHIBITED" }] } } }] });
    const m = await syncCampaigns(client(f), "1", ["customers/1/campaigns/5"], "USD", "2026-11-01");
    expect(m.get("customers/1/campaigns/5")).toEqual({ serving: "paused", policy: "disapproved", policyIssues: ["Your website link didn't load for Google's reviewers."], metrics: { impressions: 100, clicks: 7, cost: 12.35, conversions: 1.5, currency: "USD", since: "2026-11-01" } });
    expect(aggregatePolicy([{ approval: "APPROVED" }, { approval: "DISAPPROVED" }])).toBe("limited");
    expect(aggregatePolicy([{ approval: "UNKNOWN", review: "REVIEW_IN_PROGRESS" }])).toBe("under_review");
  });
});
