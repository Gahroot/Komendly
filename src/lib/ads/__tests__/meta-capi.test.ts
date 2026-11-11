import { describe, expect, it } from "vitest";
import { buildMetaEvent, sha256 } from "@/lib/ads/meta-capi";
import { ADS_TO_META, metaEventId } from "@/lib/ads/meta-forward";
import { fbcFromFbclid, firstTouchFromUrl, parseFirstTouch, serializeFirstTouch } from "@/lib/analytics/first-touch";

const now = new Date("2026-11-07T10:00:00Z");

describe("meta capi", () => {
  it("hashes email lowercase and user id, keeps fbc/fbp/ip/ua raw", () => {
    const e = buildMetaEvent({ eventName: "Purchase", eventId: "Purchase:w1", eventTime: now, sourceUrl: "https://x/", value: 49, user: { email: " A@B.com ", userId: "u1", ip: "1.2.3.4", userAgent: "UA", fbc: "fb.1.1.c", fbp: "fb.1.1.p" } });
    expect(e).toMatchObject({ event_name: "Purchase", event_id: "Purchase:w1", action_source: "website", event_time: now.getTime() / 1000, custom_data: { value: 49, currency: "USD" } });
    expect(e.user_data).toEqual({ em: [sha256("a@b.com")], external_id: [sha256("u1")], client_ip_address: "1.2.3.4", client_user_agent: "UA", fbc: "fb.1.1.c", fbp: "fb.1.1.p" });
  });
  it("maps funnel events and builds ids the browser can reproduce", () => {
    expect(ADS_TO_META.purchased).toEqual(["Purchase", "Subscribe"]);
    expect(ADS_TO_META.paid_converted).toBeUndefined();
    expect(metaEventId("Purchase", { workspaceId: "w1", props: { checkoutSessionId: "cs_1" } }, now)).toBe("Purchase:cs_1");
    expect(ADS_TO_META.extraction_shown).toBeUndefined();
    expect(metaEventId("TrialCompleted", { runId: "r1", workspaceId: "w1" }, now)).toBe("TrialCompleted:r1");
    expect(metaEventId("Purchase", { workspaceId: "w1" }, now)).toBe("Purchase:w1");
  });
});

describe("touch attribution", () => {
  it("captures fbclid as Meta fbc and external referrer", () => {
    const t = firstTouchFromUrl(new URL("https://komendly.com/?fbclid=AbC_1&utm_source=facebook"), now, "https://l.facebook.com/x");
    expect(t).toMatchObject({ utm_source: "facebook", fbclid: "AbC_1", fbc: fbcFromFbclid("AbC_1", now), referrer: "l.facebook.com", landing: "/" });
    expect(parseFirstTouch(serializeFirstTouch(t ?? {}))).toEqual(t);
  });
  it("ignores own-site referrers and plain visits", () => {
    expect(firstTouchFromUrl(new URL("https://www.komendly.com/pricing"), now, "https://komendly.com/")).toBeNull();
  });
});

describe("extra match keys", () => {
  it("hashes name and geo with Meta normalisation, skips empties", async () => {
    const { buildMetaEvent, sha256 } = await import("../meta-capi");
    const ev = buildMetaEvent({
      eventName: "CompleteRegistration", eventId: "x", eventTime: new Date(0),
      user: { email: "a@b.com", firstName: " Jane ", lastName: "Van Dyke", country: "US", state: "CA", city: "San Francisco", zip: "94107-1234" },
    }) as { user_data: Record<string, string[]> };
    expect(ev.user_data.fn).toEqual([sha256("jane")]);
    expect(ev.user_data.ln).toEqual([sha256("vandyke")]);
    expect(ev.user_data.country).toEqual([sha256("us")]);
    expect(ev.user_data.st).toEqual([sha256("ca")]);
    expect(ev.user_data.ct).toEqual([sha256("sanfrancisco")]);
    expect(ev.user_data.zp).toEqual([sha256("94107")]);
    const bare = buildMetaEvent({ eventName: "StartTrial", eventId: "y", eventTime: new Date(0), user: { firstName: "  " } }) as { user_data: Record<string, unknown> };
    expect(bare.user_data.fn).toBeUndefined();
    expect(bare.user_data.ct).toBeUndefined();
  });
  it("splits names", async () => {
    const { splitName } = await import("../meta-forward");
    expect(splitName("Jane van Dyke")).toEqual({ firstName: "Jane", lastName: "van Dyke" });
    expect(splitName("Cher")).toEqual({ firstName: "Cher" });
    expect(splitName(null)).toEqual({});
  });
});
