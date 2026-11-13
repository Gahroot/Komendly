import { describe, expect, it } from "vitest";
import { STUDIO_CAPTURE_LIMITS, StudioCapturePayloadSchema, launchMessage, launchTitle, normalizeLaunchUrl } from "../../src/lib/studio/contracts";
import { frameConcat, pageSlug, pickTourPages, viewportFor } from "../src/studio/capture-record";

const links = [
  { href: "/pricing", text: "Pricing", nav: true },
  { href: "/login", text: "Log in", nav: true },
  { href: "/blog/some-post", text: "New post", nav: false },
  { href: "/privacy", text: "Privacy", nav: false },
  { href: "https://elsewhere.com/features", text: "Features", nav: true },
  { href: "/features/", text: "Features", nav: true },
  { href: "/#top", text: "Home", nav: true },
  { href: "/changelog", text: "Changelog", nav: false },
  { href: "/logo.png", text: "Product", nav: true },
  { href: "/about", text: "About", nav: false },
];

describe("capture: tour page selection", () => {
  it("picks same-origin key pages, skips home/login/legal/blog posts/files, dedupes trailing slashes", () => {
    expect(pickTourPages("https://acme.com/", links, undefined)).toEqual(["https://acme.com/features", "https://acme.com/pricing", "https://acme.com/changelog"]);
  });
  it("respects the page cap (default = STUDIO_CAPTURE_LIMITS.maxPages)", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ href: `/features/f${i}`, text: "Feature", nav: true }));
    expect(pickTourPages("https://acme.com", many, undefined)).toHaveLength(STUDIO_CAPTURE_LIMITS.maxPages);
    expect(pickTourPages("https://acme.com", many, undefined, 1)).toHaveLength(1);
  });
  it("uses given paths in order, same origin only, without the home page", () => {
    expect(pickTourPages("https://acme.com/", [], ["/new", "https://evil.com/x", "/", "/new#a", "dashboard"])).toEqual(["https://acme.com/new", "https://acme.com/dashboard"]);
  });
  it("is deterministic", () => {
    expect(pickTourPages("https://acme.com", [...links].reverse(), undefined)).toEqual(pickTourPages("https://acme.com", links, undefined));
  });
});

describe("capture: helpers and limits", () => {
  it("records at 1920x1080 or 1080x1920", () => {
    const l = viewportFor("16:9"), p = viewportFor("9:16");
    expect([l.width * l.scale, l.height * l.scale]).toEqual([1920, 1080]);
    expect([p.width * p.scale, p.height * p.scale]).toEqual([1080, 1920]);
  });
  it("slugs pages and builds an ffconcat timeline", () => {
    expect(pageSlug("https://acme.com/Features/AI")).toBe("features-ai");
    expect(pageSlug("https://acme.com/")).toBe("home");
    const c = frameConcat([{ file: "/a/f0.jpg", t: 10 }, { file: "/a/f1.jpg", t: 10.5 }], 11);
    expect(c).toBe("ffconcat version 1.0\nfile '/a/f0.jpg'\nduration 0.5000\nfile '/a/f1.jpg'\nduration 0.5000\nfile '/a/f1.jpg'\n");
  });
  it("keeps the caps sane", () => {
    expect(STUDIO_CAPTURE_LIMITS.maxPages).toBeLessThanOrEqual(3);
    expect(STUDIO_CAPTURE_LIMITS.maxClipSeconds * (STUDIO_CAPTURE_LIMITS.maxPages + 2) * 1000).toBeLessThan(STUDIO_CAPTURE_LIMITS.totalMs);
  });
  it("validates capture payloads and launch text", () => {
    const ids = { sessionId: "s", userMessageId: "u", assistantMessageId: "a" };
    expect(StudioCapturePayloadSchema.parse({ ...ids, url: "https://acme.com" }).aspect).toBe("16:9");
    expect(StudioCapturePayloadSchema.safeParse({ ...ids, url: "not a url" }).success).toBe(false);
    expect(StudioCapturePayloadSchema.safeParse({ ...ids, url: "https://acme.com", aspect: "1:1" }).success).toBe(false);
    expect(launchTitle("https://www.acme.com/x")).toBe("Launch video · acme.com");
    expect(launchMessage({ url: "https://acme.com" })).toContain("https://acme.com");
    expect(normalizeLaunchUrl("http://localhost:3000")).toBeNull();
  });
});
