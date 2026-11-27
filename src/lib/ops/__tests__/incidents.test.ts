import { describe, expect, it } from "vitest";
import { classifySeverity, containmentAllowed, fromDomains, fromFunnelCheck, fromHeartbeats, fromPayments, fromSupport, fromSystems, reconcile, reviewIncidents, type IncidentRec, type Signal, type SignalType } from "../incidents";
import { dbSignals, evalExpiry, expirySignals, expiringSoon, parseRdapExpiry, weeklyExpiryEmail } from "../infra";

const now = new Date("2026-11-26T12:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * 60_000);
const ev = (...t: SignalType[]) => new Set<SignalType>(t);
const sig = (o: Partial<Signal> = {}): Signal => ({ key: "k", type: "funnel", severity: "P2", title: "t", detail: "d", ...o });
const rec = (o: Partial<IncidentRec> = {}): IncidentRec => ({ eventId: "e1", incidentId: "inc1", key: "k", type: "funnel", severity: "P2", title: "t", status: "open", detectedAt: ago(60).toISOString(), lastSeenAt: ago(60).toISOString(), signals: [], containment: [], resolvedAt: null, rootCause: null, correctiveAction: null, recurrence: 0, escalatedAt: null, ...o });
const run = (o: Partial<Parameters<typeof reconcile>[0]>) => reconcile({ now, open: [], resolvedRecent: [], signals: [], evaluated: ev("funnel"), ...o });

describe("severity", () => {
  it("P1 for money, security or everyone; P2 some; P3 else", () => {
    expect(classifySeverity({ customers: "none", financial: true })).toBe("P1");
    expect(classifySeverity({ customers: "none", security: true })).toBe("P1");
    expect(classifySeverity({ customers: "all" })).toBe("P1");
    expect(classifySeverity({ customers: "some" })).toBe("P2");
    expect(classifySeverity({ customers: "none" })).toBe("P3");
  });
});

describe("reconcile", () => {
  it("opens one incident per key and dedupes repeats", () => {
    const p = run({ signals: [sig(), sig()] });
    expect(p.create).toHaveLength(1); // same key in one batch = one incident
    const p2 = run({ open: [rec()], signals: [sig({ detail: "new detail" })] });
    expect(p2.create).toHaveLength(0);
    expect(p2.update[0].rec.signals.at(-1)?.detail).toBe("new detail");
  });
  it("counts recurrence from recently resolved incidents", () => {
    const p = run({ signals: [sig()], resolvedRecent: [rec({ status: "resolved", detectedAt: ago(60 * 24 * 3).toISOString() }), rec({ status: "resolved", detectedAt: ago(60 * 24 * 90).toISOString() })] });
    expect(p.create[0].recurrence).toBe(1);
  });
  it("closes only after a clean window and only when the source was evaluated", () => {
    expect(run({ open: [rec({ lastSeenAt: ago(5).toISOString() })] }).update).toHaveLength(0);
    expect(run({ open: [rec()], evaluated: ev("payment") }).update).toHaveLength(0);
    const closed = run({ open: [rec()] }).update[0].rec;
    expect(closed.status).toBe("resolved");
    expect(closed.resolvedAt).toBeTruthy();
    expect(closed.rootCause).toContain("Cleared");
  });
  it("contains with allow-listed actions, once, and escalates P1 once", () => {
    const s = sig({ severity: "P1", containment: [{ kind: "maintenance_on" }] });
    const p = run({ signals: [s] });
    expect(p.contain).toHaveLength(1);
    expect(p.escalate).toHaveLength(1);
    expect(p.create[0].status).toBe("contained");
    const again = run({ open: [p.create[0]], signals: [s] });
    expect(again.contain).toHaveLength(0);
    expect(again.escalate).toHaveLength(0);
  });
  it("refuses out-of-bounds containment and escalates instead", () => {
    const p = run({ signals: [sig({ containment: [{ kind: "flag_off", key: "sys_incidents" }] })] });
    expect(p.contain).toHaveLength(0);
    expect(p.refused).toHaveLength(1);
    expect(p.escalate[0].reason).toContain("not allowed");
  });
  it("P2/P3 without containment never emails the owner", () => expect(run({ signals: [sig({ severity: "P3" })] }).escalate).toHaveLength(0));
  it("caps containment per tick", () => {
    const sigs = [1, 2, 3, 4, 5].map((i) => sig({ key: `k${i}`, containment: [{ kind: "pause_domain", domain: `d${i}.com` }] }));
    expect(run({ signals: sigs }).contain).toHaveLength(3);
  });
  it("undoes the maintenance banner when its incident closes", () => {
    const p = run({ open: [rec({ containment: [{ action: "maintenance_on", at: "x", ok: true }], status: "contained" })] });
    expect(p.undo).toHaveLength(1);
  });
});

describe("allow-list", () => {
  it("only reversible, non-protected actions", () => {
    expect(containmentAllowed({ kind: "flag_off", key: "sys_winback" })).toBe(true);
    expect(containmentAllowed({ kind: "flag_off", key: "sys_incidents" })).toBe(false);
    expect(containmentAllowed({ kind: "flag_off", key: "meta_publish" })).toBe(false);
    expect(containmentAllowed({ kind: "flag_off", key: "sys_nonexistent" })).toBe(false);
    expect(containmentAllowed({ kind: "pause_domain", domain: "a.com" })).toBe(true);
    expect(containmentAllowed({ kind: "pause_domain", domain: "a.com; drop" })).toBe(false);
  });
});

describe("signal builders", () => {
  it("funnel: money failures are P1, pages P2", () => {
    const s = fromFunnelCheck({ ok: false, failures: [{ name: "stripe price autopilot", detail: "x" }, { name: "page /pricing", detail: "404" }] });
    expect(s.map((x) => x.severity)).toEqual(["P1", "P2"]);
    expect(fromFunnelCheck({ ok: true, failures: [] })).toEqual([]);
  });
  it("heartbeats: engine stale = P1 + maintenance after 15 min", () => {
    const s = fromHeartbeats({ engineWorkerAt: ago(20), klyAt: ago(1), codex: { ok: true, message: null, updatedAt: ago(1) } }, now);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ key: "heartbeat:engine", severity: "P1" });
    expect(s[0].containment).toEqual([{ kind: "maintenance_on" }]);
    expect(fromHeartbeats({ engineWorkerAt: ago(1), klyAt: ago(30), codex: { ok: false, message: "auth", updatedAt: ago(1) } }, now).map((x) => x.key).sort()).toEqual(["heartbeat:kly", "provider:codex"]);
  });
  it("domains: blocklist -> pause (once), governor pause -> P3 note", () => {
    const s = fromDomains([{ domain: "a.com", paused: false, pausedReason: null, listedOn: ["dbl"], failStreak: 0 }, { domain: "b.com", paused: true, pausedReason: "auto: bounces", listedOn: [], failStreak: 0 }, { domain: "c.com", paused: true, pausedReason: "auto: x", listedOn: ["dbl"], failStreak: 0 }]);
    expect(s[0].containment).toEqual([{ kind: "pause_domain", domain: "a.com" }]);
    expect(s[1].severity).toBe("P3");
    expect(s[2].containment).toEqual([]);
  });
  it("domains: a retired (replaced) listed domain raises no incident", () => {
    const s = fromDomains([{ domain: "old.com", paused: true, pausedReason: "retired: Spamhaus DBL-listed look-alike, replaced (Nov 16)", listedOn: ["dbl"], failStreak: 0 }, { domain: "live.com", paused: true, pausedReason: "auto: listed on Spamhaus DBL", listedOn: ["dbl"], failStreak: 0 }]);
    expect(s.map((x) => x.key)).toEqual(["deliverability:blocklist:live.com"]);
  });
  it("payments and webhooks", () => {
    expect(fromPayments(2, [])).toEqual([]);
    expect(fromPayments(3, [{ provider: "stripe", n: 2 }]).map((x) => x.severity)).toEqual(["P1", "P1"]);
    expect(fromPayments(0, [{ provider: "resend", n: 1 }])[0].severity).toBe("P2");
  });
  it("failing email system is switched off only when stuck", () => {
    const beat = (runs: number, lastOkAt: string | null) => ({ firstRunAt: null, lastRunAt: null, lastOkAt, lastOutputAt: null, runs, outputs: 0, lastError: "smtp", alertedAt: null, alertReason: null });
    const one = (b: ReturnType<typeof beat>) => fromSystems([{ key: "winback", enabled: true, health: "failing", beat: b }], now)[0];
    expect(one(beat(1, null)).containment).toEqual([]);
    expect(one(beat(5, ago(120).toISOString())).containment).toEqual([{ kind: "flag_off", key: "sys_winback" }]);
    expect(fromSystems([{ key: "winback", enabled: false, health: "failing", beat: null }], now)).toEqual([]);
  });
  it("support signals", () => {
    expect(fromSupport({ unanswered: 3, withOutcome: 0, ownerOverdue: 0 })).toHaveLength(1);
    expect(fromSupport({ unanswered: 3, withOutcome: 1, ownerOverdue: 0 })).toHaveLength(0);
    expect(fromSupport({ unanswered: 0, withOutcome: 0, ownerOverdue: 2 })[0].severity).toBe("P3");
  });
});

describe("daily review", () => {
  it("proposes a permanent fix for recurring keys only", () => {
    const rs = [rec({ incidentId: "1", status: "resolved", rootCause: "cold start" }), rec({ incidentId: "2", detectedAt: ago(60 * 24).toISOString() }), rec({ incidentId: "3", key: "once" })];
    const r = reviewIncidents(rs, now);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].key).toBe("k");
    expect(r.proposals[0].why).toContain("cold start");
    expect(r.opened).toBe(3);
  });
});

describe("infra evaluators", () => {
  const day = (n: number) => new Date(now.getTime() + n * 86_400_000);
  it("expiry severity by kind", () => {
    expect(evalExpiry({ name: "s", kind: "ssl", expiresAt: day(2), action: "" }, now).severity).toBe("P1");
    expect(evalExpiry({ name: "s", kind: "ssl", expiresAt: day(10), action: "" }, now).severity).toBe("P2");
    expect(evalExpiry({ name: "s", kind: "ssl", expiresAt: day(300), action: "" }, now).severity).toBeNull();
    expect(evalExpiry({ name: "d", kind: "domain", expiresAt: null, action: "" }, now).severity).toBeNull();
  });
  it("signals skip P3; weekly list sorted and omitted when empty", () => {
    const evals = [evalExpiry({ name: "a", kind: "domain", expiresAt: day(50), action: "renew" }, now), evalExpiry({ name: "b", kind: "domain", expiresAt: day(40), action: "renew" }, now), evalExpiry({ name: "c", kind: "domain", expiresAt: day(5), action: "renew" }, now)];
    expect(expirySignals(evals).map((s) => s.title)).toEqual(["c expires in 5 day(s)"]);
    expect(expiringSoon(evals).map((e) => e.name)).toEqual(["c", "b"]);
    expect(weeklyExpiryEmail([])).toBeNull();
    expect(weeklyExpiryEmail(expiringSoon(evals))!.text).toContain("c: 5 day(s)");
  });
  it("RDAP parse", () => {
    expect(parseRdapExpiry({ events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2027-02-03T00:00:00Z" }] })?.toISOString()).toBe("2027-02-03T00:00:00.000Z");
    expect(parseRdapExpiry({})).toBeNull();
  });
  it("db signals", () => {
    expect(dbSignals({ connections: 90, maxConnections: 100, sizeBytes: 1, slowQueries: 0, waitingLocks: 0 }, 1e12)[0].key).toBe("infra:db:connections");
    expect(dbSignals({ connections: 1, maxConnections: 100, sizeBytes: 1, slowQueries: 0, waitingLocks: 0 }, 1e12)).toEqual([]);
  });
});
