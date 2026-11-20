// Hard rule: cold email goes only to addresses our own checker marked "valid"; with checking off, nothing is sent.
import { afterEach, describe, expect, it } from "vitest";
import { assignLeads, isSendableCheck } from "../src/sender";
import { fakeDb } from "./fakes";

const now = new Date("2026-11-17T15:00:00Z"); // Tuesday 10:00 ET
const lead = (id: string, emailCheck: string | null, extra: Record<string, unknown> = {}) => ({
  id, emailCheck, email: `${id}@${id}.com`, domain: `${id}.com`, status: "ad_made", step: 0, mailboxId: null, system: null,
  timezone: "America/New_York", repliedAt: null, clickedAt: null, lastSentAt: null, voiceStatus: null, ...extra,
});
const LEADS = [lead("cc", "catch_all"), lead("un", "unknown"), lead("nu", null), lead("inv", "invalid"), lead("rt", "retry"), lead("ok", "valid"),
  // a follow-up due on an address that was never verified must not go out either
  lead("fu", "catch_all", { status: "sent", step: 1, mailboxId: "m1", lastSentAt: new Date("2026-11-01T15:00:00Z") })];

afterEach(() => {
  delete process.env.KLY_VERIFY_EMAILS;
});

describe("verified-only sending", () => {
  it("assigns only checker-valid leads, even if the query returned others", async () => {
    const wheres: unknown[] = [];
    const f = fakeDb({ outboundLead: { findMany: (a) => (wheres.push((a as { where: unknown }).where), LEADS) } });
    const plan = await assignLeads(f.db, ["m1", "m2", "m3", "m4", "m5", "m6", "m7"], now, 4, 2);
    const assigned = [...plan.values()].map((p) => p.lead.id);
    expect(assigned).toEqual(["ok"]);
    for (const w of wheres) expect((w as { emailCheck?: unknown }).emailCheck).toBe("valid");
  });

  it("sends nothing at all when the checker is switched off (KLY_VERIFY_EMAILS=off)", async () => {
    process.env.KLY_VERIFY_EMAILS = "off";
    const f = fakeDb({ outboundLead: { findMany: () => LEADS } });
    const plan = await assignLeads(f.db, ["m1", "m2"], now, 4, 2);
    expect(plan.size).toBe(0);
    expect(f.of("outboundLead", "findMany")).toHaveLength(0);
    expect(isSendableCheck("valid")).toBe(false);
  });

  it("only 'valid' is sendable", () => {
    expect(isSendableCheck("valid")).toBe(true);
    for (const c of ["catch_all", "unknown", "invalid", "retry", null, undefined]) expect(isSendableCheck(c)).toBe(false);
  });
});
