import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEMS } from "../../../growth/systems";
import { buildOwnerBrief, combinedPlan } from "../brief";
import { capacityModel, firstBinding } from "../capacity";
import { aiBudgetThrottle, conflictingExperiments, detectContention, priorityWeights } from "../coordination";
import { canContact } from "../contact";
import { EMERGENCY_FLAGS, planResume, planStop } from "../emergency";
import { CAPABILITIES } from "../inventory";
import { buildLedger, registryDiscrepancies } from "../ledger";
import { decisionsToDocs, searchMemory, tokenize } from "../memory";
import { capabilityStatus } from "../status";

const now = new Date("2026-11-26T12:00:00Z");
const hrs = (h: number) => new Date(now.getTime() - h * 3_600_000);
const beat = (o: object = {}) => ({ firstRunAt: hrs(100).toISOString(), lastRunAt: hrs(1).toISOString(), lastOkAt: hrs(1).toISOString(), lastOutputAt: null, runs: 5, outputs: 0, lastError: null, ...o });
const base = { enabled: true, beat: null, lastMarkerAt: null, outputs7d: null, outputs30d: null, cycleHours: 24, now };

describe("capabilityStatus", () => {
  it("off when flag off", () => expect(capabilityStatus({ ...base, enabled: false }).status).toBe("off"));
  it("silent: enabled but never ran", () => { const r = capabilityStatus(base); expect(r.status).toBe("silent"); expect(r.reason).toMatch(/never ran/); });
  it("unproven for flag-less capability without telemetry", () => expect(capabilityStatus({ ...base, enabled: null, noTelemetry: true }).status).toBe("unproven"));
  it("failing on last error", () => expect(capabilityStatus({ ...base, beat: beat({ lastError: "boom", lastOkAt: hrs(30).toISOString() }) }).status).toBe("failing"));
  it("failing when stale (>3 cycles)", () => expect(capabilityStatus({ ...base, beat: beat({ lastRunAt: hrs(100).toISOString(), lastOkAt: hrs(100).toISOString() }) }).status).toBe("failing"));
  it("unproven: ran, no outputs", () => expect(capabilityStatus({ ...base, beat: beat() }).status).toBe("unproven"));
  it("idle_by_design when event-driven and nothing yet", () => expect(capabilityStatus({ ...base, beat: beat(), idleOk: true }).status).toBe("idle_by_design"));
  it("operational with marker outputs", () => expect(capabilityStatus({ ...base, beat: beat(), outputs30d: 3 }).status).toBe("operational"));
  it("operational with recent heartbeat output", () => expect(capabilityStatus({ ...base, beat: beat({ outputs: 4, lastOutputAt: hrs(5).toISOString() }) }).status).toBe("operational"));
  it("marker alone counts as a run", () => expect(capabilityStatus({ ...base, lastMarkerAt: hrs(2), outputs30d: 1 }).status).toBe("operational"));
});

describe("inventory + ledger", () => {
  it("covers every growth system", () => { for (const s of GROWTH_SYSTEMS) expect(CAPABILITIES.some((c) => c.id === `system:${s.key}`)).toBe(true); });
  it("covers every vercel cron", () => {
    const crons = (JSON.parse(readFileSync("vercel.json", "utf8")).crons as Array<{ path: string }>).map((c) => c.path);
    for (const p of crons) expect(CAPABILITIES.some((c) => c.where.includes(p)), p).toBe(true);
  });
  it("ids are unique", () => expect(new Set(CAPABILITIES.map((c) => c.id)).size).toBe(CAPABILITIES.length));
  it("flags enabled-but-silent and cost-without-outcome", () => {
    const l = buildLedger({ now, flags: { sys_reels: true, sys_proof: true }, beats: { "system:proof": beat({ lastError: null }) }, events: {}, aiCostMicros30d: { reels: 5_000_000 }, aiCalls7d: { reels: 9 } });
    expect(l.rows.find((r) => r.id === "system:reels")!.status).toBe("silent");
    expect(l.findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["enabled_but_silent", "cost_without_outcome"]));
    expect(l.counts.silent).toBeGreaterThan(0);
  });
  it("registry mismatch: operational claim with flag off / silent", () => {
    const l = buildLedger({ now, flags: { sys_free_tools: true }, beats: {}, events: {} });
    const d = registryDiscrepancies([{ id: 1, name: "A", status: "operational", flag: "sys_viral_branding" }, { id: 2, name: "B", status: "operational", flag: "sys_free_tools" }, { id: 3, name: "C", status: "experimenting", flag: "sys_x" }], l.rows, { sys_free_tools: true });
    expect(d.map((x) => x.id).sort()).toEqual(["registry:1", "registry:2"]);
    expect(d.find((x) => x.id === "registry:2")!.severity).toBe("high");
  });
});

describe("canContact", () => {
  const h = (target: string, channel: "cold_email" | "nurture", days: number) => ({ target, channel, at: new Date(now.getTime() - days * 86_400_000) });
  it("blocks same person within window, any channel", () => expect(canContact("A@x.com", "nurture", [h("a@x.com", "cold_email", 1)], now).ok).toBe(false));
  it("allows after window", () => expect(canContact("a@x.com", "nurture", [h("a@x.com", "cold_email", 5)], now).ok).toBe(true));
  it("blocks other channel at same business domain", () => expect(canContact("bob@roofs.com", "nurture", [h("amy@roofs.com", "cold_email", 1)], now).ok).toBe(false));
  it("allows same channel colleague and free-mail domains", () => {
    expect(canContact("bob@roofs.com", "cold_email", [h("amy@roofs.com", "cold_email", 1)], now).ok).toBe(true);
    expect(canContact("bob@gmail.com", "nurture", [h("amy@gmail.com", "cold_email", 1)], now).ok).toBe(true);
  });
  it("auto replies are never blocked", () => expect(canContact("a@x.com", "auto_reply", [h("a@x.com", "cold_email", 0.1)], now).ok).toBe(true));
});

describe("coordination", () => {
  it("weights: revenue-critical 3, constraint area 2", () => {
    const l = buildLedger({ now, flags: {}, beats: {}, events: {} });
    const w = priorityWeights(l.rows, "traffic");
    expect(w["system:checkout_recovery"]).toBe(3);
    expect(w["system:free_tools"]).toBe(2);
    expect(w["system:revenue_intel"]).toBe(1);
  });
  it("reels vs packs contention", () => expect(detectContention({ queueDepth: 10, runningJobs: 2, avgPackSeconds: 600, reelsRendering: true, packConcurrency: 2 })[0].id).toBe("contention:reels-vs-packs"));
  it("no contention when queue is short", () => expect(detectContention({ queueDepth: 1, runningJobs: 1, avgPackSeconds: 300, reelsRendering: true, packConcurrency: 2 })).toEqual([]));
  it("budget: throttles non-revenue first, never revenue-critical", () => {
    const w = { "system:reels": 1, "system:optimizer": 1, "system:proof": 3 };
    const p = aiBudgetThrottle({ reels: 400, optimizer: 100, proof: 900 }, 1000, w);
    expect(p.map((x) => x.id)).toEqual(["budget:reels"]);
    expect(p.some((x) => x.id === "budget:proof")).toBe(false);
    expect(aiBudgetThrottle({ reels: 1 }, 10, w)).toEqual([]);
  });
  it("conflicting experiments", () => {
    expect(conflictingExperiments([{ key: "a", surface: "pricing", kind: "copy" }, { key: "b", surface: "Pricing", kind: "copy" }])).toHaveLength(1);
    expect(conflictingExperiments([{ key: "a", surface: "x", kind: "offer" }, { key: "b", surface: "y", kind: "money_model" }])).toHaveLength(1);
    expect(conflictingExperiments([{ key: "a", surface: "x", kind: "copy" }, { key: "b", surface: "y", kind: "copy" }])).toHaveLength(0);
  });
});

describe("memory", () => {
  const docs = [
    { id: "1", title: "Postal address rule", text: "Only Kly OUTBOUND_POSTAL_ADDRESS is used. Never invent one.", source: "MEMORY" },
    { id: "2", title: "Deploy engine", text: "railway up from a clean git worktree of HEAD, never the dirty repo", source: "MEMORY" },
    { id: "3", title: "Stripe coupon", text: "ads_autopilot_first_month_20000 created live", source: "MEMORY" },
  ];
  it("ranks the relevant doc first", () => { expect(searchMemory("how do I deploy the engine", docs)[0].doc.id).toBe("2"); expect(searchMemory("postal address", docs)[0].doc.id).toBe("1"); });
  it("empty for no match / empty query", () => { expect(searchMemory("zzzz", docs)).toEqual([]); expect(searchMemory("", docs)).toEqual([]); });
  it("finds decisions", () => { const d = decisionsToDocs([{ id: "e1", props: { decision: "No Meta ads until proof", why: "0 paying customers" }, createdAt: now }]); expect(searchMemory("meta ads proof", d)[0].doc.id).toBe("decision:e1"); expect(tokenize("The Meta")).toEqual(["meta"]); });
});

describe("capacity, emergency, brief", () => {
  it("projects binding points", () => { const rows = capacityModel(); expect(rows).toHaveLength(3); expect(firstBinding(rows)!.bindsAtCustomers).toBeGreaterThan(0); expect(rows[0].usedAt[200]).toBeGreaterThan(rows[0].usedAt[10]); });
  it("stop plan only touches enabled emergency flags; resume restores only those", () => {
    const p = planStop({ outbound: true, sys_reels: false, sys_optimizer: true });
    expect(p.turnOff).toEqual(["outbound"]);
    expect(planResume({ turnedOff: ["outbound", "sys_optimizer", "stripe"] })).toEqual(["outbound"]);
    expect(EMERGENCY_FLAGS).not.toContain("sys_optimizer");
    expect(planResume(null)).toEqual([]);
  });
  it("brief is <=12 lines, dedupes against other digests", () => {
    const input = { weekLabel: "2026-W48", adminUrl: "u", business: { stage: "Monetize", payingCustomers: 0, mrrCents: 0, topConstraint: "Traffic" }, previous: { payingCustomers: 0, topConstraint: "Traffic" }, findings: [], resolved: [], needsOwner: ["a", "a", "b"], optimizerLines: ["x"] };
    const alone = buildOwnerBrief(input);
    expect(alone.lines.some((l) => l.startsWith("Optimiser"))).toBe(true);
    const combined = buildOwnerBrief(input, { revenueDigest: true, optimizerDigest: true, opsDigest: true });
    expect(combined.lines.some((l) => l.startsWith("Optimiser") || l.startsWith("Business"))).toBe(false);
    expect(combined.lines.filter((l) => l === "- a")).toHaveLength(1);
    const many = buildOwnerBrief({ ...input, needsOwner: Array.from({ length: 30 }, (_, i) => `n${i}`), findings: Array.from({ length: 30 }, (_, i) => ({ kind: "failing" as const, id: `${i}`, severity: "high" as const, message: "m" })) });
    expect(many.lines.length).toBeLessThanOrEqual(12);
    expect(combinedPlan({ revenueDigest: true, optimizerDigest: false, opsDigest: true })).toEqual({ mode: "combined", skipOwnSend: ["revenue_digest"] });
    expect(combinedPlan({ revenueDigest: true, optimizerDigest: false, opsDigest: false }).mode).toBe("off");
  });
});
