// Trial (money) sequence x "Ozzy Studio just dropped" drip: the two must cooperate (quiet window, second wow,
// included-in-plan, one offer at a time, shared 24h cap).
import { describe, expect, it } from "vitest";
import { dueEmail, MIN_GAP_MS, TRANSACTIONAL_KINDS, type LifecycleCandidate } from "../lifecycle/select";
import { dueStudioEmail, studioOfferOpen, studioPsFor, studioQuietReason, studioFallbackCopy, studioCtaPath, type StudioDropCandidate } from "../lifecycle/studio-drop";

const H = 3_600_000;
const START = new Date("2026-11-10T12:00:00Z"); // studio_drop switched on
const T = new Date("2026-11-11T09:00:00Z"); // trial ads ready (LQ opens)
const at = (h: number, base = T) => new Date(base.getTime() + h * H);
type Sent = { kind: string; at: Date; inviteId?: string | null; runId: string | null };

function studio(o: Partial<StudioDropCandidate> = {}): StudioDropCandidate {
  return {
    userId: "u-trial", email: "jo@gmail.com", name: "Jo Smith", signedUpAt: at(-1), contactable: true, paid: false, paidWorkspace: false,
    testimonialsUser: false, unsubscribed: false, suspended: false, workspaceId: "w1", studioSessions: 0, freeVideosLeft: 1,
    firstFreeVideoAt: null, lastEmailAt: null, sent: [], rewards: [], trial: { runId: "run1", completedAt: T, readyAdCount: 10, paidAt: null }, ...o,
  };
}
function trialCand(sent: Sent[], paid = false): LifecycleCandidate {
  return {
    userId: "u-trial", email: "jo@gmail.com", name: "Jo", workspaceId: "w1", adsSignup: true, signedUpAt: at(-1), emailVerifiedAt: at(-0.9),
    paid, unsubscribed: false, trialRunId: "run1", startedRun: true, trialCompletedAt: T, readyAdCount: 10, sent,
  };
}
const capped = (sent: Sent[]) => sent.reduce<Date | null>((m, s) => (TRANSACTIONAL_KINDS.has(s.kind) || (m && m > s.at) ? m : s.at), null);

/** Hour-by-hour: the trial tick runs first, then the Studio tick, on one shared sent list. */
function simulate(o: { paidAt?: Date; hours: number; studio?: Partial<StudioDropCandidate> }): Sent[] {
  const sent: Sent[] = [];
  for (let h = 0; h <= o.hours; h += 0.5) {
    const now = at(h);
    const paid = Boolean(o.paidAt && now >= o.paidAt);
    const d = dueEmail(trialCand(sent, paid), now, new Date("2020-01-01"));
    if (d) sent.push({ kind: d.kind, at: now, runId: "run1" });
    const s = dueStudioEmail(studio({ sent, lastEmailAt: capped(sent), paid, paidWorkspace: paid, trial: { runId: "run1", completedAt: T, readyAdCount: 10, paidAt: o.paidAt && paid ? o.paidAt : null }, ...o.studio }), now, START);
    if (s) sent.push({ kind: s.kind, at: now, runId: null });
  }
  return sent;
}
const hoursOf = (sent: Sent[], kind: string) => sent.filter((s) => s.kind === kind).map((s) => (s.at.getTime() - T.getTime()) / H);

describe("rule 1: quiet window", () => {
  it("no Studio email while the LQ window is open, within 24h of another lifecycle email, or on an offer day", () => {
    expect(studioQuietReason(studio(), at(10))).toBe("launch_quarter_open");
    expect(studioQuietReason(studio(), at(71.9))).toBe("launch_quarter_open");
    expect(studioQuietReason(studio({ lastEmailAt: at(60) }), at(80))).toBe("recent_email");
    expect(studioQuietReason(studio({ sent: [{ kind: "how_to_run", at: at(72 + 13) }] }), at(72 + 14))).toBe("recent_email");
    expect(studioQuietReason(studio({ sent: [{ kind: "studio_ready", at: at(90) }] }), at(91))).toBeNull(); // transactional
    expect(studioQuietReason(studio(), at(73))).toBeNull();
    const sameDay = studio({ sent: [{ kind: "offer_24h", at: new Date("2026-11-20T00:10:00Z") }] });
    expect(studioQuietReason(sameDay, new Date("2026-11-20T23:00:00Z"))).toBe("offer_day");
  });
});

describe("rule 2: unpaid trial -> second wow ~24h after last_chance", () => {
  it("replaces D0, deep-links the run's studio bridge, no D2/D5", () => {
    const sent = simulate({ hours: 24 * 14 });
    const kinds = sent.map((s) => s.kind);
    expect(kinds).not.toContain("studio_d0");
    expect(kinds).not.toContain("studio_d2");
    expect(kinds).not.toContain("studio_d5");
    const [lc] = hoursOf(sent, "last_chance");
    const [wow] = hoursOf(sent, "studio_second_wow");
    expect(lc).toBeDefined();
    expect(wow).toBeGreaterThanOrEqual((lc ?? 0) + 24);
    expect(wow).toBeLessThanOrEqual((lc ?? 0) + 26);
    expect(studioCtaPath("studio_second_wow", "run1")).toBe("/ads/runs/run1#studio-bridge");
  });
  it("without ready ads or a free video left: generic D0 after the window", () => {
    const noAds = simulate({ hours: 24 * 5, studio: { trial: { runId: "run1", completedAt: T, readyAdCount: 0, paidAt: null } } });
    expect(noAds.map((s) => s.kind)).not.toContain("studio_second_wow");
    expect(dueStudioEmail(studio({ freeVideosLeft: 0 }), at(100), START)?.kind).toBe("studio_d0");
  });
  it("honest copy: first video free, no card, no watermark; no deadline words", () => {
    const c = studioFallbackCopy({ kind: "studio_second_wow", firstName: "Jo", paid: false, testimonialsUser: false, offerOpen: false, offerClosesAt: null, freeVideosLeft: 1, brandName: "Acme" }, at(100));
    const all = c.paragraphs.join(" ");
    expect(c.subject).toBe("Your ads, now as a video");
    expect(all).toMatch(/first Studio video is free, no card/);
    expect(all).toMatch(/no watermark/);
    expect(all).not.toMatch(/\$|bonus|hours|offer|last chance/i);
  });
});

describe("rule 3: paid inside the window -> 'included in your plan' 2 days after purchase", () => {
  it("sent at purchase + 48h (after the LQ window), with no free-video pitch or launch offer", () => {
    const sent = simulate({ paidAt: at(30), hours: 24 * 10 });
    expect(hoursOf(sent, "studio_included")).toEqual([78]);
    expect(sent.map((s) => s.kind).filter((k) => k.startsWith("studio_"))).toEqual(["studio_included"]);
    const c = studioFallbackCopy({ kind: "studio_included", firstName: "Jo", paid: true, testimonialsUser: false, offerOpen: false, offerClosesAt: null, freeVideosLeft: 0 }, at(80));
    expect(c.paragraphs.join(" ")).not.toMatch(/\bfree\b|bonus|launch offer|card/i);
  });
  it("purchase at hour 2: waits for the window to close", () => {
    const sent = simulate({ paidAt: at(2), hours: 24 * 6 });
    const [h] = hoursOf(sent, "studio_included");
    expect(h).toBeGreaterThanOrEqual(72);
  });
});

describe("rule 4: non-trial users keep the generic drop", () => {
  it("D0, D2, D5", () => {
    const c = studio({ userId: "old", trial: null, signedUpAt: at(-24 * 200) });
    expect(dueStudioEmail(c, at(60, START), START)?.kind).toBe("studio_d0");
    const sent = [{ kind: "studio_d0", at: at(0, START) }];
    expect(dueStudioEmail({ ...c, sent, lastEmailAt: at(0, START) }, at(49, START), START)?.kind).toBe("studio_d2");
  });
});

describe("rule 5: Studio launch offer never while LQ is open", () => {
  it("studio_ready still goes (transactional) but without the offer; studio_last24 waits", () => {
    const c = studio({ firstFreeVideoAt: at(5) });
    expect(dueStudioEmail(c, at(6), START)?.kind).toBe("studio_ready");
    expect(studioOfferOpen(c, at(6))).toBe(false);
    const ready = { ...c, sent: [{ kind: "studio_ready", at: at(6) }] };
    expect(dueStudioEmail(ready, at(5 + 49), START)).toBeNull(); // inside LQ
    expect(dueStudioEmail(ready, at(72.5), START)?.kind).toBe("studio_last24"); // LQ closed, Studio offer still open
    expect(studioOfferOpen(ready, at(72.5))).toBe(true);
    // Never on an LQ offer day.
    const offerDay = { ...ready, sent: [...ready.sent, { kind: "last_chance", at: new Date("2026-11-14T08:00:00Z") }] };
    expect(dueStudioEmail(offerDay, new Date("2026-11-14T09:30:00Z"), START)).toBeNull();
  });
});

describe("rule 6: P.S. in day7/day10 only", () => {
  it("links the studio bridge; nothing on offer_24h/last_chance; off when Studio isn't live or already used", () => {
    expect(studioPsFor("day7_downsell", { runId: "run1", studioLive: true, madeStudioVideo: false })?.path).toBe("/ads/runs/run1#studio-bridge");
    expect(studioPsFor("day10_free_ads", { runId: "run1", studioLive: true, madeStudioVideo: false })).not.toBeNull();
    for (const k of ["offer_24h", "last_chance", "ads_ready", "how_to_run", "day14_tip"]) expect(studioPsFor(k, { runId: "run1", studioLive: true, madeStudioVideo: false })).toBeNull();
    expect(studioPsFor("day7_downsell", { runId: "run1", studioLive: false, madeStudioVideo: false })).toBeNull();
    expect(studioPsFor("day7_downsell", { runId: "run1", studioLive: true, madeStudioVideo: true })).toBeNull();
  });
});

describe("rule 7: shared frequency cap", () => {
  it("both sequences together: max 1 capped email per 24h (last_chance is the only deadline exemption)", () => {
    for (const paidAt of [undefined, at(30)]) {
      const sent = simulate({ paidAt, hours: 24 * 40 });
      const capd = sent.filter((s) => !TRANSACTIONAL_KINDS.has(s.kind) && s.kind !== "last_chance" && s.kind !== "ads_ready" && s.kind !== "founder_note");
      for (let i = 1; i < capd.length; i++) expect((capd[i]?.at.getTime() ?? 0) - (capd[i - 1]?.at.getTime() ?? 0)).toBeGreaterThanOrEqual(MIN_GAP_MS);
      // The money sequence is intact for unpaid users.
      if (!paidAt) expect(sent.map((s) => s.kind).filter((k) => !k.startsWith("studio_")).slice(0, 7)).toEqual(["ads_ready", "founder_note", "how_to_run", "offer_24h", "last_chance", "day7_downsell", "day10_free_ads"]);
    }
  });
  it("a Studio email blocks the trial sequence for 24h too; transactional ones don't", () => {
    const base = [{ kind: "ads_ready", at: at(0), runId: "run1" }, { kind: "how_to_run", at: at(24), runId: "run1" }, { kind: "offer_24h", at: at(50), runId: "run1" }, { kind: "last_chance", at: at(70), runId: "run1" }];
    expect(dueEmail(trialCand([...base, { kind: "studio_second_wow", at: at(160), runId: null }]), at(170), new Date("2020-01-01"))).toBeNull();
    expect(dueEmail(trialCand([...base, { kind: "studio_ready", at: at(167), runId: null }]), at(170), new Date("2020-01-01"))?.kind).toBe("day7_downsell");
  });
});

describe("links", () => {
  it("UTM params go before the #studio-bridge fragment", async () => {
    const { withUtm } = await import("../lifecycle/studio-drop");
    expect(withUtm("/ads/runs/r1#studio-bridge", "studio_second_wow")).toBe("/ads/runs/r1?utm_source=email&utm_medium=lifecycle&utm_campaign=studio_second_wow#studio-bridge");
    expect(withUtm("/studio?x=1", "k")).toBe("/studio?x=1&utm_source=email&utm_medium=lifecycle&utm_campaign=k");
  });
});
