import { describe, expect, it } from "vitest";
import { paymentAlertKey, paymentAlertMessage } from "@/lib/ads/payment-alert";

describe("paymentAlertKey", () => {
  it("one key per new subscription (checkout + its invoice), one per one-time checkout", () => {
    expect(paymentAlertKey({ kind: "subscription", subscriptionId: "sub_1", checkoutSessionId: "cs_1" })).toBe("sub:sub_1");
    expect(paymentAlertKey({ kind: "subscription", subscriptionId: "sub_1", invoiceId: "in_1" })).toBe("sub:sub_1");
    expect(paymentAlertKey({ kind: "one_time", checkoutSessionId: "cs_2" })).toBe("cs:cs_2");
    expect(paymentAlertKey({ kind: "one_time" })).toBeNull();
  });
});

describe("paymentAlertMessage", () => {
  it("includes amount, plan, workspace, email and channel", () => {
    const m = paymentAlertMessage({ amountCents: 9700, currency: "usd", what: "launch_month", kind: "subscription", workspaceName: "Joe's Plumbing", email: "joe@plumb.co", name: "Joe", channel: "kly", source: "outbound / email / plumbers", adminUrl: "https://x/admin/ads/scoreboard" });
    expect(m.subject).toBe("[Komendly] PAID $97: joe@plumb.co (Kly cold email)");
    expect(m.text).toContain("PAID: $97, new subscription (launch_month)");
    expect(m.text).toContain("Workspace: Joe's Plumbing");
    expect(m.text).toContain("Who: Joe <joe@plumb.co>");
    expect(m.text).toContain("Channel: Kly cold email (first touch: outbound / email / plumbers)");
  });
});
