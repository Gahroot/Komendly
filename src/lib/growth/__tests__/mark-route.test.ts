import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn(async () => {});
let enabled = true;
vi.mock("@/lib/prisma", () => ({ prisma: { adsFeatureFlag: { findUnique: async () => ({ enabled }) } } }));
vi.mock("@/lib/ads/events", () => ({ trackAdsEvent: (...a: unknown[]) => track(...(a as [])) }));

const { GET } = await import("@/app/m/[code]/route");
const call = (code: string, referer?: string) =>
  GET(new Request(`https://www.komendly.com/m/${code}`, { headers: referer ? { referer } : {} }), { params: Promise.resolve({ code }) });

describe("/m/<code> redirect", () => {
  beforeEach(() => { track.mockClear(); enabled = true; });
  it("redirects with made_with attribution and records the visit", async () => {
    const res = await call("ab12cd34", "https://www.instagram.com/");
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/free-ads");
    expect(to.searchParams.get("utm_source")).toBe("made_with");
    expect(to.searchParams.get("utm_campaign")).toBe("mark");
    expect(to.searchParams.get("utm_content")).toBe("ab12cd34");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(track).toHaveBeenCalledWith("branded_share_visit", expect.objectContaining({ props: expect.objectContaining({ system: "viral_branding", surface: "mark" }) }));
  });
  it("internal referrer: no visit event", async () => {
    await call("ab12cd34", "https://www.komendly.com/ads/app");
    expect(track).not.toHaveBeenCalled();
  });
  it("kill switch off or bad code: plain landing, no tracking", async () => {
    enabled = false;
    expect((await call("ab12cd34")).headers.get("location")).toBe("https://www.komendly.com/free-ads");
    enabled = true;
    expect((await call("..%2Fx")).headers.get("location")).toBe("https://www.komendly.com/free-ads");
    expect(track).not.toHaveBeenCalled();
  });
});
