import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEMS, systemFlagKey } from "../../growth/systems";
import { capBlocks, checkNote, DAY } from "../core";
import { expansionDue, expansionNote, type ExpansionInput } from "../expansion";
import { autopilotEligible, nurtureDue, nurtureNote, nurtureSegment, objectionOrder, NURTURE_MAX_EMAILS, type NurtureInput } from "../nurture";
import { cancelledDue, cancelledNote, changesSince, dormantDue, dormantNote, offerReady, REACTIVATION_OFFER, type CancelledInput, type DormantInput } from "../reactivation";
import { detectStuck, pickRescueEmail, rescueMayEmail, rescueNote, type RescueState } from "../rescue";
import { applySummary, causeOf, clusterSignals, parseFinding, topFindings, type Signal } from "../success";
import { loadSuccessFindings } from "../server";

const now = new Date("2026-12-10T12:00:00Z");
const ago = (days: number, from = now) => new Date(from.getTime() - days * DAY);
const sup = { test: false, unsubscribed: false, replied: false, paid: false };

const nurture = (o: Partial<NurtureInput> = {}): NurtureInput => ({
  userId: "u1", firstName: "Sam", trade: "roofers", isBusiness: true, source: "facebook", packFinishedAt: ago(2), packFailed: false, downloaded: true, returned: false, adInsight: null, brandName: "Acme Roofing",
  suppression: sup, sends: [], nurtureSent: [], autopilotUsed: false, appUrl: "https://www.komendly.com", unsubscribeUrl: "https://www.komendly.com/u/x", ...o,
});

describe("flags", () => {
  it("registers the five systems", () => {
    for (const k of ["nurture", "activation_rescue", "reactivation", "expansion", "success_agent"]) expect(GROWTH_SYSTEMS.some((s) => s.key === k)).toBe(true);
    expect(systemFlagKey("success_agent")).toBe("sys_success_agent");
  });
});

describe("caps", () => {
  it("blocks within 24h and over 3 per week; ignores transactional", () => {
    expect(capBlocks([{ kind: "x", at: ago(0.5) }], now)).toBe("gap");
    expect(capBlocks([{ kind: "verify_nudge", at: ago(0.1) }], now)).toBeNull();
    expect(capBlocks([1.5, 3, 5].map((d) => ({ kind: "x", at: ago(d) })), now)).toBe("week");
    expect(capBlocks([{ kind: "x", at: ago(2) }], now)).toBeNull();
  });
});

describe("nurture", () => {
  it("segments by trade, business, activation and source", () => {
    const s = nurtureSegment({ trade: "roofers", isBusiness: true, source: "facebook", downloaded: false, returned: false });
    expect(s).toMatchObject({ trade: "roofers", business: true, activation: "not_downloaded", engaged: false, sourceGroup: "paid_social" });
    expect(nurtureSegment({ trade: "bogus", isBusiness: false, source: null, downloaded: true, returned: false }).trade).toBeNull();
  });
  it("orders objections by segment", () => {
    expect(objectionOrder(nurtureSegment({ trade: "roofers", isBusiness: true, source: null, downloaded: false, returned: false }))[0]).toBe("will_it_work");
    expect(new Set(objectionOrder(nurtureSegment({ trade: null, isBusiness: false, source: null, downloaded: true, returned: true })))).toEqual(new Set(["price", "self_post", "will_it_work", "meta_setup"]));
  });
  it("schedules from the pack day, never stale, and never before the gap", () => {
    expect(nurtureDue(nurture({ packFinishedAt: ago(0.5) }), now)).toBeNull();
    expect(nurtureDue(nurture({ packFinishedAt: ago(1.5) }), now)?.kind).toBe("n1_value");
    expect(nurtureDue(nurture({ packFinishedAt: ago(30) }), now)).toBeNull();
    expect(nurtureDue(nurture({ packFinishedAt: ago(4), nurtureSent: [{ kind: "n1_value", at: ago(1) }] }), now)).toBeNull(); // 2-day spacing
    expect(nurtureDue(nurture({ packFinishedAt: ago(4), nurtureSent: [{ kind: "n1_value", at: ago(2.5) }] }), now)?.kind).toBe("n2_bridge");
    expect(nurtureDue(nurture({ packFinishedAt: ago(9), nurtureSent: [{ kind: "n1_value", at: ago(7) }, { kind: "n2_bridge", at: ago(5) }] }), now)).toMatchObject({ kind: "n3_objection" });
  });
  it("stops on purchase, unsubscribe, reply, test, cap, failed pack and after 5", () => {
    for (const s of [{ paid: true }, { unsubscribed: true }, { replied: true }, { test: true }]) expect(nurtureDue(nurture({ packFinishedAt: ago(1.5), suppression: { ...sup, ...s } }), now)).toBeNull();
    expect(nurtureDue(nurture({ packFinishedAt: ago(1.5), sends: [{ kind: "x", at: ago(0.2) }] }), now)).toBeNull();
    expect(nurtureDue(nurture({ packFinishedAt: ago(1.5), packFailed: true }), now)).toBeNull();
    const five = (["n1_value", "n2_bridge", "n3_objection", "n4_objection", "n5_close"] as const).map((kind, i) => ({ kind, at: ago(20 - i * 4) }));
    expect(five.length).toBe(NURTURE_MAX_EMAILS);
    expect(nurtureDue(nurture({ packFinishedAt: ago(19.5), nurtureSent: five }), now)).toBeNull();
  });
  it("uses distinct objections across the sequence", () => {
    const sent = [{ kind: "n3_objection" as const, at: ago(6), objection: "will_it_work" as const }];
    const due = nurtureDue(nurture({ packFinishedAt: ago(13.5), nurtureSent: [{ kind: "n1_value", at: ago(12) }, { kind: "n2_bridge", at: ago(10) }, ...sent] }), now);
    expect(due?.kind).toBe("n4_objection");
    expect(due?.objection).not.toBe("will_it_work");
  });
  it("only mentions the first-month price when the launch offer is open and unused", () => {
    expect(autopilotEligible({ packFinishedAt: ago(1), autopilotUsed: false }, now)).toBe(true);
    expect(autopilotEligible({ packFinishedAt: ago(1), autopilotUsed: true }, now)).toBe(false);
    expect(autopilotEligible({ packFinishedAt: ago(40), autopilotUsed: false }, now)).toBe(false);
    const open = nurtureNote(nurture({ packFinishedAt: ago(3.5) }), { kind: "n2_bridge" }, now);
    const closed = nurtureNote(nurture({ packFinishedAt: ago(3.5), autopilotUsed: true }), { kind: "n2_bridge" }, now);
    expect(open.text).toContain("first month");
    expect(closed.text).not.toContain("first month is");
  });
  it("every note passes the safety check and asks exactly one question", () => {
    for (const kind of ["n1_value", "n2_bridge", "n3_objection", "n4_objection", "n5_close"] as const)
      for (const objection of ["price", "self_post", "will_it_work", "meta_setup"] as const) {
        const n = nurtureNote(nurture(), { kind, objection }, now);
        expect(checkNote(n)).toBeNull();
        const asks = n.text.split("\n--\n")[0]!.split("\n").filter((l) => l.trim().endsWith("?"));
        expect(asks.length).toBe(1);
        expect(n.subject).not.toMatch(/\| Komendly/);
      }
  });
  it("uses the trade playbook and a real ad insight when present", () => {
    const n = nurtureNote(nurture({ adInsight: "your hook doesn't name the town" }), { kind: "n1_value" }, now);
    expect(n.subject).toMatch(/roof/i);
    expect(n.text).toContain("your hook doesn't name the town");
  });
});

describe("activation rescue", () => {
  const base: RescueState = { now, signedUpAt: ago(5), hasRun: true, run: null, downloadedAt: null, lockedRefusedAt: null, unlockPaidAt: null, subscribed: false, autopilot: null };
  const run = (o: Partial<NonNullable<RescueState["run"]>>) => ({ id: "r1", status: "completed", completedAt: ago(3), createdAt: ago(3), ready: 10, error: null, ...o });
  it("detects each stuck state", () => {
    expect(detectStuck({ ...base, hasRun: false }).map((s) => s.cause)).toContain("no_url");
    expect(detectStuck({ ...base, run: run({ status: "failed", completedAt: null }) })[0]).toMatchObject({ cause: "pack_failed", ourBug: true });
    expect(detectStuck({ ...base, run: run({ ready: 0 }) })[0]).toMatchObject({ cause: "pack_empty", ourBug: true });
    expect(detectStuck({ ...base, run: run({}) })[0]).toMatchObject({ cause: "never_downloaded", ourBug: false });
    expect(detectStuck({ ...base, run: run({}), downloadedAt: ago(1) })).toEqual([]);
    expect(detectStuck({ ...base, unlockPaidAt: ago(2) }).map((s) => s.cause)).toContain("buyer_never_downloaded");
    expect(detectStuck({ ...base, unlockPaidAt: ago(3), lockedRefusedAt: ago(2), downloadedAt: ago(3) }).map((s) => s.cause)).toContain("paid_download_refused");
    expect(detectStuck({ ...base, lockedRefusedAt: ago(1) }).map((s) => s.cause)).toContain("tried_locked");
    expect(detectStuck({ ...base, subscribed: true, autopilot: { paidAt: ago(2), metaConnected: false } })).toEqual([expect.objectContaining({ cause: "autopilot_pre_meta", email: false })]);
  });
  it("does not email states other systems already cover, and prefers our bugs", () => {
    const stuck = detectStuck({ ...base, hasRun: false });
    expect(pickRescueEmail(stuck, new Set())).toBeNull();
    const two = detectStuck({ ...base, run: run({ ready: 0 }), lockedRefusedAt: ago(1) });
    expect(pickRescueEmail(two, new Set())?.cause).toBe("pack_empty");
    expect(pickRescueEmail(two, new Set(["pack_empty"]))?.cause).toBe("tried_locked");
  });
  it("applies caps to non-bug emails but not to our-bug apologies", () => {
    const sends = [{ kind: "x", at: ago(0.2) }];
    expect(rescueMayEmail({ cause: "never_downloaded", ourBug: false, email: true, since: ago(2) }, { suppression: sup, sends, now })).toBe(false);
    expect(rescueMayEmail({ cause: "pack_failed", ourBug: true, email: true, since: ago(2) }, { suppression: sup, sends, now })).toBe(true);
    expect(rescueMayEmail({ cause: "pack_failed", ourBug: true, email: true, since: ago(2) }, { suppression: { ...sup, unsubscribed: true }, sends: [], now })).toBe(false);
  });
  it("copy is safe", () => {
    for (const c of ["pack_failed", "pack_empty", "never_downloaded", "tried_locked", "buyer_never_downloaded", "paid_download_refused"] as const)
      expect(checkNote(rescueNote(c, { firstName: null, runUrl: "https://x/r", pricingUrl: "https://x/p", unsubscribeUrl: "https://x/u" }))).toBeNull();
  });
});

describe("reactivation", () => {
  const d = (o: Partial<DormantInput> = {}): DormantInput => ({ firstName: "Sam", packFinishedAt: ago(31, now), suppression: sup, sends: [], reactivationSent: [], appUrl: "https://www.komendly.com", unsubscribeUrl: "https://x/u", ...o });
  const changes = [{ date: "2026-12-01", line: "A real thing", path: "/ads/team" }];
  it("only sends with real changes since the pack", () => {
    expect(dormantDue(d(), now, changes)).toBe(30);
    expect(dormantDue(d({ packFinishedAt: ago(31) }), now, [{ date: "2026-01-01", line: "old", path: "/" }])).toBeNull();
    expect(dormantDue(d({ reactivationSent: [30] }), now, changes)).toBeNull();
    expect(dormantDue(d({ packFinishedAt: ago(61) }), now, changes)).toBe(60);
    expect(dormantDue(d({ suppression: { ...sup, paid: true } }), now, changes)).toBeNull();
    expect(changesSince(ago(5), changes, now)).toHaveLength(0);
    expect(checkNote(dormantNote(d(), 30, now, changes))).toBeNull();
  });
  it("cancelled feedback: day 45 window, honest offer disabled by default", () => {
    const c = (o: Partial<CancelledInput> = {}): CancelledInput => ({ firstName: null, canceledAt: ago(46), active: false, suppression: sup, sends: [], sentFeedback: false, winbackRecent: false, appUrl: "https://x", unsubscribeUrl: "https://x/u", ...o });
    expect(cancelledDue(c(), now)).toBe(true);
    expect(cancelledDue(c({ winbackRecent: true }), now)).toBe(false);
    expect(cancelledDue(c({ canceledAt: ago(10) }), now)).toBe(false);
    expect(cancelledDue(c({ active: true }), now)).toBe(false);
    expect(offerReady(REACTIVATION_OFFER)).toBe(false);
    expect(cancelledNote(c()).text).not.toMatch(/one-time offer/);
    expect(cancelledNote(c(), { enabled: true, headline: "Half off month one", terms: "Once, no catch.", path: "/ads/pricing" }).text).toMatch(/one-time offer: Half off month one/);
    expect(checkNote(cancelledNote(c()))).toBeNull();
  });
});

describe("expansion", () => {
  const e = (o: Partial<ExpansionInput> = {}): ExpansionInput => ({ firstName: "Sam", plan: "ad_department", active: true, firstDownloadAt: null, downloads14d: 0, distinctBrandDomains: 1, paidSince: ago(20), referralUrl: "https://www.komendly.com/r/x", suppression: sup, sends: [], expansionSent: [], appUrl: "https://www.komendly.com", unsubscribeUrl: "https://x/u", ...o });
  it("needs a data trigger", () => {
    expect(expansionDue(e(), now)).toBeNull();
    expect(expansionDue(e({ downloads14d: 3 }), now)).toBe("diy_to_autopilot");
    expect(expansionDue(e({ downloads14d: 1 }), now)).toBeNull();
    expect(expansionDue(e({ distinctBrandDomains: 3 }), now)).toBe("multi_brand");
    expect(expansionDue(e({ active: false, plan: "trial", firstDownloadAt: ago(1) }), now)).toBe("referral_first_download");
    expect(expansionDue(e({ active: false, plan: "trial", firstDownloadAt: ago(5) }), now)).toBeNull();
    expect(expansionDue(e({ active: false, plan: "trial", firstDownloadAt: ago(1), referralUrl: null }), now)).toBeNull();
  });
  it("caps frequency", () => {
    expect(expansionDue(e({ downloads14d: 3, expansionSent: [{ kind: "multi_brand", at: ago(10) }] }), now)).toBeNull();
    expect(expansionDue(e({ downloads14d: 3, expansionSent: [{ kind: "multi_brand", at: ago(40) }] }), now)).toBe("diy_to_autopilot");
    expect(expansionDue(e({ downloads14d: 3, sends: [{ kind: "x", at: ago(0.3) }] }), now)).toBeNull();
    expect(expansionDue(e({ downloads14d: 3, expansionSent: [1, 2, 3].map((n) => ({ kind: "multi_brand" as const, at: ago(40 * n) })) }), now)).toBeNull();
  });
  it("copy is safe and the referral note states the two-sided reward", () => {
    for (const k of ["referral_first_download", "multi_brand", "diy_to_autopilot"] as const) expect(checkNote(expansionNote(k, e()))).toBeNull();
    expect(expansionNote("referral_first_download", e()).text).toMatch(/20 free ads/);
  });
});

describe("customer success clustering", () => {
  const sig = (source: Signal["source"], text: string, category?: string): Signal => ({ source, text, category, at: now });
  it("maps signals to causes", () => {
    expect(causeOf(sig("reply", "I can't download my ads, it says 403")).cause).toBe("download_failed");
    expect(causeOf(sig("reply", "please refund me", "refund_request")).cause).toBe("refund");
    expect(causeOf(sig("failed_job", "extract: timeout")).cause).toBe("pack_failed");
    expect(causeOf(sig("stuck", "autopilot_pre_meta")).cause).toBe("meta_connect");
    expect(causeOf(sig("stuck", "never_downloaded")).cause).toBe("stuck_before_download");
    expect(causeOf(sig("reply", "hello there")).cause).toBe("other");
  });
  it("clusters, counts, ranks by severity and redacts", () => {
    const cl = clusterSignals([sig("reply", "cannot download, mail me at bob@x.com"), sig("reply", "download failed"), sig("stuck", "paid_download_refused"), sig("reply", "too expensive"), sig("refund", "no leads")]);
    expect(cl.map((c) => c.cause).slice(0, 2).sort()).toEqual(["download_failed", "refund"]);
    const dl = cl.find((c) => c.cause === "download_failed")!;
    expect(dl).toMatchObject({ count: 3, severity: "high", ourBug: true });
    expect(JSON.stringify(cl)).not.toContain("bob@x.com");
    expect(cl.find((c) => c.cause === "price_objection")!.severity).toBe("low");
  });
  it("AI summary only applies valid fixes for known causes", () => {
    const cl = clusterSignals([sig("reply", "download failed")]);
    expect(applySummary(cl, { items: [{ cause: "download_failed", suggestedFix: "Check the 403 on the asset route for unlocked packs." }] })[0]!.suggestedFix).toMatch(/403/);
    expect(applySummary(cl, { items: [{ cause: "nope", suggestedFix: "Something long enough here." }] })[0]!.suggestedFix).toBe(cl[0]!.suggestedFix);
    expect(applySummary(cl, "garbage")[0]!.suggestedFix).toBe(cl[0]!.suggestedFix);
    expect(applySummary(cl, { items: [{ cause: "download_failed", suggestedFix: "x".repeat(400) }] })[0]!.suggestedFix).toBe(cl[0]!.suggestedFix);
  });
  it("loadSuccessFindings returns the latest finding per cause, severity first", async () => {
    const rows = [
      { cause: "a", severity: "low", count: 9, day: "2026-12-09", example: "", suggestedFix: "", label: "A" },
      { cause: "b", severity: "high", count: 2, day: "2026-12-09", example: "", suggestedFix: "", label: "B" },
      { cause: "b", severity: "medium", count: 1, day: "2026-12-08", example: "", suggestedFix: "", label: "B" },
    ];
    const db = { adsEvent: { findMany: async () => rows.map((props) => ({ props })) } };
    const out = await loadSuccessFindings(db, { now });
    expect(out.map((r) => r.cause)).toEqual(["b", "a"]);
    expect(out[0]!.severity).toBe("high");
    expect(parseFinding({ nope: 1 })).toBeNull();
    expect(topFindings([], 3)).toEqual([]);
  });
});
