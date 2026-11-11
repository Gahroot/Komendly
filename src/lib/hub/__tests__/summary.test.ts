import { describe, expect, it } from "vitest";
import { canMakeTestimonials, greetingLine, mergeRecent, parseHubApp, planView, walletView, type HubItem } from "../summary";

const user = { plan: "pending", subscriptionStatus: "incomplete", minutesLimit: 0, minutesUsed: 0, bonusMinutes: 0 };
const ws = { adsPlan: "trial", subscriptionStatus: "none", creditBalance: 3, studioFreeVideos: 1, studioOfferReadyAt: null };
const now = new Date("2026-11-10T12:00:00Z");
const item = (id: string, createdAt: string): HubItem => ({ id, app: "ads", title: id, media: "image", thumbUrl: null, href: "/", status: "ready", createdAt });

describe("hub summary", () => {
  it("merges recent items newest first, ties by id, limited", () => {
    const out = mergeRecent([item("b", "2026-11-01"), item("a", "2026-11-01"), item("c", "2026-11-05")], 2);
    expect(out.map((i) => i.id)).toEqual(["c", "a"]);
  });
  it("wallet hides testimonials unless on a plan or videos left", () => {
    expect(walletView(user, ws)).toEqual({ credits: 3, freeStudioVideos: 1, testimonialVideos: null });
    expect(walletView({ ...user, minutesLimit: 3, minutesUsed: 1 }, ws).testimonialVideos).toBe(2);
    expect(walletView({ ...user, plan: "pro", subscriptionStatus: "active", minutesLimit: 5, minutesUsed: 5 }, ws).testimonialVideos).toBe(0);
  });
  it("testimonial access: plan, pack minutes or admin", () => {
    expect(canMakeTestimonials(user)).toBe(false);
    expect(canMakeTestimonials({ ...user, isAdmin: true })).toBe(true);
    expect(canMakeTestimonials({ ...user, minutesLimit: 1 })).toBe(true);
    expect(canMakeTestimonials({ ...user, plan: "pro", subscriptionStatus: "canceled" })).toBe(false);
  });
  it("plan card picks the right CTA", () => {
    expect(planView(user, ws, now).kind).toBe("free");
    const offer = planView(user, { ...ws, studioOfferReadyAt: new Date("2026-11-09T12:00:00Z") }, now);
    expect(offer.kind).toBe("studio_offer");
    expect(offer.offerEndsAt).toBe("2026-11-12T12:00:00.000Z");
    expect(planView(user, { ...ws, studioOfferReadyAt: new Date("2026-11-01T00:00:00Z") }, now).kind).toBe("free");
    expect(planView({ ...user, plan: "starter", subscriptionStatus: "active" }, ws, now).kind).toBe("legacy");
    expect(planView({ ...user, plan: "starter", subscriptionStatus: "active" }, { ...ws, adsPlan: "growth", subscriptionStatus: "active" }, now).kind).toBe("paid");
  });
  it("parses app filter and greets honestly", () => {
    expect(parseHubApp("studio")).toBe("studio");
    expect(parseHubApp("x")).toBeNull();
    const w = walletView(user, ws);
    expect(greetingLine({ firstName: "Sam", wallet: w, counts: { ads: 0, studio: 0, testimonials: 0 } })).toContain("on me");
    expect(greetingLine({ firstName: "Sam", wallet: w, counts: { ads: 2, studio: 0, testimonials: 0 } })).toContain("welcome back");
  });
});
