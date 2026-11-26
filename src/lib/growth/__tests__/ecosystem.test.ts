import { describe, expect, it } from "vitest";
import registry from "../../../../docs/growth-ecosystem/registry.json";
import {
  appendLearning, buildWeeklyReport, countBySource, decideChannel, decideCourse, formatLearning, needsYou, parseLearnings, sourceKey,
  summarizeRegistry, validateRegistry, type Opportunity, type SourceStats,
} from "../ecosystem";

const reg = registry as unknown as Opportunity[];
const row = (o: Partial<SourceStats>): SourceStats => ({ source: "x", label: "X", actions: 0, signups: 0, payments: 0, ...o });

describe("registry.json", () => {
  it("is valid and has 100 + 15 discovered", () => {
    expect(validateRegistry(reg)).toEqual([]);
    expect(reg.filter((o) => o.id > 100).length).toBeGreaterThanOrEqual(15);
  });
  it("keeps the exact original names for key items", () => {
    const n = (i: number) => reg.find((o) => o.id === i)?.name;
    expect(n(1)).toBe("Meta Ad Library prospecting");
    expect(n(77)).toBe("Automation ecosystems (n8n, Make, Zapier)");
    expect(n(100)).toBe("Ad recognition initiatives");
  });
  it("summarises and lists owner actions", () => {
    expect(summarizeRegistry(reg).overall.total).toBe(reg.length);
    expect(needsYou(reg).length).toBeGreaterThan(0);
  });
  it("flags in the registry are sys_ keys, outbound or growth review", () => {
    for (const o of reg) if (o.flag) expect(o.flag).toMatch(/^(sys_[a-z_]+|outbound)$/);
  });
});

describe("validateRegistry", () => {
  it("catches duplicates, missing ids and bad status", () => {
    const bad = [{ ...reg[0] }, { ...reg[0] }, { ...reg[1], status: "weird" }] as unknown as Opportunity[];
    const p = validateRegistry(bad).join("|");
    expect(p).toContain("duplicate id 1");
    expect(p).toContain("bad status");
    expect(p).toContain("missing #50");
  });
});

describe("course-change rules", () => {
  it("suspends at 500 actions with no sign-ups, switching the flag off when on", () => {
    const d = decideChannel(row({ actions: 500, flag: "sys_ad_watch", flagOn: true }));
    expect(d.action).toBe("suspend");
    expect(d.switchOff).toBe("sys_ad_watch");
  });
  it("does not suspend at 499, or when sign-ups exist", () => {
    expect(decideChannel(row({ actions: 499 })).action).toBe("keep");
    expect(decideChannel(row({ actions: 900, signups: 2 })).action).toBe("fix_offer");
  });
  it("recommends only (no switch) when there is no flag or it is already off", () => {
    expect(decideChannel(row({ actions: 600 })).switchOff).toBeUndefined();
    expect(decideChannel(row({ actions: 600, flag: "sys_x", flagOn: false })).switchOff).toBeUndefined();
  });
  it("turns up a channel with a payment, even with few actions", () => {
    expect(decideChannel(row({ actions: 3, signups: 1, payments: 1 })).action).toBe("turn_up");
    expect(decideChannel(row({ actions: 9000, signups: 0, payments: 1 })).action).toBe("turn_up");
  });
  it("no data and uncounted channels", () => {
    expect(decideChannel(row({ actions: 0 })).action).toBe("no_data");
    expect(decideChannel(row({ actions: null })).action).toBe("no_data");
    expect(decideChannel(row({ actions: null, signups: 4 })).action).toBe("keep");
    expect(decideCourse([row({}), row({ payments: 1 })])).toHaveLength(2);
  });
});

describe("sources", () => {
  it("classifies by kly, referral, utm, referrer, direct", () => {
    expect(sourceKey({ workspaceId: "a", klyLead: true, utmSource: "meta" })).toBe("kly");
    expect(sourceKey({ workspaceId: "a", referral: true })).toBe("referral");
    expect(sourceKey({ workspaceId: "a", utmSource: " Pinterest " })).toBe("pinterest");
    expect(sourceKey({ workspaceId: "a", referrerHost: "www.Reddit.com" })).toBe("ref:reddit.com");
    expect(sourceKey({ workspaceId: "a" })).toBe("direct");
  });
  it("counts payers per source", () => {
    const m = countBySource([{ workspaceId: "1", utmSource: "pinterest" }, { workspaceId: "2", utmSource: "pinterest" }], new Set(["2"]));
    expect(m.get("pinterest")).toEqual({ signups: 2, payments: 1 });
  });
});

describe("weekly report", () => {
  it("is plain and lists actions and needs", () => {
    const r = buildWeeklyReport({
      decisions: [decideChannel(row({ label: "Kly", actions: 700 }))], overall: summarizeRegistry(reg).overall,
      needs: [{ id: 79, name: "Browser", owner_action: "Pay $5" }], payingCustomers: 0, signups7d: 12, now: new Date("2026-11-30T14:30:00Z"),
    }, "https://x/admin/ads/growth");
  expect(r.subject).toBe("Growth ecosystem: 0/10 paying, 1 to act on");
    expect(r.text).toContain("Kly: 700 actions and no sign-ups");
    expect(r.text).toContain("#79 Browser: Pay $5");
    expect(r.text).not.toMatch(/guarantee|will earn/i);
  });
});

describe("learnings log", () => {
  const e = { date: "2026-11-26", kind: "evidence" as const, title: "T", note: "N\nmore", source: "file.md", opportunityIds: [1, 2] };
  it("formats and round-trips", () => {
    expect(formatLearning(e)).toContain("## 2026-11-26 [EVIDENCE] T (#1, #2)");
    expect(parseLearnings(appendLearning("# h\n", e))[0]).toMatchObject({ date: "2026-11-26", kind: "EVIDENCE", title: "T (#1, #2)" });
  });
  it("is append-only: existing text stays a prefix", () => {
    const before = "# h\n\n## 2026-01-01 [ASSUMPTION] a\n\nb\n";
    expect(appendLearning(before, e).startsWith(before)).toBe(true);
  });
  it("requires a source for evidence and valid dates", () => {
    expect(() => formatLearning({ ...e, source: "" })).toThrow();
    expect(() => formatLearning({ ...e, date: "26/11" })).toThrow();
    expect(() => formatLearning({ ...e, kind: "assumption", source: undefined })).not.toThrow();
  });
});
