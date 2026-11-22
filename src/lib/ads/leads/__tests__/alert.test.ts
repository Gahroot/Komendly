import { describe, expect, it } from "vitest";
import { precheck } from "../../../growth/review-gate";
import { renderLifecycleText } from "../../lifecycle/template";
import { TEAM_EVENTS } from "../../team/contracts";
import { extractLeadContact, leadAlertEmail, leadSummary, processLeadgen, type LeadAlertDeps, type LeadOwner, type MetaLead, type NewLeadRow } from "../alert";
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

type Row = NewLeadRow & { id: string; notifiedAt: Date | null };

function harness(over: Partial<LeadAlertDeps> = {}, owner: Partial<LeadOwner> = {}) {
  const rows = new Map<string, Row>();
  const actions = new Map<string, { workspaceId: string; summary: string }>();
  const events: Array<{ name: string; workspaceId: string; leadgenId: string }> = [];
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  let n = 0;
  const deps: LeadAlertDeps = {
    appUrl: "https://www.komendly.com",
    ownerForPage: async (p) => (p === "p1" ? { workspaceId: "w1", userId: "u1", email: "owner@roofco.com", businessName: "Roof Co", userToken: "t", mandate: false, ...owner } : null),
    findLead: async (id) => rows.get(id) ?? null,
    storeLead: async (r) => {
      await Promise.resolve();
      if (rows.has(r.leadgenId)) return null; // unique leadgenId
      const row = { ...r, id: `m${++n}`, notifiedAt: null };
      rows.set(r.leadgenId, row);
      return row;
    },
    claimNotify: async (id) => {
      const row = [...rows.values()].find((r) => r.id === id);
      if (!row || row.notifiedAt) return false;
      row.notifiedAt = new Date();
      return true;
    },
    releaseNotify: async (id) => { const row = [...rows.values()].find((r) => r.id === id); if (row) row.notifiedAt = null; },
    recordTeamLead: async ({ workspaceId, leadgenId, summary }) => {
      if (!actions.has(`lead:${leadgenId}`)) actions.set(`lead:${leadgenId}`, { workspaceId, summary });
      if (!events.some((e) => e.workspaceId === workspaceId)) events.push({ name: TEAM_EVENTS.firstLead, workspaceId, leadgenId });
    },
    optedOut: async () => false,
    getLead: async (_o, c) => ({ ...lead, id: c.leadgenId }),
    unsubscribeUrl: (u) => `https://www.komendly.com/api/ads/email-unsubscribe?t=${u}`,
    send: async (m) => { sent.push(m); },
    ...over,
  };
  return { deps, rows, actions, events, sent };
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

  it("keeps the stored lead when the email fails and the retry sends it without a second row", async () => {
    let fail = true;
    const h = harness({ send: async (m) => { if (fail) throw new Error("smtp down"); h.sent.push(m); } });
    await expect(processLeadgen(change, h.deps)).rejects.toThrow("smtp down");
    expect(h.rows.size).toBe(1);
    expect(h.rows.get("L1")!.notifiedAt).toBeNull();
    fail = false;
    expect(await processLeadgen(change, h.deps)).toEqual({ outcome: "sent" });
    expect(h.rows.size).toBe(1);
    expect(h.rows.get("L1")!.notifiedAt).toBeInstanceOf(Date);
    expect(h.sent).toHaveLength(1);
    expect(await processLeadgen(change, h.deps)).toEqual({ outcome: "duplicate" });
    expect(h.sent).toHaveLength(1);
  });

  it("stores the lead once with its contact fields, before emailing", async () => {
    const order: string[] = [];
    const h = harness();
    const store = h.deps.storeLead;
    h.deps.storeLead = async (r) => { order.push("store"); return store(r); };
    h.deps.send = async () => { order.push("send"); };
    await processLeadgen({ ...change, createdTime: 1_763_733_780 }, h.deps);
    await processLeadgen({ ...change, createdTime: 1_763_733_780 }, h.deps);
    expect(order).toEqual(["store", "send"]);
    const row = h.rows.get("L1")!;
    expect(row).toMatchObject({ workspaceId: "w1", leadgenId: "L1", metaAdId: "A1", formId: "F1", pageId: "p1", name: "Jane Doe", email: "jane_doe@example.com", phone: null, zip: "78701" });
    expect(row.receivedAt.toISOString()).toBe("2025-11-21T14:03:00.000Z");
    expect(row.answers).toContainEqual({ label: "Do you own the property?", text: "Yes, I own it" });
  });

  it("routes a mandate page's lead to mandate.leadEmail and records team activity + first-lead event once", async () => {
    const h = harness({}, { email: "leads@roofco.com", mandate: true });
    await processLeadgen(change, h.deps);
    await processLeadgen(change, h.deps);
    await processLeadgen({ ...change, leadgenId: "L2" }, h.deps);
    expect(h.sent.map((m) => m.to)).toEqual(["leads@roofco.com", "leads@roofco.com"]);
    expect(h.actions.get("lead:L1")).toEqual({ workspaceId: "w1", summary: "New lead: Jane from 78701" });
    expect(h.actions.size).toBe(2);
    expect(h.events).toEqual([{ name: "team_first_lead", workspaceId: "w1", leadgenId: "L1" }]);
  });

  it("does not record team activity for non-mandate (connection) pages, and a failed activity write doesn't block the email", async () => {
    const h = harness();
    await processLeadgen(change, h.deps);
    expect(h.actions.size).toBe(0);
    const h2 = harness({ recordTeamLead: async () => { throw new Error("db"); } }, { mandate: true });
    expect(await processLeadgen(change, h2.deps)).toEqual({ outcome: "sent" });
  });

  it("extracts contact fields and builds the activity line", () => {
    const c = extractLeadContact({ id: "x", createdTime: null, adName: null, fields: [{ name: "first_name", values: ["Ann"] }, { name: "last_name", values: ["Lee"] }, { name: "phone_number", values: [" +15551234 "] }, { name: "post_code", values: ["94110"] }, { name: "email", values: ["A@B.CO"] }] });
    expect(c).toMatchObject({ name: "Ann Lee", phone: "+15551234", zip: "94110", email: "a@b.co" });
    expect(leadSummary(c)).toBe("New lead: Ann from 94110");
    expect(leadSummary({ name: null, zip: null })).toBe("New lead: someone");
  });

  it("stores but does not email opted-out owners", async () => {
    const h = harness({ optedOut: async () => true });
    expect((await processLeadgen(change, h.deps)).outcome).toBe("opted_out");
    expect(h.rows.size).toBe(1);
    expect(h.sent).toHaveLength(0);
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
