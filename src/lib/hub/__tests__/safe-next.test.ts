import { describe, expect, it } from "vitest";
import { remixHref, remixStudioPath, safeAppNext } from "../safe-next";

describe("safeAppNext", () => {
  it("keeps same-origin paths and rejects the rest", () => {
    expect(safeAppNext("/ads/start?url=x")).toBe("/ads/start?url=x");
    expect(safeAppNext("/studio")).toBe("/studio");
    expect(safeAppNext(null)).toBe("/dashboard");
    expect(safeAppNext("//evil.com")).toBe("/dashboard");
    expect(safeAppNext("/\\evil.com")).toBe("/dashboard");
    expect(safeAppNext("https://evil.com")).toBe("/dashboard");
    expect(safeAppNext("/login?next=/x")).toBe("/dashboard");
  });
});

describe("remix sign-up round trip", () => {
  const ad = "https://www.tiktok.com/@brand/video/123?is_from_webapp=1&lang=en";
  it("keeps the encoded ad link through /register?next and back to /studio", () => {
    const href = remixHref(ad, false);
    expect(href.startsWith("/register?next=")).toBe(true);
    // What OzzyAuth does: read ?next (URLSearchParams decodes once) -> safeAppNext.
    const next = safeAppNext(new URL(href, "https://www.komendly.com").searchParams.get("next"));
    expect(next).toBe(remixStudioPath(ad));
    // Studio reads ?remix and gets the original link back intact.
    expect(new URL(next, "https://www.komendly.com").searchParams.get("remix")).toBe(ad);
    // The login <-> register toggle re-encodes the same way.
    expect(new URL(`/login?next=${encodeURIComponent(next)}`, "https://x.io").searchParams.get("next")).toBe(next);
  });
  it("signed in goes straight to Studio", () => {
    expect(remixHref(ad, true)).toBe(remixStudioPath(ad));
  });
  it("rejects control characters and off-site targets", () => {
    expect(safeAppNext("/\t/evil.com")).toBe("/dashboard");
    expect(safeAppNext("/\n/evil.com")).toBe("/dashboard");
    expect(safeAppNext(`//evil.com/studio?remix=x`)).toBe("/dashboard");
  });
});
