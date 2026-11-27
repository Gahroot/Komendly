import { describe, expect, it } from "vitest";
import { PUBLIC_OFFER } from "../ads/public-offer";
import { alertMail, checkDb, checkOfferApi, checkPage, checkSitemap, checkStripeCoupon, checkStripePrice, newProblems, PAGE_SPECS, type DbFacts } from "../funnel-checks";

const spec = (p: string) => PAGE_SPECS.find((s) => s.path === p)!;
const okFacts: DbFacts = { finishedPacks24h: 5, finishedPacksNoReadyAds24h: 0, paidUnlocksStillLocked: 0, signups: 10, signupsNoPack: 2, stuckRunning: 0, stuckQueued: 0 };

describe("funnel checks", () => {
  it("page: status, text and price", () => {
    const body = `<h1>Quotes</h1> ${PUBLIC_OFFER.heroPrice} ${PUBLIC_OFFER.heroRegularPrice}`;
    expect(checkPage(spec("/pricing"), { status: 200, body }).every((r) => r.ok)).toBe(true);
    expect(checkPage(spec("/pricing"), { status: 500, body })[0].ok).toBe(false);
    expect(checkPage(spec("/pricing"), { status: 200, body: "<h1>Quotes</h1>" })[0].detail).toMatch(/missing price/);
    expect(checkPage(spec("/pricing"), { error: "timeout" })[0].ok).toBe(false);
  });
  it("redirect accepted only to login", () => {
    expect(checkPage(spec("/ads/team"), { status: 307, body: "", location: "/ads/login?next=%2Fads%2Fteam" })[0].ok).toBe(true);
    expect(checkPage(spec("/ads/team"), { status: 307, body: "", location: "/somewhere" })[0].ok).toBe(false);
  });
  it("copy lint flags banned promises in visible text only", () => {
    const bad = checkPage(spec("/compare"), { status: 200, body: "<p>Compared. We get 50 leads for you</p>" });
    expect(bad.find((r) => r.name.startsWith("copy-lint"))?.ok).toBe(false);
    const scriptOnly = checkPage(spec("/compare"), { status: 200, body: "<p>Compared</p><script>one-click</script>" });
    expect(scriptOnly.find((r) => r.name.startsWith("copy-lint"))?.ok).toBe(true);
  });
  it("sitemap", () => {
    expect(checkSitemap("<loc>https://x.com/free-ads</loc>", "https://x.com").ok).toBe(false);
    const all = ["/free-ads", "/free-ads/roofers", "/free-ads/plumbers", "/compare", "/for/agencies"].map((p) => `<loc>https://x.com${p}</loc>`).join("");
    expect(checkSitemap(all, "https://x.com/").ok).toBe(true);
  });
  it("offer api shape", () => {
    expect(checkOfferApi(401, "").ok).toBe(true);
    expect(checkOfferApi(200, "{}").ok).toBe(true);
    expect(checkOfferApi(200, "<html>").ok).toBe(false);
    expect(checkOfferApi(500, "").ok).toBe(false);
  });
  it("stripe objects", () => {
    expect(checkStripePrice("u", "price_1", { active: true, unit_amount: 900 }, 900).ok).toBe(true);
    expect(checkStripePrice("u", "price_1", { active: false, unit_amount: 900 }, 900).ok).toBe(false);
    expect(checkStripePrice("u", "price_1", { active: true, unit_amount: 700 }, 900).ok).toBe(false);
    expect(checkStripePrice("u", undefined, null, 900).detail).toMatch(/not set/);
    expect(checkStripeCoupon("c", "c1", { valid: true, amount_off: 20000 }, 20000).ok).toBe(true);
    expect(checkStripeCoupon("c", "c1", { valid: false, amount_off: 20000 }, 20000).ok).toBe(false);
  });
  it("db rules", () => {
    expect(checkDb(okFacts).every((r) => r.ok)).toBe(true);
    expect(checkDb({ ...okFacts, finishedPacksNoReadyAds24h: 1 })[0].ok).toBe(false);
    expect(checkDb({ ...okFacts, paidUnlocksStillLocked: 1 })[1].ok).toBe(false);
    expect(checkDb({ ...okFacts, signups: 10, signupsNoPack: 8 })[2].ok).toBe(false);
    expect(checkDb({ ...okFacts, signups: 2, signupsNoPack: 2 })[2].ok).toBe(true); // too few to judge
    expect(checkDb({ ...okFacts, stuckRunning: 1 })[3].ok).toBe(false);
  });
  it("dedupes alerts per problem", () => {
    const res = checkDb({ ...okFacts, stuckRunning: 2, finishedPacksNoReadyAds24h: 1 });
    expect(newProblems(res, new Set()).length).toBe(2);
    const again = newProblems(res, new Set(["db stuck AdJobs"]));
    expect(again.map((r) => r.name)).toEqual(["db packs with no ready ads"]);
    expect(alertMail(again, "https://x").subject).toMatch(/^Komendly check failed: /);
  });
});

describe("copy-lint allowances", () => {
  it("allows the refund line but not a one-click promise", () => {
    const lint = (b: string) => checkPage(spec("/compare"), { status: 200, body: `<p>Compared ${b}</p>` }).find((r) => r.name.startsWith("copy-lint"))!.ok;
    expect(lint("Not happy? One click, full refund.")).toBe(true);
    expect(lint("Ads in one click")).toBe(false);
  });
});
