import { describe, expect, it } from "vitest";
import { precheck } from "../../../growth/review-gate";
import { renderLifecycleText } from "../../lifecycle/template";
import { leadAlertEmail, processLeadgen, type LeadAlertDeps, type MetaLead } from "../alert";
import { Q_KEYS } from "../questions";
import type { LeadgenChange } from "../webhook";

const lead: MetaLead = {
  id: "L1",
  createdTime: "2026-11-21T14:03:00+0000",
  adName: "Spring roof check",
  fields: [
    { name: "full_name", values: ["Jane Doe"] },
    { name: "email", values: ["jane_doe@example.com"] },
    { name: Q_KEYS.homeowner, values: ["yes_i_own_it"] },
    { name: Q_KEYS.timeline, values: ["Within 2 weeks"] },
    { name: "zip_code", values: ["78701"] },
    { name: "notes", values: ["please call me tomorrow"] },
  ],
};
const change: LeadgenChange = { leadgenId: "L1", pageId: "p1", formId: "F1", adId: "A1", createdTime: null };

function harness(over: Partial<LeadAlertDeps> = {}) {
  const claims = new Map<string, string>();
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  let n = 0;
  const deps: LeadAlertDeps = {
    appUrl: "https://www.komendly.com",
    ownerForPage: async (p) => (p === "p1" ? { workspaceId: "w1", userId: "u1", email: "owner@roofco.com", businessName: "Roof Co", userToken: "t" } : null),
    optedOut: async () => false,
    claim: async (id) => {
      if ([...claims.values()].includes(id)) return null;
      const c = `c${++n}`;
      claims.set(c, id);
      return c;
    },
    release: async (c) => { claims.delete(c); },
    getLead: async () => lead,
    unsubscribeUrl: (u) => `https://www.komendly.com/api/ads/email-unsubscribe?t=${u}`,
    send: async (m) => { sent.push(m); },
    ...over,
  };
  return { deps, claims, sent };
}

describe("lead alert", () => {
  it("emails the owner the lead's answers in plain words", async () => {
    const h = harness();
    expect(await processLeadgen(change, h.deps)).toEqual({ outcome: "sent" });
    expect(h.sent).toHaveLength(1);
    const m = h.sent[0]!;
    expect(m.to).toBe("owner@roofco.com");
    expect(m.subject).toBe("New lead from your Meta ad: Jane Doe");
    expect(m.text).toContain("Do you own the property?: Yes, I own it");
    expect(m.text).toContain("Email: jane_doe@example.com");
    expect(m.text).toContain("ZIP: 78701");
    expect(m.text).toContain("Unsubscribe: https://www.komendly.com/api/ads/email-unsubscribe");
  });

  it("is idempotent by leadgen_id: a retried webhook does not email twice", async () => {
    const h = harness();
    await processLeadgen(change, h.deps);
    expect(await processLeadgen(change, h.deps)).toEqual({ outcome: "duplicate" });
    expect(await Promise.all([processLeadgen({ ...change, leadgenId: "L2" }, h.deps), processLeadgen({ ...change, leadgenId: "L2" }, h.deps)])).toEqual(expect.arrayContaining([{ outcome: "sent" }, { outcome: "duplicate" }]));
    expect(h.sent).toHaveLength(2);
  });

  it("releases the claim when sending fails, so Meta's retry can deliver it", async () => {
    let fail = true;
    const h = harness({ send: async () => { if (fail) throw new Error("smtp down"); } });
    await expect(processLeadgen(change, h.deps)).rejects.toThrow("smtp down");
    expect(h.claims.size).toBe(0);
    fail = false;
    expect(await processLeadgen(change, h.deps)).toEqual({ outcome: "sent" });
  });

  it("skips pages that aren't ours, opted-out owners and missing unsubscribe secrets", async () => {
    expect((await processLeadgen({ ...change, pageId: "x" }, harness().deps)).outcome).toBe("not_ours");
    expect((await processLeadgen(change, harness({ optedOut: async () => true }).deps)).outcome).toBe("opted_out");
    expect((await processLeadgen(change, harness({ unsubscribeUrl: () => null }).deps)).outcome).toBe("no_unsubscribe");
  });

  it("our own wording passes the review-gate precheck (lead answers masked)", () => {
    const text = renderLifecycleText(leadAlertEmail(lead, { businessName: "Roof Co", appUrl: "https://www.komendly.com", unsubscribeUrl: "https://x/u", mask: true }));
    expect(precheck({ system: "lead_alerts", kind: "email", itemKey: "lead:L1", content: text })).toEqual([]);
    expect(text).not.toContain("Jane");
  });
});
