import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodexAuth } from "../src/providers/codex-auth";
import { capBody } from "../src/jobs/plan-body";

describe("CodexAuth concurrent first load", () => {
  it("all parallel callers get credentials", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cxauth-"));
    const file = path.join(dir, "auth.json");
    await writeFile(file, JSON.stringify({ accessToken: "tok", refreshToken: "r", expiresAt: Date.now() + 3_600_000, accountId: "acc" }));
    const auth = new CodexAuth({ authFile: file });
    const rs = await Promise.all([auth.resolve(), auth.resolve(), auth.resolve()]);
    for (const r of rs) expect(r.accessToken).toBe("tok");
  });
});

describe("capBody", () => {
  it("keeps short bodies, trims long ones to <=90 at a boundary", () => {
    expect(capBody("Sleep better tonight.")).toBe("Sleep better tonight.");
    const s = capBody("Your baby sleeps through the night in a week. Backed by 12,000 parents who tried everything else first.");
    expect(s).toBe("Your baby sleeps through the night in a week.");
    const w = capBody("word ".repeat(40));
    expect(w && w.length <= 90 && !w.endsWith(" ")).toBe(true);
    expect(capBody("x".repeat(120))).toBeUndefined();
    expect(capBody(undefined)).toBeUndefined();
  });
});

import { cleanTestimonialQuote } from "../src/jobs/extract/quote-clean";
describe("cleanTestimonialQuote", () => {
  it("strips avatar initials, name and role", () => {
    expect(cleanTestimonialQuote("NG Nolan Grout YouTuber I grew my channel twice as fast.")).toEqual({
      quote: "I grew my channel twice as fast.",
      attribution: "Nolan Grout YouTuber",
    });
    expect(cleanTestimonialQuote("Jane Doe, CEO “This saved us hours every week.”").quote).toBe("This saved us hours every week.");
  });
  it("leaves normal quotes alone", () => {
    expect(cleanTestimonialQuote("I love this product, it works.")).toEqual({ quote: "I love this product, it works." });
    expect(cleanTestimonialQuote("OK this is great for my team.")).toEqual({ quote: "OK this is great for my team." });
  });
});
