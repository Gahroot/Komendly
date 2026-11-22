import { describe, expect, it } from "vitest";
import { isLeadExpired, leadRetentionCutoff, purgeOldLeads, PURGED_LEAD_SUMMARY, type LeadRetentionDb } from "../retention";

type Lead = { id: string; leadgenId: string; receivedAt: Date; deletedAt: Date | null; name: string | null; email: string | null; phone: string | null; zip: string | null; answers: unknown };
const now = new Date("2026-11-22T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

function fakeDb(leads: Lead[], actions: Array<{ dedupeKey: string; summary: string }>): LeadRetentionDb {
  type W = { receivedAt?: { lt: Date }; deletedAt?: { not: null }; OR?: unknown[]; id?: { in: string[] } };
  const match = (l: Lead, w: W) =>
    (!w.receivedAt || l.receivedAt < w.receivedAt.lt) &&
    (!w.deletedAt || l.deletedAt !== null) &&
    (!w.OR || [l.name, l.email, l.phone, l.zip].some((v) => v !== null)) &&
    (!w.id || w.id.in.includes(l.id));
  return {
    metaLead: {
      findMany: async ({ where, take }) => leads.filter((l) => match(l, where as W)).slice(0, take).map((l) => ({ id: l.id, leadgenId: l.leadgenId })),
      deleteMany: async ({ where }) => {
        const gone = leads.filter((l) => match(l, where as W));
        for (const g of gone) leads.splice(leads.indexOf(g), 1);
        return { count: gone.length };
      },
      updateMany: async ({ where, data }) => {
        const hit = leads.filter((l) => match(l, where as W));
        for (const l of hit) Object.assign(l, data);
        return { count: hit.length };
      },
    },
    marketingAction: {
      updateMany: async ({ where, data }) => {
        const keys = (where as { dedupeKey: { in: string[] } }).dedupeKey.in;
        const hit = actions.filter((a) => keys.includes(a.dedupeKey));
        for (const a of hit) Object.assign(a, data);
        return { count: hit.length };
      },
    },
  };
}

const lead = (id: string, age: number, deleted = false): Lead => ({ id, leadgenId: `g${id}`, receivedAt: daysAgo(age), deletedAt: deleted ? daysAgo(1) : null, name: "Jane", email: "j@x.co", phone: null, zip: "94110", answers: [{ label: "ZIP", text: "94110" }] });

describe("lead retention", () => {
  it("cutoff is 180 days", () => {
    expect(leadRetentionCutoff(now).toISOString()).toBe("2026-05-26T12:00:00.000Z");
    expect(isLeadExpired(daysAgo(181), now)).toBe(true);
    expect(isLeadExpired(daysAgo(179), now)).toBe(false);
  });

  it("hard-deletes leads older than 180 days, clears PII of soft-deleted ones, scrubs their activity lines; idempotent", async () => {
    const leads = [lead("old", 200), lead("old2", 181), lead("new", 10), lead("del", 5, true)];
    const actions = [{ dedupeKey: "lead:gold", summary: "New lead: Jane from 94110" }, { dedupeKey: "lead:gdel", summary: "New lead: Jane from 94110" }, { dedupeKey: "lead:gnew", summary: "New lead: Jane from 94110" }];
    const db = fakeDb(leads, actions);
    expect(await purgeOldLeads(now, db, { batch: 1 })).toEqual({ deleted: 2, scrubbed: 1 });
    expect(leads.map((l) => l.id)).toEqual(["new", "del"]);
    expect(leads[1]).toMatchObject({ name: null, email: null, phone: null, zip: null, answers: [] });
    expect(leads[0]!.name).toBe("Jane");
    expect(actions.map((a) => a.summary)).toEqual([PURGED_LEAD_SUMMARY, PURGED_LEAD_SUMMARY, "New lead: Jane from 94110"]);
    expect(await purgeOldLeads(now, db)).toEqual({ deleted: 0, scrubbed: 0 });
  });
});
