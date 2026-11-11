import { describe, expect, it } from "vitest";
import { alertMessage, isAlertEvent } from "../founder-alert";

const base = { email: "jo@yahoo.com", name: "Jo", website: "https://joesbakery.com/", source: "facebook / paid", adminUrl: "https://www.komendly.com/admin/ads/signups" };

describe("founder alert", () => {
  it("only alerts on the moments worth a follow-up", () => {
    expect(isAlertEvent("purchased")).toBe(true);
    expect(isAlertEvent("signed_up")).toBe(true);
    expect(isAlertEvent("visit_landed")).toBe(false);
    expect(isAlertEvent("upsell_shown")).toBe(false);
  });
  it("payment shows plan and amount", () => {
    const m = alertMessage({ ...base, event: "purchased", props: { key: "launch_quarter", amountCents: 12900 } });
    expect(m.subject).toBe("[Komendly] PAID: jo@yahoo.com (joesbakery.com)");
    expect(m.text).toContain("PAID: launch_quarter $129");
    expect(m.text).toContain("Came from: facebook / paid");
  });
  it("refused trial shows the reason", () => {
    const m = alertMessage({ ...base, website: null, event: "trial_blocked", props: { reason: "ip_used", domain: "x.com" } });
    expect(m.text).toContain("reason: ip_used (x.com)");
    expect(m.subject).toBe("[Komendly] Free pack refused: jo@yahoo.com");
  });
});
