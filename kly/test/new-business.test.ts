import { describe, expect, it } from "vitest";
import { ctDomain, firstCertAt, isNewSite, newBusinessCycle, createNewBizRuntime, recentCtDomains, usLocation } from "../src/new-business";
import { leadSystemAllowed, systemVariant } from "../src/growth";
import { buildOutboundEmail, checkOutboundEmail } from "../../src/lib/ads/outbound/copy";
import { fakeDb } from "./fakes";

const now = new Date("2026-11-18T12:00:00Z");

describe("CT parsing + filters", () => {
  it("keeps apex small-business domains on allowed TLDs", () => {
    expect(ctDomain("www.austinplumbingpros.com")).toBe("austinplumbingpros.com");
    expect(ctDomain("*.bestroofing.net")).toBe("bestroofing.net");
    expect(ctDomain("mail.acmeplumbing.com")).toBeNull(); // subdomain
    expect(ctDomain("plumbing-shop.myshopify.com")).toBeNull();
    expect(ctDomain("plumbing.co.uk")).toBeNull(); // non-US ccTLD
    expect(ctDomain("plumbing.de")).toBeNull();
    expect(ctDomain("test-plumbing123456.com")).toBeNull();
    expect(ctDomain("xn--plumbng-abc.com")).toBeNull();
  });
  it("collects recent certs per domain within the window", () => {
    const m = recentCtDomains([
      { name_value: "newplumbingco.com\nwww.newplumbingco.com", not_before: "2026-11-15T10:00:00" },
      { name_value: "oldplumbingco.com", not_before: "2026-09-01T10:00:00" },
      { common_name: "cpanel.otherplumbing.com", not_before: "2026-11-16T10:00:00" },
    ], now);
    expect([...m.keys()]).toEqual(["newplumbingco.com"]);
  });
  it("a site is new only when its FIRST cert is recent", () => {
    const renewal = [{ not_before: "2026-11-15T00:00:00" }, { not_before: "2024-01-02T00:00:00" }];
    expect(isNewSite(firstCertAt(renewal), now)).toBe(false);
    expect(isNewSite(firstCertAt([{ not_before: "2026-11-14T00:00:00" }]), now)).toBe(true);
    expect(isNewSite(firstCertAt([]), now)).toBe(false);
  });
  it("needs a US postal address on the site", () => {
    expect(usLocation("<footer>123 Main St, Round Rock, TX 78664</footer>")).toEqual({ city: "Round Rock", state: "TX" });
    expect(usLocation("<p>10 High St, London SW1A 1AA</p>")).toBeNull();
  });
});

describe("kill switch + heartbeat", () => {
  it("off: no CT query, no heartbeat", async () => {
    const f = fakeDb();
    let fetched = 0;
    expect(await newBusinessCycle({ db: f.db, now, stop: null, minScore: 0, senderName: "Ozzy", fetchCt: async () => (fetched++, []) }, createNewBizRuntime(), 0)).toBeNull();
    expect(fetched).toBe(0);
  });
  it("on: heartbeat every cycle even when nothing is found; spend stop skips the search", async () => {
    const f = fakeDb({ adsFeatureFlag: { findUnique: () => ({ enabled: true }) } });
    let fetched = 0;
    const r = await newBusinessCycle({ db: f.db, now, stop: "monthly budget reached", minScore: 0, senderName: "Ozzy", fetchCt: async () => (fetched++, []) }, createNewBizRuntime(), 2);
    expect(r?.leads).toBe(0);
    expect(fetched).toBe(0);
    const up = f.of("engineHeartbeat", "upsert")[0] as { where: { id: string }; create: { meta: { outputs: number } } };
    expect(up.where.id).toBe("system:new_business");
    expect(up.create.meta.outputs).toBe(2);
  });
  it("skips domains already taken or suppressed", async () => {
    const f = fakeDb({ adsFeatureFlag: { findUnique: () => ({ enabled: true }) }, outboundLead: { findMany: () => [{ domain: "newplumbingco.com" }] } });
    const r = await newBusinessCycle({ db: f.db, now, stop: null, minScore: 0, senderName: "Ozzy", fetchCt: async () => [{ name_value: "newplumbingco.com", not_before: "2026-11-15T10:00:00" }] }, createNewBizRuntime(), 0);
    expect(r?.recent).toBe(1);
    expect(r?.checked).toBe(0);
  });
  it("a lead's system switch gates sending; classic leads are untouched", async () => {
    expect(await leadSystemAllowed(fakeDb().db, null)).toBe(true);
    expect(await leadSystemAllowed(fakeDb().db, "new_business")).toBe(false);
    expect(await leadSystemAllowed(fakeDb({ adsFeatureFlag: { findUnique: () => ({ enabled: true }) } }).db, "review_gifts")).toBe(true);
  });
});

describe("system copy passes the compliance gate", () => {
  for (const system of ["review_gifts", "new_business"]) {
    for (const step of [1, 2] as const) {
      it(`${system} step ${step}`, () => {
        const ctx = { step, businessName: "Acme Plumbing LLC", city: "Austin", niche: "plumber", senderName: "Ozzy", claimUrl: "https://www.komendly.com/g/abc", unsubscribeUrl: "https://www.komendly.com/u/def", postalAddress: "2211 Cole St, Birmingham, MI 48009", variant: systemVariant({ system, systemData: { reviewerName: "Jane D." } })!, firstSubject: "x" };
        const mail = buildOutboundEmail(ctx);
        expect(checkOutboundEmail(mail, ctx)).toBeNull();
        if (step === 1) expect(mail.text).toContain(system === "review_gifts" ? "Jane D.'s review" : "new website");
      });
    }
  }
});
