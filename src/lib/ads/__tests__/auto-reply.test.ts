import { describe, expect, it } from "vitest";
import { buildAutoReply, classifyByRules, guardrailBlock, loopSkipReason, needsHuman, parseCategory, threadKey } from "../auto-reply";
import { buildReplyForward } from "../inbound";

const ctx = { category: "how_to" as const, firstName: "Sam", runUrl: "https://x.test/ads/runs/r1", pricingUrl: "https://x.test/pricing", billingUrl: "https://x.test/ads/billing", paying: false };

describe("classifyByRules", () => {
  it.each([
    ["I can't download my ads", "support_problem"],
    ["can't log in, no code", "support_problem"],
    ["please refund me", "refund_request"],
    ["unsubscribe me", "unsubscribe"],
    ["not interested, thanks", "not_interested"],
    ["it's too expensive for me", "objection"],
    ["how do I change the headline?", "how_to"],
    ["how much is the autopilot plan", "interested"],
    ["I'll contact my lawyer", "angry_legal"],
    ["", "other"],
    ["ok cool", null],
  ])("%s -> %s", (t, c) => expect(classifyByRules(t)).toBe(c));
  it("billing only for paying users", () => {
    expect(classifyByRules("I was charged twice", { paying: true })).toBe("billing");
    expect(classifyByRules("I was charged twice")).toBeNull();
  });
  it("parses AI category defensively", () => {
    expect(parseCategory('{"category":"how_to"}')).toBe("how_to");
    expect(parseCategory({ category: "bogus" })).toBeNull();
    expect(parseCategory("nope")).toBeNull();
  });
});

describe("guardrails", () => {
  it("1 per sender per 12h, 3 per thread", () => {
    expect(guardrailBlock({ senderRecent: 0, threadTotal: 0 })).toBeNull();
    expect(guardrailBlock({ senderRecent: 1, threadTotal: 1 })).toMatch(/sender/);
    expect(guardrailBlock({ senderRecent: 0, threadTotal: 3 })).toMatch(/thread/);
  });
  it("normalises thread subject", () => expect(threadKey("Re: RE: Fwd: Your ads")).toBe("your ads"));
  it("flags refund, billing, angry", () => {
    expect(["refund_request", "billing", "angry_legal"].every((c) => needsHuman(c as never))).toBe(true);
    expect(needsHuman("how_to")).toBe(false);
  });
});

describe("loopSkipReason", () => {
  const ok = { from: "sam@gmail.com", subject: "Re: your ads" };
  it("allows a normal reply", () => expect(loopSkipReason(ok)).toBeNull());
  it("skips own domains, forward address, system senders", () => {
    expect(loopSkipReason({ ...ok, from: "nolan@komendly.com" })).toBe("own domain");
    expect(loopSkipReason({ ...ok, from: "nolan@prestyj.com", forwardTo: "nolan@prestyj.com" })).toBe("forward address");
    expect(loopSkipReason({ ...ok, from: "mailer-daemon@x.com" })).toBe("system sender");
  });
  it("skips auto-replies, bounces and our own marker", () => {
    expect(loopSkipReason({ ...ok, headers: { "auto-submitted": "auto-replied" } })).toBeTruthy();
    expect(loopSkipReason({ ...ok, headers: { precedence: "bulk" } })).toBeTruthy();
    expect(loopSkipReason({ ...ok, headers: { "x-komendly-auto": "1" } })).toBe("our own auto-reply");
    expect(loopSkipReason({ ...ok, subject: "Out of office: back Monday" })).toBeTruthy();
    expect(loopSkipReason({ ...ok, subject: "Undeliverable: hi" })).toBeTruthy();
    expect(loopSkipReason({ ...ok, headers: { "auto-submitted": "no" } })).toBeNull();
  });
});

describe("buildAutoReply", () => {
  it("how_to: warm, run link, download, signed Nolan, opt-out", () => {
    const t = buildAutoReply(ctx)!;
    expect(t).toContain("Hi Sam,");
    expect(t).toContain("https://x.test/ads/runs/r1");
    expect(t).toMatch(/Download/);
    expect(t).toMatch(/\nNolan\n/);
    expect(t).toMatch(/unsubscribe/i);
  });
  it("unsubscribe is a one-line confirmation", () => expect(buildAutoReply({ ...ctx, category: "unsubscribe" })).toMatch(/taken you off/));
  it("interested links pricing and asks one question", () => {
    const t = buildAutoReply({ ...ctx, category: "interested" })!;
    expect(t).toContain("https://x.test/pricing");
    expect(t.match(/\?/g)).toHaveLength(1);
  });
  it("refund says flagged, never refunded; billing only links the billing page for payers", () => {
    expect(buildAutoReply({ ...ctx, category: "refund_request", paying: true })).toMatch(/flagged.*review[\s\S]*ads\/billing/);
    expect(buildAutoReply({ ...ctx, category: "billing", paying: false })).toBeNull();
    expect(buildAutoReply({ ...ctx, category: "billing", paying: true })).toContain("/ads/billing");
  });
  it("never promises results; no reply for angry/other", () => {
    expect(buildAutoReply({ ...ctx, category: "objection" })).not.toMatch(/guarantee(d)? (more )?(leads|sales)/i);
    expect(buildAutoReply({ ...ctx, category: "angry_legal" })).toBeNull();
    expect(buildAutoReply({ ...ctx, category: "other" })).toBeNull();
  });
});

describe("forward", () => {
  const r = { from: "sam@gmail.com", fromName: null, to: ["nolan@komendly.com"], subject: "hi", text: "hello" };
  it("prefixes Auto-replied and includes our reply", () => {
    const f = buildReplyForward(r, "nolan@prestyj.com", { category: "how_to", replied: "Hi Sam", flagged: false })!;
    expect(f.subject.startsWith("Auto-replied:")).toBe(true);
    expect(f.text).toContain("Hi Sam");
  });
});
