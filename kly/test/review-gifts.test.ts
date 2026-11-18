import { describe, expect, it } from "vitest";
import { extractReviews, HARD_MAX_PRESENTER_PER_DAY, HARD_MAX_REVIEW_GIFTS_PER_DAY, nextKind, presenterCap, themeColor, pickActorIndex, pickReview, reviewGiftCap, reviewGiftsCycle, reviewPages, spokenExcerpt, validAuthor, videosLeft } from "../src/review-gifts";
import { fakeDb } from "./fakes";

const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

describe("review parsing", () => {
  it("reads schema.org reviews from the business's own JSON-LD and skips third-party publishers", () => {
    const html = ld({ "@type": "LocalBusiness", name: "Acme", review: [
      { "@type": "Review", author: { "@type": "Person", name: "Jane D." }, reviewBody: "They fixed our leak in an hour. Friendly, fair price, and they cleaned up after.", reviewRating: { ratingValue: 5 } },
      { "@type": "Review", author: "Bob", reviewBody: "Great work on the roof, would hire again.", publisher: { name: "Google" } },
    ] });
    const r = extractReviews(html, "https://acme.com/");
    expect(r).toEqual([{ author: "Jane D.", text: "They fixed our leak in an hour. Friendly, fair price, and they cleaned up after.", rating: 5, sourceUrl: "https://acme.com/" }]);
  });
  it("reads blockquote testimonials with a cited name, normalises 10-point ratings", () => {
    const html = `<blockquote><p>Best haircut I&#39;ve had in years. Sam listened.</p><cite>— Maria Lopez</cite></blockquote>` + ld({ "@type": "Review", author: "Tom", reviewBody: "x".repeat(50), reviewRating: { ratingValue: 8, bestRating: 10 } });
    const r = extractReviews(html, "https://s.com/reviews");
    expect(r.find((x) => x.author === "Maria Lopez")?.text).toBe("Best haircut I've had in years. Sam listened.");
    expect(r.find((x) => x.author === "Tom")?.rating).toBe(4);
  });
  it("ignores broken JSON and blockquotes without an author", () => {
    expect(extractReviews(`<script type="application/ld+json">{bad</script><blockquote>Nice</blockquote>`, "https://a.com")).toEqual([]);
  });
  it("finds same-site review pages only", () => {
    const html = `<a href="/reviews">R</a><a href="https://acme.com/testimonials/">T</a><a href="https://yelp.com/biz/acme-reviews">Y</a><a href="/about">A</a>`;
    expect(reviewPages("https://acme.com/", html)).toEqual(["https://acme.com/reviews", "https://acme.com/testimonials/"]);
  });
});

describe("review selection", () => {
  it("excerpts whole sentences verbatim and never cuts mid-sentence", () => {
    const t = "They came the same day and fixed everything. The price was exactly what they quoted us. I have since recommended them to all my neighbors and my whole family, and every single one of them was happy.";
    expect(spokenExcerpt(t, 20)).toBe("They came the same day and fixed everything. The price was exactly what they quoted us.");
    expect(spokenExcerpt("Great.", 32)).toBeNull();
  });
  it("prefers 5-star named reviews of speakable length; drops low ratings, anonymous, links and profanity", () => {
    const base = { sourceUrl: "https://a.com" };
    const picked = pickReview([
      { ...base, author: "Anonymous", text: "Wonderful team, they did a great job on our kitchen remodel and finished on time.", rating: 5 },
      { ...base, author: "Ann", text: "Terrible service and they never called back about the estimate at all.", rating: 2 },
      { ...base, author: "Lee", text: "Visit www.spam.com for the best deals on everything you need today.", rating: 5 },
      { ...base, author: "Kim P.", text: "Wonderful team, they did a great job on our kitchen remodel and finished on time.", rating: 5 },
      { ...base, author: "Joe", text: "Good job overall, the crew was on time and polite throughout the work.", rating: 4 },
    ]);
    expect(picked?.author).toBe("Kim P.");
    expect(picked?.excerpt).toBe("Wonderful team, they did a great job on our kitchen remodel and finished on time.");
    expect(pickReview([])).toBeNull();
  });
  it("validates authors", () => {
    expect(validAuthor("Jane D.")).toBe(true);
    expect(validAuthor("Verified Customer")).toBe(false);
    expect(validAuthor("j@x.com")).toBe(false);
  });
  it("picks a stable actor per lead", () => {
    expect(pickActorIndex("lead1", 7)).toBe(pickActorIndex("lead1", 7));
    expect(pickActorIndex("x", 0)).toBe(-1);
  });
});

describe("caps", () => {
  it("daily cap comes from env only, default 1, clamped to the hard max", () => {
    expect(reviewGiftCap({})).toBe(3);
    expect(reviewGiftCap({ REVIEW_GIFT_DAILY_CAP: "3" })).toBe(3);
    expect(reviewGiftCap({ REVIEW_GIFT_DAILY_CAP: "999" })).toBe(HARD_MAX_REVIEW_GIFTS_PER_DAY);
    expect(reviewGiftCap({ REVIEW_GIFT_DAILY_CAP: "-2" })).toBe(0);
    expect(reviewGiftCap({ REVIEW_GIFT_DAILY_CAP: "abc" })).toBe(3);
    expect(presenterCap({})).toBe(0);
    expect(presenterCap({ REVIEW_GIFT_PRESENTER_DAILY_CAP: "2" })).toBe(2);
    expect(presenterCap({ REVIEW_GIFT_PRESENTER_DAILY_CAP: "50" })).toBe(HARD_MAX_PRESENTER_PER_DAY);
    expect(HARD_MAX_PRESENTER_PER_DAY).toBe(5);
    expect(nextKind(0)).toBe("quote");
    expect(nextKind(1)).toBe("presenter");
    expect(themeColor('<meta name="theme-color" content="#1a2">')).toBe("#11AA22");
    expect(videosLeft(1, 1)).toBe(0);
    expect(videosLeft(2, 0)).toBe(2);
  });
  it("starts no video once today's cap is used", async () => {
    const f = fakeDb({
      adsFeatureFlag: { findUnique: () => ({ enabled: true }) },
      klyReviewGift: { count: (a) => ((a as { where: { startedAt?: unknown } }).where.startedAt ? 1 : 0), findMany: () => [] },
    });
    const r = await reviewGiftsCycle({ db: f.db, env: { REVIEW_GIFT_DAILY_CAP: "1" }, now: new Date("2026-11-18T15:00:00Z"), sendingLive: true, stop: null, minScore: 60, fetchPage: async () => null }, 0);
    expect(r?.started).toBe(0);
    expect(f.of("adJob", "create")).toHaveLength(0);
    expect(f.of("engineHeartbeat", "upsert")).toHaveLength(1);
  });
});

describe("kill switch", () => {
  it("does nothing (no scan, no heartbeat) while sys_review_gifts is off", async () => {
    const f = fakeDb();
    expect(await reviewGiftsCycle({ db: f.db, now: new Date(), sendingLive: true, stop: null, minScore: 0 }, 0)).toBeNull();
    expect(f.of("adsFeatureFlag", "findUnique")).toEqual([{ where: { key: "sys_review_gifts" } }]);
    expect(f.calls.filter((c) => c.model !== "adsFeatureFlag")).toHaveLength(0);
  });
  it("claims a lead with a found review and records a lead event", async () => {
    const page = ld({ "@type": "Review", author: "Jane D.", reviewBody: "They fixed our leak in an hour. Friendly, fair price, and they cleaned up after.", reviewRating: { ratingValue: 5 } });
    const f = fakeDb({
      adsFeatureFlag: { findUnique: () => ({ enabled: true }) },
      outboundLead: { findMany: () => [{ id: "l1", website: "https://acme.com", domain: "acme.com", businessName: "Acme" }], updateMany: () => ({ count: 1 }) },
    });
    const r = await reviewGiftsCycle({ db: f.db, now: new Date(), sendingLive: false, stop: null, minScore: 0, fetchPage: async (u) => ({ url: u, html: page }) }, 0);
    expect(r?.found).toBe(1);
    expect((f.of("klyReviewGift", "create")[0] as { data: { reviewerName: string } }).data.reviewerName).toBe("Jane D.");
    expect(f.of("adsEvent", "create")).toHaveLength(1);
  });
});

describe("default path is $0", () => {
  const gift = { id: "g1", leadId: "l1", businessName: "Acme", reviewerName: "Jane D.", reviewText: "They fixed our leak in an hour and cleaned up after.", fullReview: "x", rating: 5, sourceUrl: "https://acme.com/", brandColor: null };
  const db = (presentersToday = 0) => fakeDb({
    adsFeatureFlag: { findUnique: () => ({ enabled: true }) },
    klyReviewGift: { count: (a) => ((a as { where: { kind?: string } }).where.kind ? presentersToday : 0), findMany: (a) => ((a as { where: { status: string } }).where.status === "pending" ? [gift] : []), updateMany: () => ({ count: 1 }) },
    outboundLead: { findUnique: () => ({ domain: "acme.com" }) },
    adJob: { create: () => ({ id: "j1" }) },
    falActor: { findMany: () => [{ id: "a1", voiceId: null }] },
    adsWorkspace: { findUnique: () => ({ id: "w", ownerId: "u" }) },
  });
  const run = (f: ReturnType<typeof fakeDb>, env: NodeJS.ProcessEnv) => reviewGiftsCycle({ db: f.db, env: { OUTBOUND_GIFT_WORKSPACE_ID: "w", ...env }, now: new Date(), sendingLive: true, stop: null, minScore: 0, fetchPage: async () => null }, 0);
  it("creates only a review_quote_video job, never a paid testimonial/FAL job", async () => {
    const f = db();
    expect((await run(f, {}))?.started).toBe(1);
    expect((f.of("adJob", "create") as Array<{ data: { type: string } }>).map((c) => c.data.type)).toEqual(["review_quote_video"]);
    expect(f.of("falCompositeVideo", "create")).toHaveLength(0);
  });
  it("presenter path only when its cap > 0 and not used up today", async () => {
    const on = db();
    await run(on, { REVIEW_GIFT_PRESENTER_DAILY_CAP: "1" });
    expect((on.of("adJob", "create") as Array<{ data: { type: string } }>).map((c) => c.data.type)).toEqual(["testimonial_generate"]);
    const used = db(1);
    await run(used, { REVIEW_GIFT_PRESENTER_DAILY_CAP: "1" });
    expect(used.of("falCompositeVideo", "create")).toHaveLength(0);
  });
});
