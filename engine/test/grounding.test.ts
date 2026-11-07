import { describe, expect, it } from "vitest";
import { keepGrounded, locateQuote, mapClaimsToFacts } from "../src/jobs/grounding";

const facts = [
  { claim: "Plans start at $9 per month", sourceUrl: "https://x.com/pricing", quote: "Plans start at $9/month" },
  { claim: "No cookies and fully GDPR compliant", sourceUrl: "https://x.com/", quote: "No cookies. Fully compliant with GDPR" },
];

describe("grounding", () => {
  it("maps paraphrased claims to facts", () => {
    const r = mapClaimsToFacts([{ claim: "Fully GDPR compliant, no cookies", sourceUrl: "https://x.com/" }], facts);
    expect(r[0]?.factIndex).toBe(1);
  });
  it("rejects claims with numbers the fact doesn't have", () => {
    const r = mapClaimsToFacts([{ claim: "Plans start at $5 per month", sourceUrl: "https://x.com/pricing" }], facts);
    expect(r[0]?.factIndex).toBeNull();
  });
  it("rejects unrelated claims", () => {
    expect(mapClaimsToFacts([{ claim: "Doubles your revenue in 30 days", sourceUrl: "" }], facts)[0]?.factIndex).toBeNull();
  });
  it("keeps only quotes found verbatim on a page, fixing sourceUrl", () => {
    const pages = [{ url: "https://x.com/a", text: "Hello.  Our tool   saves you HOURS every week." }];
    expect(locateQuote("our tool saves you hours", "https://x.com/b", pages)).toBe("https://x.com/a");
    const r = keepGrounded(
      [
        { text: "a", sourceUrl: "https://x.com/b", quote: "saves you hours every week" },
        { text: "b", sourceUrl: "https://x.com/a", quote: "invented quote" },
      ],
      pages,
    );
    expect(r.kept.map((k) => k.sourceUrl)).toEqual(["https://x.com/a"]);
    expect(r.dropped).toHaveLength(1);
  });
});

import { expandToSentence, isCompleteSentence } from "../src/jobs/grounding";
import { isTransient } from "../src/runner";

describe("quote completeness", () => {
  const text = "Reviews\nWorking with Jane was great. She was able to help us close on the perfect home within our tight timeline. Highly recommend!";
  it("expands a mid-sentence fragment to the full verbatim sentence", () => {
    const full = expandToSentence("able to help us close on the perfect home within our tight timeline.", text);
    expect(full).toBe("She was able to help us close on the perfect home within our tight timeline.");
    expect(isCompleteSentence(full ?? "")).toBe(true);
    expect(isCompleteSentence("able to help us close on the perfect home.")).toBe(false);
  });
  it("classifies transient network errors", () => {
    expect(isTransient(new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "ECONNRESET" }) }))).toBe(true);
    expect(isTransient(new Error("model output did not match schema"))).toBe(false);
  });
});
