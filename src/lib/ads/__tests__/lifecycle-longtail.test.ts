import { describe, expect, it } from "vitest";
import { dueEmail, FRESH_KINDS, LONG_TAIL, MIN_GAP_MS, scheduleFor, scheduleStatus, spreadSlot, type LifecycleCandidate } from "../lifecycle/select";
import { buildCopyPrompt, checkCopy, fallbackCopy, type CopyContext } from "../lifecycle/copy";
import { looksLikeAgency, REFERRAL_FACTS } from "../lifecycle/facts";
import { freeAdsBlock } from "../lifecycle/free-ads";
import { renderLifecycleHtml, renderLifecycleText } from "../lifecycle/template";
import { isSafeAppPath, signEmailToken, verifyEmailToken } from "../lifecycle/tokens";
import { MONTHLY_REWARD_CAP, REFERRED_TRIAL_STATIC, REFERRER_REWARD_CREDITS, REWARD_EXPIRY_DAYS, FREE_MONTH_AFTER } from "../referrals";

const H = 3_600_000;
const D = 24 * H;
const START = new Date("2026-11-10T00:00:00Z"); // free_ads_ways cut-off used by every test (explicit, not env)
const T0 = new Date("2026-12-01T00:00:00Z"); // a trial that finishes after the cut-off
const at = (base: Date, h: number) => new Date(base.getTime() + h * H);

function cand(over: Partial<LifecycleCandidate> = {}): LifecycleCandidate {
  return {
    userId: "u1", email: "jane@yahoo.com", name: "Jane", workspaceId: "w1", adsSignup: true,
    signedUpAt: at(T0, -2), emailVerifiedAt: at(T0, -1.5), paid: false, unsubscribed: false,
    trialRunId: "r1", trialCompletedAt: T0, readyAdCount: 11, sent: [], ...over,
  };
}

/** Runs the 10-minute loop from `from` for `days`, recording sends like the engine does. */
function simulate(c: LifecycleCandidate, from: Date, days: number): Array<{ kind: string; at: Date }> {
  const out: Array<{ kind: string; at: Date }> = [];
  for (let t = from.getTime(); t < from.getTime() + days * D; t += 10 * 60_000) {
    const now = new Date(t);
    const d = dueEmail(c, now, START);
    if (!d) continue;
    c.sent.push({ kind: d.kind, runId: null, at: now });
    out.push({ kind: d.kind, at: now });
  }
  return out;
}

describe("long tail schedule", () => {
  it("has a [from, until) window for every new kind, in order, 6 monthly fresh emails then nothing", () => {
    const s = scheduleFor(cand(), START);
    const want: Array<[string, number, number]> = [["day10_free_ads", 10, 12], ["day14_tip", 14, 16], ["day21_examples", 21, 23], ["day30_checkin", 30, 32], ...FRESH_KINDS.map((k, i): [string, number, number] => [k, 60 + 30 * i, 63 + 30 * i])];
    for (const [kind, from, until] of want) {
      const e = s.find((x) => x.kind === kind);
      expect(e, kind).toBeDefined();
      expect(e?.from.getTime()).toBe(T0.getTime() + from * D);
      expect(e?.until.getTime()).toBe(T0.getTime() + until * D);
      expect(dueEmail(cand(), new Date(T0.getTime() + from * D - 1), START)?.kind).not.toBe(kind);
      expect(dueEmail(cand(), new Date(T0.getTime() + from * D + H), START)?.kind).toBe(kind);
      expect(dueEmail(cand(), new Date(T0.getTime() + until * D), START)).toBeNull();
    }
    expect(FRESH_KINDS).toHaveLength(6);
    expect(Math.max(...LONG_TAIL.map((l) => l.day))).toBe(210);
  });

  it("a full simulated life sends each kind once, keeps MIN_GAP, and the monthly emails stop after 6", () => {
    const c = cand({ sent: [] });
    const sent = simulate(c, at(T0, -2), 240);
    const kinds = sent.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual(["ads_ready", "founder_note", "how_to_run", "offer_24h", "last_chance", "day7_downsell", "day10_free_ads", "day14_tip", "day21_examples", "day30_checkin", ...FRESH_KINDS]);
    for (let i = 1; i < sent.length; i++) {
      const cur = sent[i];
      const prev = sent[i - 1];
      if (!cur || !prev || cur.kind === "last_chance" || cur.kind === "founder_note") continue;
      expect(cur.at.getTime() - prev.at.getTime()).toBeGreaterThanOrEqual(MIN_GAP_MS);
    }
    expect(dueEmail(c, at(T0, 400 * 24), START)).toBeNull();
  });

  it("respects MIN_GAP for long-tail kinds", () => {
    const c = cand({ sent: [{ kind: "gift_ready", runId: null, at: at(T0, 14 * 24 - 1) }] });
    expect(dueEmail(c, at(T0, 14 * 24 + 1), START)).toBeNull();
    expect(dueEmail(c, at(T0, 14 * 24 + 22), START)).toBeNull();
    expect(dueEmail(c, at(T0, 14 * 24 + 23), START)?.kind).toBe("day14_tip");
  });

  it("paid, unsubscribed and test users get no long-tail or nurture email", () => {
    for (const over of [{ paid: true }, { unsubscribed: true }, { email: "e2e+x@gmail.com" }, { email: "ops@komendly.com" }]) {
      const c = cand(over);
      for (const l of LONG_TAIL) expect(dueEmail(c, at(T0, l.day * 24 + 1), START)?.kind).not.toBe(l.kind);
    }
  });
});

describe("free_ads_ways (one-off announcement)", () => {
  const existing = (over: Partial<LifecycleCandidate> = {}) =>
    cand({ signedUpAt: new Date("2026-11-01T00:00:00Z"), emailVerifiedAt: new Date("2026-11-01T00:05:00Z"), trialCompletedAt: new Date("2026-11-01T01:00:00Z"), ...over });

  it("goes once to pre-existing users, spread over 48h after the start", () => {
    const c = existing();
    const sent = simulate(c, START, 20).filter((s) => s.kind === "free_ads_ways");
    expect(sent).toHaveLength(1);
    const first = sent[0];
    expect(first && first.at.getTime() - START.getTime()).toBeLessThan(48 * H + 10 * 60_000);
    const slots = new Set(Array.from({ length: 200 }, (_, i) => spreadSlot(`user-${i}`, 48)));
    expect(slots.size).toBeGreaterThan(30);
  });

  it("does not go to users who sign up after the start (they get day10_free_ads instead)", () => {
    const c = cand();
    const kinds = simulate(c, at(T0, -2), 40).map((s) => s.kind);
    expect(kinds).not.toContain("free_ads_ways");
    expect(kinds).toContain("day10_free_ads");
  });

  it("paid users get free_ads_ways and nothing else", () => {
    const c = existing({ paid: true, trialCompletedAt: new Date("2026-11-09T00:00:00Z") });
    const kinds = simulate(c, START, 240).map((s) => s.kind);
    expect(kinds).toEqual(["free_ads_ways"]);
  });

  it("skips unsubscribed, test and unverified users; never doubles up with day10_free_ads", () => {
    expect(simulate(existing({ unsubscribed: true }), START, 15)).toHaveLength(0);
    expect(simulate(existing({ email: "a@resend.dev" }), START, 15)).toHaveLength(0);
    expect(simulate(existing({ emailVerifiedAt: null, trialRunId: null, trialCompletedAt: null, readyAdCount: 0 }), START, 15)).toHaveLength(0);
    // trial finished 9 days before the start: day10_free_ads falls inside the announcement window, only one goes.
    const c = existing({ trialCompletedAt: at(START, -9 * 24) });
    const kinds = simulate(c, START, 15).map((s) => s.kind);
    expect(kinds.filter((k) => k === "day10_free_ads" || k === "free_ads_ways")).toHaveLength(1);
  });

  it("waits until the 72h launch-offer sequence is over", () => {
    const c = existing({ trialCompletedAt: at(START, -1 * 24) });
    const sent = simulate(c, START, 15);
    const ways = sent.find((s) => s.kind === "free_ads_ways");
    expect(ways && ways.at.getTime()).toBeGreaterThanOrEqual(at(START, 48).getTime());
  });
});

describe("production-like candidate set at deploy", () => {
  // The 10 real users' states: trials done 1-2 days ago, unverified, test accounts, an old paid one, an unsubscribed one.
  const now = at(START, 1);
  const users: LifecycleCandidate[] = [
    cand({ userId: "a", trialCompletedAt: at(now, -26), signedUpAt: at(now, -27), emailVerifiedAt: at(now, -27), sent: [{ kind: "ads_ready", runId: null, at: at(now, -26) }] }),
    cand({ userId: "b", trialCompletedAt: at(now, -47), signedUpAt: at(now, -48), emailVerifiedAt: at(now, -48), sent: [{ kind: "ads_ready", runId: null, at: at(now, -47) }, { kind: "how_to_run", runId: null, at: at(now, -20) }] }),
    cand({ userId: "c", trialCompletedAt: at(now, -30), signedUpAt: at(now, -31), emailVerifiedAt: at(now, -31), sent: [] }),
    cand({ userId: "d", emailVerifiedAt: null, trialRunId: null, trialCompletedAt: null, readyAdCount: 0, signedUpAt: at(now, -3) }),
    cand({ userId: "e", emailVerifiedAt: null, trialRunId: null, trialCompletedAt: null, readyAdCount: 0, signedUpAt: at(now, -0.5) }),
    cand({ userId: "f", email: "e2e-run@komendly.com" }),
    cand({ userId: "g", email: "x@resend.dev" }),
    cand({ userId: "h", paid: true, signedUpAt: at(now, -200), trialCompletedAt: at(now, -199) }),
    cand({ userId: "i", unsubscribed: true, signedUpAt: at(now, -40), trialCompletedAt: at(now, -39) }),
    cand({ userId: "j", trialCompletedAt: at(now, -11 * 24), signedUpAt: at(now, -11 * 24 - 1), emailVerifiedAt: at(now, -11 * 24 - 1), sent: [{ kind: "day7_downsell", runId: null, at: at(now, -4 * 24) }] }),
  ];

  it("yields at most one email per user per tick, over many ticks, and never re-sends a kind", () => {
    const sent = new Map<string, string[]>();
    for (let tick = 0; tick < 6 * 24 * 3; tick++) {
      const t = new Date(now.getTime() + tick * 10 * 60_000);
      const perUser = new Map<string, number>();
      for (const c of users) {
        const d = dueEmail(c, t, START);
        if (!d) continue;
        perUser.set(c.userId, (perUser.get(c.userId) ?? 0) + 1);
        c.sent.push({ kind: d.kind, runId: null, at: t });
        sent.set(c.userId, [...(sent.get(c.userId) ?? []), d.kind]);
      }
      for (const n of perUser.values()) expect(n).toBeLessThanOrEqual(1);
    }
    for (const kinds of sent.values()) expect(new Set(kinds).size).toBe(kinds.length);
    for (const id of ["f", "g", "i"]) expect(sent.get(id) ?? []).toEqual([]);
    // unverified recent sign-ups: only the two code reminders, never the announcement
    expect(sent.get("d")).toEqual(["verify_nudge", "verify_nudge_2"]);
    expect(sent.get("e")).toEqual(["verify_nudge", "verify_nudge_2"]);
    expect(sent.get("h")).toEqual(["free_ads_ways"]);
    // In 3 days: at most the 3 remaining offer emails + the announcement (which waits until the offer closed).
    for (const kinds of sent.values()) expect(kinds.length).toBeLessThanOrEqual(4);
    const c = sent.get("c") ?? [];
    expect(c.indexOf("free_ads_ways")).toBeGreaterThan(c.indexOf("last_chance"));
  });

  it("scheduleStatus lists every kind with a status", () => {
    const rows = scheduleStatus(cand(), at(T0, 15 * 24), START);
    expect(rows.find((r) => r.kind === "day10_free_ads")?.status).toBe("missed");
    expect(rows.find((r) => r.kind === "day14_tip")?.status).toBe("due");
    expect(rows.find((r) => r.kind === "fresh_m6")?.status).toBe("upcoming");
  });
});

describe("long tail copy", () => {
  const ctx = (kind: CopyContext["kind"], over: Partial<CopyContext> = {}): CopyContext => ({
    kind, firstName: "Jane", brandName: "Bloom Bakery", offer: "Fresh sourdough", audience: null, pains: [], headlines: ["Bread worth waking up for"], readyAdCount: 11, offerExpiresAt: null, ...over,
  });
  const kinds = ["day10_free_ads", "day14_tip", "day21_examples", "day30_checkin", "free_ads_ways", ...FRESH_KINDS] as const;

  it("fallbacks pass the validator for every new kind and variant", () => {
    for (const k of kinds) {
      for (const over of [{}, { paid: true }, { agencyLike: true }, { freshAd: true }, { brandName: null, firstName: null }]) {
        const c = ctx(k, over);
        expect(checkCopy(fallbackCopy(c), c), `${k} ${JSON.stringify(over)}`).toBeNull();
      }
    }
  });

  it("prompts carry the right facts", () => {
    expect(buildCopyPrompt(ctx("day10_free_ads"))).toContain("Give 10, get 10");
    expect(buildCopyPrompt(ctx("day30_checkin", { agencyLike: true }))).toContain("Agency");
    expect(buildCopyPrompt(ctx("day30_checkin"))).toContain("Partner program");
    expect(buildCopyPrompt(ctx("fresh_m1", { freshAd: true }))).toContain("locked");
    expect(buildCopyPrompt(ctx("day21_examples"))).toContain("Ad of the week");
  });

  it("rejects the Launch Quarter, invented social proof and claiming a fresh ad that wasn't made", () => {
    const ok = { subject: "Hi", preheader: "x", paragraphs: ["Hi Jane,", "Text."], ctaLabel: "Go" };
    expect(checkCopy({ ...ok, paragraphs: ["Hi", "The Launch Quarter is back."] }, ctx("day14_tip"))).toBe("mentions closed offer");
    expect(checkCopy({ ...ok, paragraphs: ["Hi", "Join 500 businesses using it."] }, ctx("day21_examples"))).toBe("invented social proof");
    expect(checkCopy({ ...ok, paragraphs: ["Hi", "Ozzy made you a new ad."] }, ctx("fresh_m2", { freshAd: false }))).toMatch(/fresh ad/);
    expect(checkCopy({ ...ok, paragraphs: ["Hi", "Ozzy made you a new ad."] }, ctx("fresh_m2", { freshAd: true }))).toBeNull();
    expect(checkCopy({ ...ok, paragraphs: ["Hi", "Starter is $49/month."] }, ctx("day14_tip"))).toBeNull();
  });

  it("detects agency-like sites", () => {
    expect(looksLikeAgency("Full-service digital marketing agency for local brands")).toBe(true);
    expect(looksLikeAgency("Freelance designer")).toBe(true);
    expect(looksLikeAgency("Fresh sourdough every morning")).toBe(false);
  });
});

describe("free ads block, template, click tokens", () => {
  it("referral facts match the referral program constants", () => {
    expect(REFERRAL_FACTS).toEqual({ referredTrial: REFERRED_TRIAL_STATIC, reward: REFERRER_REWARD_CREDITS, expiryDays: REWARD_EXPIRY_DAYS, monthlyCap: MONTHLY_REWARD_CAP, freeMonthAfter: FREE_MONTH_AFTER });
  });

  it("block has the personal link, gift and partner links", () => {
    const b = freeAdsBlock({ referralCode: "jane-k3x9", paid: false });
    expect(b.items.map((i) => i.href)).toEqual(["/r/jane-k3x9", "/ads/gifts", "/partners"]);
    expect(freeAdsBlock({ referralCode: null, paid: true }).items).toHaveLength(2);
  });

  it("renders blocks and the locked hero (escaped) in HTML and text", () => {
    const input = {
      appUrl: "https://www.komendly.com", subject: "S", preheader: "P", paragraphs: ["Hi"], cta: { label: "Go", href: "https://x/y" }, unsubscribeUrl: "https://x/u",
      hero: { src: "https://x/i.jpg", alt: "<b>", href: "https://x/r", caption: "Locked" },
      blocks: [{ title: "Ways to get more free ads", items: [{ text: "Invite", linkLabel: "Your invite link", href: "https://x/r/jane" }] }],
    };
    const html = renderLifecycleHtml(input);
    expect(html).toContain("Ways to get more free ads");
    expect(html).toContain("https://x/r/jane");
    expect(html).toContain("&#60;b&#62;");
    expect(renderLifecycleText(input)).toContain("Your invite link: https://x/r/jane");
  });

  it("click tokens round-trip and only carry app-relative paths", () => {
    const t = signEmailToken({ p: "click", u: "u1", k: "day10_free_ads", l: "/ads/refer?utm_source=email" }, "s");
    expect(verifyEmailToken(t, "s")).toEqual({ p: "click", u: "u1", k: "day10_free_ads", l: "/ads/refer?utm_source=email" });
    expect(verifyEmailToken(t, "other")).toBeNull();
    expect(verifyEmailToken(signEmailToken({ p: "click", u: "u1", k: "x", l: "//evil.com" }, "s"), "s")).toBeNull();
    expect(isSafeAppPath("/\\evil.com")).toBe(false);
    expect(isSafeAppPath("https://evil.com")).toBe(false);
    expect(isSafeAppPath("/r/jane-k3x9")).toBe(true);
  });
});

describe("locked bonus ads never count as free ads", () => {
  const base: CopyContext = { kind: "refreshed_pack", firstName: "Jane", brandName: "Bloom", offer: null, audience: null, pains: [], headlines: [], readyAdCount: 11, offerExpiresAt: null, lockedLabel: "3 Stories versions" };
  it("says 11 free ads plus the locked extras separately", () => {
    for (const kind of ["refreshed_pack", "ads_ready"] as const) {
      const text = fallbackCopy({ ...base, kind }).paragraphs.join(" ");
      expect(text).toContain("11");
      expect(text).toContain("plus 3 Stories versions you can unlock");
      expect(text).not.toContain("14");
    }
    expect(buildCopyPrompt({ ...base, kind: "ads_ready" })).toContain("11 ready free ads");
  });
});
