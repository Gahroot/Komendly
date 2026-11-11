import { describe, expect, it } from "vitest";
import { DRAFT_MAX_AGE_MS, parseDraft } from "../testimonial-draft";

const now = 1_800_000_000_000;
const ok = { reviewText: "Fantastic service, fixed my car the same day!", businessName: "Joe's", reviewerName: "Sam", rating: 5, gender: "female", length: "60", savedAt: now };

describe("parseDraft", () => {
  it("accepts a valid draft", () => {
    expect(parseDraft(JSON.stringify(ok), now)).toMatchObject({ reviewText: ok.reviewText, gender: "female", length: "60" });
  });
  it("rejects junk, short reviews and stale drafts", () => {
    expect(parseDraft("{nope", now)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...ok, reviewText: "short" }), now)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...ok, savedAt: now - DRAFT_MAX_AGE_MS - 1 }), now)).toBeNull();
  });
  it("defaults unknown fields safely", () => {
    const d = parseDraft(JSON.stringify({ ...ok, businessName: 3, gender: "x", length: "45", rating: 9 }), now);
    expect(d).toMatchObject({ businessName: "My business", gender: "any", length: "30", rating: 5 });
  });
});
