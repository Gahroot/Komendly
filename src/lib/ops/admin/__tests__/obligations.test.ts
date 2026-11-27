import { describe, expect, it } from "vitest";
import { OBLIGATIONS } from "../data";
import { digestSection, evaluate, evaluateAll, parseObligations, type Obligation } from "../obligations";

const now = new Date("2026-11-26T12:00:00Z");
const ob = (o: Partial<Obligation>): Obligation => ({ id: "x", title: "X", category: "c", owner: "owner", recurrence: "once", dueDate: null, lastDone: null, needsProfessional: false, ...o });
const ctx = { hasRevenue: true };

describe("obligation due logic", () => {
  it("unknown date is unscheduled, never invented", () => expect(evaluate(ob({}), now, ctx).state).toBe("unscheduled"));
  it("overdue / due soon / upcoming", () => {
    expect(evaluate(ob({ dueDate: "2026-11-20" }), now, ctx).state).toBe("overdue");
    expect(evaluate(ob({ dueDate: "2026-12-09" }), now, ctx)).toMatchObject({ state: "due_soon", daysUntil: 13 });
    expect(evaluate(ob({ dueDate: "2027-03-01" }), now, ctx).state).toBe("upcoming");
  });
  it("one-off done once lastDone >= dueDate", () => expect(evaluate(ob({ dueDate: "2026-11-20", lastDone: "2026-11-21" }), now, ctx).state).toBe("done"));
  it("recurring rolls forward from lastDone", () => {
    const e = evaluate(ob({ recurrence: "quarterly", dueDate: "2026-01-01", lastDone: "2026-10-15" }), now, ctx);
    expect(e.due).toBe("2027-01-15");
    expect(e.state).toBe("upcoming");
  });
  it("revenue-triggered items wait until there is revenue", () => {
    expect(evaluate(ob({ trigger: "revenue", dueDate: "2026-11-01" }), now, { hasRevenue: false }).state).toBe("waiting");
    expect(evaluate(ob({ trigger: "revenue", dueDate: "2026-11-01" }), now, ctx).state).toBe("overdue");
  });
  it("RDAP-style overrides supply a due date", () => expect(evaluate(ob({ id: "d", recurrence: "annual" }), now, { hasRevenue: true, overrides: { d: "2026-12-01" } }).state).toBe("due_soon"));
  it("parser drops junk and bad dates", () => {
    const p = parseObligations({ items: [{ id: "a", title: "A", dueDate: "nope", recurrence: "weird", owner: "x" }, { nope: 1 }, null] });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ dueDate: null, recurrence: "once", owner: "owner" });
  });
});

describe("digest", () => {
  it("lists only overdue + next-30-day items, flags professionals", () => {
    const list = evaluateAll([ob({ id: "1", title: "Late", dueDate: "2026-11-01" }), ob({ id: "2", title: "Soon", dueDate: "2026-12-10", needsProfessional: true }), ob({ id: "3", title: "Far", dueDate: "2027-06-01" }), ob({ id: "4", title: "Unknown" })], now, ctx);
    const d = digestSection(list)!;
    expect(d.count).toBe(2);
    expect(d.text).toContain("OVERDUE Late");
    expect(d.text).toContain("needs a professional");
    expect(d.text).not.toContain("Far");
    expect(d.text).not.toContain("Unknown");
  });
  it("returns null when nothing is due", () => expect(digestSection(evaluateAll([ob({ dueDate: "2027-06-01" })], now, ctx))).toBeNull());
});

describe("seeded registry", () => {
  it("loads, has unique ids, flags professionals, only Meta review has a date", () => {
    expect(OBLIGATIONS.length).toBeGreaterThan(15);
    expect(new Set(OBLIGATIONS.map((o) => o.id)).size).toBe(OBLIGATIONS.length);
    expect(OBLIGATIONS.filter((o) => o.needsProfessional).map((o) => o.id)).toEqual(expect.arrayContaining(["sales-tax-nexus", "trademark", "llc-annual-report"]));
    expect(OBLIGATIONS.filter((o) => o.dueDate).map((o) => o.id)).toEqual(["meta-app-review"]);
  });
});
