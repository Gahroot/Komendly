import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEMS } from "../systems";
import {
  HUB_CONFIGS, activeSeasons, buildNomineeEmail, challengeMs, checkNonprofit, daysUntilWindow, latestShowcases, normalizeSiteUrl, pairId, pairUp, parseHubInput, parsePairId,
  pickBusinessOfTheDay, progressView, signHubToken, slugify, tally, verifyHubToken,
} from "../creative-hubs";

describe("hub forms", () => {
  it("requires consent boxes and valid fields", () => {
    expect(parseHubInput("makeover", { businessName: "A", url: "a.com", email: "x@a.com" }).ok).toBe(false);
    const r = parseHubInput("makeover", { businessName: "A", url: "a.com", email: "X@A.com", owner: true });
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ url: "https://a.com", email: "x@a.com", publicOk: false }) });
  });
  it("rejects webmail nominee addresses and bad EINs", () => {
    expect(parseHubInput("nominate", { businessName: "A", url: "a.com", nomineeEmail: "me@gmail.com", honest: true }).ok).toBe(false);
    expect(parseHubInput("nonprofit", { businessName: "A", url: "a.org", ein: "123", email: "a@a.org", terms: true }).ok).toBe(false);
  });
  it("has a config for every kind with a submit label", () => { for (const c of Object.values(HUB_CONFIGS)) expect(c.submit).toBeTruthy(); });
  it("normalizes urls", () => {
    expect(normalizeSiteUrl("localhost")).toBeNull(); expect(normalizeSiteUrl("http://1.2.3.4")).toBeNull(); expect(normalizeSiteUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSiteUrl("www.Foo.com/")).toBe("https://www.foo.com");
  });
  it("reaction consent defaults to false", () => {
    const r = parseHubInput("reaction", { email: "a@b.co", quote: "nice" }); expect(r.ok && r.data.publishConsent).toBe(false);
  });
});

describe("nonprofit check", () => {
  it("domain match needs a non-webmail address on the site's domain", () => {
    expect(checkNonprofit({ ein: "12-3456789", email: "a@helpkids.org", url: "https://www.helpkids.org" }).status).toBe("domain_verified");
    expect(checkNonprofit({ ein: "12-3456789", email: "a@gmail.com", url: "https://helpkids.org" }).status).toBe("needs_ein_lookup");
    expect(checkNonprofit({ ein: "12-3456789", email: "a@evil.com", url: "https://helpkids.org" }).domainMatch).toBe(false);
  });
});

describe("signed tokens", () => {
  it("round-trips, rejects tampering and expiry", () => {
    const t = signHubToken({ a: "approve", r: "run1", x: 2_000_000_000 }, "s");
    expect(verifyHubToken(t, "s", new Date(1_900_000_000_000))?.r).toBe("run1");
    expect(verifyHubToken(t, "other")).toBeNull(); expect(verifyHubToken(`${t}x`, "s")).toBeNull();
    expect(verifyHubToken(signHubToken({ a: "approve", r: "r", x: 1 }, "s"), "s")).toBeNull();
  });
});

describe("votes", () => {
  it("pair ids are order independent and parse safely", () => {
    expect(pairId("bbbbbb", "aaaaaa")).toBe("aaaaaa~bbbbbb"); expect(parsePairId("aaaaaa~aaaaaa")).toBeNull(); expect(parsePairId("../x~y")).toBeNull();
    expect(pairUp([1, 2, 3])).toEqual([[1, 2]]);
  });
  it("tallies", () => { expect(tally([{ choice: "a" }, { choice: "a" }, { choice: "b" }, { choice: "z" }], "a", "b")).toMatchObject({ a: 2, b: 1, total: 3, aPct: 67, bPct: 33 }); });
});

describe("challenge", () => {
  it("never trusts a client time beyond wall clock or 60s", () => {
    expect(challengeMs(0, 10_000, 1)).toBe(1); expect(challengeMs(0, 10_000, 99_999)).toBe(10_000 + 1500); expect(challengeMs(0, 200_000, 150_000)).toBe(60_000); expect(challengeMs(0, 5, NaN)).toBe(5);
  });
});

describe("seasons", () => {
  it("finds the active window and wraps the year", () => {
    expect(activeSeasons(new Date("2026-11-26T12:00:00Z")).map((s) => s.key)).toContain("black-friday");
    expect(daysUntilWindow("tax-season", new Date("2026-02-01T00:00:00Z"))).toBe(0);
    expect(daysUntilWindow("tax-season", new Date("2026-11-26T00:00:00Z"))).toBeGreaterThan(30);
    expect(activeSeasons(new Date("2026-01-05T00:00:00Z")).map((s) => s.key)).toContain("winter");
  });
});

describe("progress (real counts only)", () => {
  it("never exceeds the funnel above it and day starts at 1", () => {
    expect(progressView({ made: 5, delivered: 9, viewed: 12, claimed: 20 }, new Date("2026-01-01"), new Date("2026-01-01"))).toMatchObject({ day: 1, delivered: 5, viewed: 5, claimed: 5 });
    expect(progressView({ made: 0, delivered: 0, viewed: 0, claimed: 0 }, null, new Date()).day).toBe(0);
  });
});

describe("showcase / business of the day", () => {
  const row = (slug: string, enabled: boolean, botd: boolean, d: number) => ({ slug, enabled, botd, createdAt: new Date(d) });
  it("latest opt-in row wins and opt-out hides", () => {
    expect(latestShowcases([row("a", true, true, 1), row("a", false, false, 2), row("b", true, false, 1)]).map((r) => r.slug)).toEqual(["b"]);
  });
  it("only picks opted-in botd rows outside the cool-down", () => {
    const now = new Date("2026-11-26");
    const rows = [row("a", true, true, 1), row("b", true, true, 1), row("c", true, false, 1)];
    expect(pickBusinessOfTheDay(rows, [{ slug: "a", at: new Date("2026-11-20") }], now)?.slug).toBe("b");
    expect(pickBusinessOfTheDay(rows, [{ slug: "a", at: now }, { slug: "b", at: now }], now)).toBeNull();
  });
  it("slugifies", () => { expect(slugify("Joe's Café & Bar!")).toBe("joe-s-cafe-bar"); });
});

describe("nominee email", () => {
  const m = buildNomineeEmail({ businessName: "Joe's", siteUrl: "https://joes.com", optOutUrl: "https://k/opt", freeUrl: "https://k/free", postal: "1 Main St" });
  it("is honest, from Komendly, one-time, with opt-out and address", () => {
    expect(m.text).toContain("https://k/opt"); expect(m.text).toContain("1 Main St"); expect(m.text).toMatch(/only email/); expect(m.text).not.toMatch(/guarantee|leads|sales/i);
  });
});

describe("registry", () => {
  it("registers the three hub systems with unique utm sources", () => {
    const k = GROWTH_SYSTEMS.map((s) => s.key); for (const x of ["creative_hubs", "creative_outreach", "creative_publish"]) expect(k).toContain(x);
    expect(new Set(GROWTH_SYSTEMS.map((s) => s.utmSource)).size).toBe(GROWTH_SYSTEMS.length);
  });
});
