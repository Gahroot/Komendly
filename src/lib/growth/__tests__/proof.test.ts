import { describe, expect, it } from "vitest";
import {
  breachAlert, buildCaseStudies, cancelSaveDue, firstWinDue, firstWinNote, guaranteeBreach, journey, latestConsents, measureWindow, nudgeDue, nudgeNote,
  proofDayDue, proofWindow, resultsNote, signConsent, verifyConsent, RESULTS_EMPTY, type ConsentRow, type Measured, type ReportSnapshot,
} from "../proof";

const D = 86_400_000;
const T0 = new Date("2026-11-01T10:00:00Z");
const at = (d: number) => new Date(T0.getTime() + d * D);
const j0 = { paidAt: T0, metaAt: null, budgetAt: null, liveAt: null };

describe("journey", () => {
  it("states only what data shows", () => {
    const j = journey({ ...j0, now: at(2.5) });
    expect(j.steps.map((s) => s.done)).toEqual([true, false, false, false]);
    expect(j.day).toBe(3);
    expect(j.need).toMatch(/Connect your Meta/);
    expect(j.overdue).toBe(false);
  });
  it("overdue after 7 days, done when live", () => {
    expect(journey({ ...j0, metaAt: at(1), budgetAt: at(2), now: at(8) }).overdue).toBe(true);
    const done = journey({ paidAt: T0, metaAt: at(1), budgetAt: at(2), liveAt: at(4), now: at(9) });
    expect(done.done).toBe(true);
    expect(done.overdue).toBe(false);
    expect(done.need).toBeNull();
  });
  it("surfaces a blocker only after budget", () => {
    expect(journey({ ...j0, metaAt: at(1), budgetAt: at(2), blockedReason: "Add a payment method in Meta.", now: at(3) }).need).toBe("Add a payment method in Meta.");
  });
});

describe("nudges", () => {
  it("24h then 72h for Meta, 72h for budget; max 3, one per step", () => {
    expect(nudgeDue(j0, [], at(0.5))).toBeNull();
    expect(nudgeDue(j0, [], at(1))).toBe("meta_24h");
    expect(nudgeDue(j0, ["meta_24h"], at(2))).toBeNull();
    expect(nudgeDue(j0, ["meta_24h"], at(3))).toBe("meta_72h");
    expect(nudgeDue({ ...j0, metaAt: at(1) }, ["meta_24h", "meta_72h"], at(3))).toBe("budget_72h");
    expect(nudgeDue({ ...j0, metaAt: at(1) }, ["a", "b", "c"], at(9))).toBeNull();
  });
  it("no nudge when live or not paid; copy has opt-out and no promises", () => {
    expect(nudgeDue({ ...j0, liveAt: at(2) }, [], at(5))).toBeNull();
    expect(nudgeDue({ ...j0, paidAt: null }, [], at(5))).toBeNull();
    const n = nudgeNote("meta_24h", { firstName: "Sam", teamUrl: "https://x/t", unsubscribeUrl: "https://x/u" });
    expect(n.text).toContain("Unsubscribe: https://x/u");
    expect(n.text).toContain("Hi Sam,");
  });
});

describe("first wins", () => {
  it("lead wins over live; only recent; once", () => {
    expect(firstWinDue({ liveAt: at(1), firstLeadAt: null, sent: [], now: at(2) })).toBe("ads_live");
    expect(firstWinDue({ liveAt: at(1), firstLeadAt: at(2), sent: [], now: at(3) })).toBe("first_lead");
    expect(firstWinDue({ liveAt: at(1), firstLeadAt: at(2), sent: ["first_lead"], now: at(3) })).toBeNull();
    expect(firstWinDue({ liveAt: at(1), firstLeadAt: null, sent: ["first_lead"], now: at(3) })).toBeNull();
    expect(firstWinDue({ liveAt: at(1), firstLeadAt: null, sent: [], now: at(30) })).toBeNull();
  });
  it("adds the referral line only when a link exists", () => {
    const base = { firstName: null, businessName: "Ace Plumbing", teamUrl: "t", unsubscribeUrl: "u" };
    expect(firstWinNote("first_lead", { ...base, referralUrl: "https://www.komendly.com/r/ace" }).text).toContain("referral link: https://www.komendly.com/r/ace");
    expect(firstWinNote("ads_live", { ...base, referralUrl: null }).text).not.toContain("referral");
  });
});

describe("measured results", () => {
  const days = (n: number, leadsPer: number) => Array.from({ length: n }, (_, i) => ({ day: new Date(T0.getTime() + i * D).toISOString().slice(0, 10), spendMinor: 1000, leads: leadsPer }));
  it("too early with thin evidence; no cost per lead", () => {
    const m = measureWindow({ from: "2026-11-01", to: "2026-11-14", currency: "USD", days: days(3, 1), leadsReceived: 3 });
    expect(m.tooEarly).toBe(true);
    expect(m.costPerLeadMinor).toBeNull();
    const text = resultsNote(14, m, { firstName: null, teamUrl: "t", links: { yes: "Y", no: "N" }, referralUrl: null, unsubscribeUrl: "u" }).text;
    expect(text).toContain("too early to tell");
  });
  it("enough evidence: measured numbers, cost per lead from stored rows only", () => {
    const m = measureWindow({ from: "2026-11-01", to: "2026-11-14", currency: "USD", days: days(14, 1), leadsReceived: 13 });
    expect(m).toMatchObject({ spendMinor: 14000, leadsMeta: 14, dataDays: 14, tooEarly: false, costPerLeadMinor: 1000 });
    const text = resultsNote(14, m, { firstName: "Al", teamUrl: "t", links: { yes: "https://y", no: "https://n" }, referralUrl: "https://r", unsubscribeUrl: "u" }).text;
    expect(text).toContain("$140");
    expect(text).toContain("measured");
    expect(text).toContain("May we use your results (and your business name) as a case study?");
    expect(text).toContain("https://y");
    expect(text).toContain("https://r");
  });
  it("ignores days outside the window; no data says so", () => {
    const m = measureWindow({ from: "2026-12-01", to: "2026-12-14", currency: "USD", days: days(5, 2), leadsReceived: 0 });
    expect(m.dataDays).toBe(0);
    expect(resultsNote(30, m, { firstName: null, teamUrl: "t", links: { yes: "Y", no: "N" }, referralUrl: "https://r", unsubscribeUrl: "u" }).text).not.toContain("https://r");
  });
  it("day 14 / 30 timing relative to ads live", () => {
    expect(proofDayDue({ liveAt: T0, sentDays: [], now: at(13) })).toBeNull();
    expect(proofDayDue({ liveAt: T0, sentDays: [], now: at(14) })).toBe(14);
    expect(proofDayDue({ liveAt: T0, sentDays: [14], now: at(20) })).toBeNull();
    expect(proofDayDue({ liveAt: T0, sentDays: [14], now: at(30) })).toBe(30);
    expect(proofDayDue({ liveAt: T0, sentDays: [], now: at(90) })).toBeNull();
    expect(proofDayDue({ liveAt: null, sentDays: [], now: at(20) })).toBeNull();
    expect(proofWindow(T0, at(14))).toEqual({ from: "2026-11-01", to: "2026-11-14" });
  });
});

describe("consent token", () => {
  it("round-trips, rejects tampering and expiry", () => {
    const e = Math.floor(at(10).getTime() / 1000);
    const t = signConsent({ u: "u1", w: "w1", a: "yes", k: "k1", e }, "s3cret");
    expect(verifyConsent(t, "s3cret", T0)).toMatchObject({ a: "yes", w: "w1" });
    expect(verifyConsent(t, "other", T0)).toBeNull();
    expect(verifyConsent(t, "s3cret", at(11))).toBeNull();
    expect(verifyConsent(`${t}x`, "s3cret", T0)).toBeNull();
    expect(verifyConsent(t, "", T0)).toBeNull();
  });
});

describe("case studies", () => {
  const m = (tooEarly: boolean): Measured => ({ from: "a", to: "b", currency: "USD", spendMinor: 100, leadsMeta: 5, leadsReceived: 5, costPerLeadMinor: 20, dataDays: 14, tooEarly });
  const rep = (id: string, ws: string, tooEarly = false): ReportSnapshot => ({ id, workspaceId: ws, day: 14, businessName: "Ace", createdAt: T0, measured: m(tooEarly) });
  const c = (ws: string, answer: "yes" | "no", key: string, d: number): ConsentRow => ({ workspaceId: ws, answer, key, at: at(d) });
  it("empty without consent: nothing is invented", () => {
    expect(buildCaseStudies([], [rep("r1", "w1")])).toEqual([]);
    expect(RESULTS_EMPTY).toContain("will appear here as they're measured");
  });
  it("only yes, latest answer wins, snapshot must match workspace", () => {
    expect(buildCaseStudies([c("w1", "yes", "r1", 1)], [rep("r1", "w1")])).toHaveLength(1);
    expect(buildCaseStudies([c("w1", "yes", "r1", 1), c("w1", "no", "r1", 2)], [rep("r1", "w1")])).toEqual([]);
    expect(latestConsents([c("w1", "no", "r1", 1), c("w1", "yes", "r1", 2)])[0].answer).toBe("yes");
    expect(buildCaseStudies([c("w2", "yes", "r1", 1)], [rep("r1", "w1")])).toEqual([]);
  });
  it("too-early snapshots are not public but visible to admin", () => {
    expect(buildCaseStudies([c("w1", "yes", "r1", 1)], [rep("r1", "w1", true)])).toEqual([]);
    expect(buildCaseStudies([c("w1", "yes", "r1", 1)], [rep("r1", "w1", true)], { includeTooEarly: true })).toHaveLength(1);
  });
});

describe("cancel save", () => {
  const base = { openedAt: T0, now: new Date(T0.getTime() + 30 * 60_000), plan: "autopilot", active: true, recentPaymentFailure: false, sentWithinDays: false };
  it("within an hour-ish window, once, honest plans only", () => {
    expect(cancelSaveDue(base)).toBe(true);
    expect(cancelSaveDue({ ...base, now: new Date(T0.getTime() + 5 * 60_000) })).toBe(false);
    expect(cancelSaveDue({ ...base, now: at(1) })).toBe(false);
    expect(cancelSaveDue({ ...base, sentWithinDays: true })).toBe(false);
    expect(cancelSaveDue({ ...base, recentPaymentFailure: true })).toBe(false);
    expect(cancelSaveDue({ ...base, plan: "starter" })).toBe(false);
    expect(cancelSaveDue({ ...base, plan: "ad_department" })).toBe(true);
  });
});

describe("guarantee", () => {
  it("flags only paid >7 days with no live ads, with the cause", () => {
    expect(guaranteeBreach({ ...j0, now: at(7) })).toBeNull();
    expect(guaranteeBreach({ ...j0, now: at(9) })).toMatchObject({ cause: "meta_not_connected", daysLate: 2 });
    expect(guaranteeBreach({ ...j0, metaAt: at(1), now: at(9) })?.cause).toBe("budget_not_set");
    expect(guaranteeBreach({ ...j0, metaAt: at(1), budgetAt: at(2), now: at(9) })?.cause).toBe("not_live");
    expect(guaranteeBreach({ ...j0, liveAt: at(3), now: at(30) })).toBeNull();
    expect(guaranteeBreach({ ...j0, paidAt: null, now: at(30) })).toBeNull();
  });
  it("alert says nothing is auto-refunded", () => {
    const b = guaranteeBreach({ ...j0, now: at(9) })!;
    expect(breachAlert({ workspaceId: "w1", businessName: "Ace", ownerEmail: "a@b.c", breach: b, adminUrl: "u" }).text).toContain("nothing is refunded automatically");
  });
});
