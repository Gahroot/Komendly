import { describe, expect, it } from "vitest";
import { checkStudioCopy, dueStudioEmail, STUDIO_DROP_KINDS, studioFallbackCopy, type StudioDropCandidate } from "../lifecycle/studio-drop";
import { spreadSlot } from "../lifecycle/select";

const H = 3_600_000;
const START = new Date("2026-11-12T00:00:00Z");
const at = (h: number) => new Date(START.getTime() + h * H);

function cand(o: Partial<StudioDropCandidate> = {}): StudioDropCandidate {
  return {
    userId: "u1", email: "jane@yahoo.com", name: "Jane", signedUpAt: at(-24 * 30), contactable: true, paid: false, paidWorkspace: false,
    testimonialsUser: false, unsubscribed: false, suspended: false, workspaceId: "w1", studioSessions: 0, freeVideosLeft: 1,
    firstFreeVideoAt: null, lastEmailAt: null, sent: [], rewards: [], ...o,
  };
}
const d0At = (c: StudioDropCandidate) => at(spreadSlot(c.userId, 48));
const sentD0 = (h = 0) => ({ sent: [{ kind: "studio_d0", at: at(h) }], lastEmailAt: at(h) });

describe("studio drop gates", () => {
  it("skips unsubscribed, internal, excluded, suspended and uncontactable users", () => {
    const now = at(60);
    expect(dueStudioEmail(cand(), now, START)?.kind).toBe("studio_d0");
    expect(dueStudioEmail(cand({ unsubscribed: true }), now, START)).toBeNull();
    expect(dueStudioEmail(cand({ email: "nolan@komendly.com" }), now, START)).toBeNull();
    expect(dueStudioEmail(cand({ email: "e2e-x@gmail.com" }), now, START)).toBeNull();
    expect(dueStudioEmail(cand({ email: "me@gmail.com" }), now, START, "a@b.com, ME@gmail.com")).toBeNull();
    expect(dueStudioEmail(cand({ suspended: true }), now, START)).toBeNull();
    expect(dueStudioEmail(cand({ contactable: false }), now, START)).toBeNull();
    expect(dueStudioEmail(cand(), at(-1), START)).toBeNull();
  });
  it("paid and testimonials users get the announcement too", () => {
    expect(dueStudioEmail(cand({ paid: true, paidWorkspace: true, testimonialsUser: true }), at(60), START)?.kind).toBe("studio_d0");
  });
});

describe("D0", () => {
  it("spreads over 48h by user id and closes after 14 days", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `user-${i}`);
    const slots = ids.map((id) => spreadSlot(id, 48));
    expect(Math.max(...slots)).toBeLessThan(48);
    expect(new Set(slots).size).toBeGreaterThan(30);
    const c = cand({ userId: "abc" });
    const t = d0At(c);
    expect(dueStudioEmail(c, new Date(t.getTime() - 1), START)).toBeNull();
    expect(dueStudioEmail(c, t, START)?.kind).toBe("studio_d0");
    expect(dueStudioEmail(c, at(24 * 15 + 48), START)).toBeNull();
  });
  it("new sign-ups wait 24h; users who already made the free video skip it", () => {
    expect(dueStudioEmail(cand({ signedUpAt: at(50) }), at(60), START)).toBeNull();
    expect(dueStudioEmail(cand({ signedUpAt: at(50) }), at(75), START)?.kind).toBe("studio_d0");
    expect(dueStudioEmail(cand({ firstFreeVideoAt: at(-24 * 20) }), at(60), START)).toBeNull();
  });
});

describe("D2 / D5", () => {
  it("D2 only without a Studio session, inside day 2-4", () => {
    expect(dueStudioEmail(cand(sentD0()), at(47), START)).toBeNull();
    expect(dueStudioEmail(cand(sentD0()), at(49), START)?.kind).toBe("studio_d2");
    expect(dueStudioEmail(cand({ ...sentD0(), studioSessions: 1 }), at(49), START)).toBeNull();
    expect(dueStudioEmail(cand(sentD0()), at(97), START)).toBeNull();
  });
  it("D5 only while the free video is unused, inside day 5-7", () => {
    expect(dueStudioEmail(cand(sentD0()), at(121), START)?.kind).toBe("studio_d5");
    expect(dueStudioEmail(cand({ ...sentD0(), freeVideosLeft: 0 }), at(121), START)).toBeNull();
    expect(dueStudioEmail(cand({ ...sentD0(), studioSessions: 1 }), at(121), START)?.kind).toBe("studio_d5");
    expect(dueStudioEmail(cand(sentD0()), at(24 * 7 + 1), START)).toBeNull();
  });
});

describe("free video ready + launch offer", () => {
  const r = at(100);
  it("studio_ready within 12h, last24 at 48-70h, unpaid only", () => {
    expect(dueStudioEmail(cand({ firstFreeVideoAt: r }), at(101), START)?.kind).toBe("studio_ready");
    expect(dueStudioEmail(cand({ firstFreeVideoAt: r }), at(113), START)).toBeNull();
    const c = cand({ firstFreeVideoAt: r, sent: [{ kind: "studio_ready", at: at(100) }] });
    expect(dueStudioEmail(c, at(147), START)).toBeNull();
    expect(dueStudioEmail(c, at(149), START)?.kind).toBe("studio_last24");
    expect(dueStudioEmail(c, at(171), START)).toBeNull();
    expect(dueStudioEmail({ ...c, paidWorkspace: true }, at(149), START)).toBeNull();
  });
  it("ready and last24 ignore the 6h gap; D2 respects it", () => {
    expect(dueStudioEmail(cand({ firstFreeVideoAt: r, lastEmailAt: at(100.5) }), at(101), START)?.kind).toBe("studio_ready");
    const c = cand({ firstFreeVideoAt: r, sent: [{ kind: "studio_ready", at: at(100) }], lastEmailAt: at(148) });
    expect(dueStudioEmail(c, at(149), START)?.kind).toBe("studio_last24");
    expect(dueStudioEmail(cand({ ...sentD0(), lastEmailAt: at(46) }), at(49), START)).toBeNull();
  });
});

describe("invite reward", () => {
  it("one email per rewarded invite, within 3 days, ignores the gap", () => {
    const c = cand({ ...sentD0(), lastEmailAt: at(10), rewards: [{ inviteId: "i1", rewardedAt: at(9) }, { inviteId: "i2", rewardedAt: at(9.5) }] });
    expect(dueStudioEmail(c, at(10.5), START)).toEqual({ kind: "studio_invite_reward", inviteId: "i1" });
    const c2 = { ...c, sent: [...c.sent, { kind: "studio_invite_reward", at: at(10.5), inviteId: "i1" }] };
    expect(dueStudioEmail(c2, at(11), START)).toEqual({ kind: "studio_invite_reward", inviteId: "i2" });
    expect(dueStudioEmail(c, at(9 + 72 + 1), START)?.kind).not.toBe("studio_invite_reward");
  });
});

describe("idempotency", () => {
  it("never sends the same kind twice", () => {
    const all = STUDIO_DROP_KINDS.filter((k) => k !== "studio_invite_reward").map((kind) => ({ kind, at: at(0) }));
    const c = cand({ sent: all, firstFreeVideoAt: at(100), lastEmailAt: at(0) });
    for (const h of [1, 49, 101, 121, 149]) expect(dueStudioEmail(c, at(h), START)).toBeNull();
  });
});

describe("copy", () => {
  const ctx = { firstName: "Jane", paid: false, testimonialsUser: false, offerOpen: false, offerClosesAt: null, freeVideosLeft: 1 };
  it("every fallback passes its own validator", () => {
    for (const kind of STUDIO_DROP_KINDS) {
      const c = { ...ctx, kind, offerOpen: kind === "studio_last24" || kind === "studio_ready", offerClosesAt: at(72) };
      expect(checkStudioCopy(studioFallbackCopy(c, at(48)), c), kind).toBeNull();
    }
  });
  it("rejects fake urgency and the offer outside its emails", () => {
    const c = { ...ctx, kind: "studio_d5" as const };
    const base = studioFallbackCopy(c, at(0));
    expect(checkStudioCopy({ ...base, paragraphs: [...base.paragraphs.slice(0, 2), "Hurry, it ends soon."] }, c)).toBe("fake urgency");
    expect(checkStudioCopy({ ...base, paragraphs: [...base.paragraphs.slice(0, 2), "Get 25 bonus credits."] }, c)).toBe("mentions the launch offer");
  });
});
