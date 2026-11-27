import { describe, expect, it } from "vitest";
import type { ExperimentDef } from "../../revenue/experiments";
import { assignVariant } from "../../revenue/experiments";
import { DREAM_HEADLINE, DREAM_SUB, OBJECTION_STACK } from "../../ads/dream-copy";
import { AUTOPILOT_GUARANTEE_LINE } from "../../ads/public-offer";
import { lintCopy, PUBLIC_BANNED } from "../copy-lint";
import { OFFER_EXPERIMENTS } from "../variants";
import { MAX_RUNNING_PER_SURFACE, payloadProblems, sanitizePayload } from "../surfaces";
import { validateProposal } from "../validate";
import { anonymise, buildObjectionMap } from "../objections";
import { analysePricing } from "../pricing";
import { checkCoherence, checkPage } from "../coherence";
import { toExperimentDef } from "../agent";

const def = (over: Partial<ExperimentDef> = {}): ExperimentDef => ({ key: "t_one", surface: "autopilot_card", hypothesis: "h", metric: "checkout_started", minPerVariant: 80, variants: [{ id: "control", weight: 1 }, { id: "b", weight: 1, payload: { order: "money_first" } }], ...over });
const ok = { running: [] as ExperimentDef[], reviewApproved: true as boolean | null, flagOn: true };

describe("seeded experiments", () => {
  it("has 4-6, all valid, max 2 per surface, control first, payloads lint clean", () => {
    expect(OFFER_EXPERIMENTS.length).toBeGreaterThanOrEqual(4);
    expect(OFFER_EXPERIMENTS.length).toBeLessThanOrEqual(6);
    const per: Record<string, number> = {};
    for (const d of OFFER_EXPERIMENTS) {
      per[d.surface] = (per[d.surface] ?? 0) + 1;
      expect(d.variants[0]?.payload).toBeUndefined();
      for (const v of d.variants.slice(1)) expect(payloadProblems(d.surface, v.payload), d.key).toEqual([]);
      expect(validateProposal(d, ok).reasons.filter((r) => !/already exists/.test(r)), d.key).toEqual([]);
    }
    for (const n of Object.values(per)) expect(n).toBeLessThanOrEqual(MAX_RUNNING_PER_SURFACE);
  });
  it("assigns deterministically", () => {
    const a = assignVariant("home_headline_outcome_vs_free_first", "visitor-1", OFFER_EXPERIMENTS);
    expect(assignVariant("home_headline_outcome_vs_free_first", "visitor-1", OFFER_EXPERIMENTS)).toEqual(a);
  });
  it("shared copy lint agrees with the public lint on current copy", () => {
    for (const s of [DREAM_HEADLINE, DREAM_SUB, AUTOPILOT_GUARANTEE_LINE, ...OBJECTION_STACK.map((o) => o.answer)]) for (const re of PUBLIC_BANNED) expect(s).not.toMatch(re);
  });
});

describe("lintCopy truth check", () => {
  it("accepts fact tokens and approved numbers", () => expect(lintCopy("Try it for 30 days: {first}, then {monthly}/month. See {freeAds} ads free.").ok).toBe(true));
  it.each([
    ["new price", "Only $47 a month"],
    ["invented number", "Join 500 happy roofers"],
    ["new guarantee", "100% money-back no matter what"],
    ["fake urgency", "Hurry, only 3 spots left"],
    ["result promise", "Get more leads than ever"],
    ["new offer", "Get a free trial and 20% off"],
    ["one-click", "One-click publishing"],
  ])("rejects %s", (_n, t) => expect(lintCopy(t).ok).toBe(false));
  it("allows the existing guarantee line verbatim", () => expect(lintCopy(AUTOPILOT_GUARANTEE_LINE).ok).toBe(true));
});

describe("sanitizePayload", () => {
  it("drops unknown slots, fills tokens, null when unlintable", () => {
    expect(sanitizePayload("unlock_upsell", { firstMonth: "{first} then {monthly}/month", hack: "x" })).toEqual({ firstMonth: "$97 then $297/month" });
    expect(sanitizePayload("unlock_upsell", { firstMonth: "$5 only" })).toBeNull();
    expect(sanitizePayload("nope", { a: "b" })).toBeNull();
  });
});

describe("validateProposal", () => {
  it("auto only with review approval", () => {
    expect(validateProposal(def(), ok).decision).toBe("auto");
    expect(validateProposal(def(), { ...ok, reviewApproved: null }).decision).toBe("needs_owner");
    expect(validateProposal(def(), { ...ok, reviewApproved: false }).decision).toBe("needs_owner");
  });
  it("needs_owner on kill switch off, price change, unknown surface, surface cap, bad metric", () => {
    expect(validateProposal(def(), { ...ok, flagOn: false }).decision).toBe("needs_owner");
    expect(validateProposal(def({ surface: "unlock_upsell", variants: [{ id: "control", weight: 1 }, { id: "b", weight: 1, payload: { firstMonth: "Just $49 first month" } }] }), ok).decision).toBe("needs_owner");
    expect(validateProposal(def({ surface: "checkout_page" }), ok).decision).toBe("needs_owner");
    const running = [def({ key: "a1" }), def({ key: "a2" })];
    expect(validateProposal(def(), { ...ok, running }).reasons.join()).toMatch(/already running/);
    expect(validateProposal(def({ metric: "revenue" }), ok).decision).toBe("needs_owner");
    expect(validateProposal(def({ minPerVariant: 10 }), ok).decision).toBe("needs_owner");
  });
  it("control must have no payload", () => expect(validateProposal(def({ variants: [{ id: "control", weight: 1, payload: { order: "default" } }, { id: "b", weight: 1, payload: { order: "money_first" } }] }), ok).decision).toBe("needs_owner"));
  it("toExperimentDef adds a control and drops empty slots", () => {
    const d = toExperimentDef({ key: "My Key!", surface: "autopilot_card", lever: "time_delay", hypothesis: "h", rationale: "r", metric: "checkout_started", minPerVariant: 80, variant: { id: "B", payload: { headline: "", sub: "", title: "", lead: "", firstMonth: "", cta: "", intro: "", order: "money_first", guaranteePlacement: "" } } });
    expect(d.key).toBe("my_key_");
    expect(d.variants[0]).toEqual({ id: "control", weight: 1 });
    expect(d.variants[1]?.payload).toEqual({ order: "money_first" });
  });
});

describe("objection map", () => {
  it("counts themes and anonymises quotes", () => {
    const m = buildObjectionMap([
      { source: "email_replied", text: "Too expensive for me, email bob@x.com or call 555-123-4567" },
      { source: "churn_reason", text: "Facebook setup is too complicated" },
      { source: "email_replied", text: "Is this a scam? my name is John Smith" },
      { source: "email_replied", text: "ok" },
    ]);
    expect(m.total).toBe(3);
    expect(m.themes.find((t) => t.theme === "price")?.count).toBe(1);
    expect(m.themes.find((t) => t.theme === "complexity")?.count).toBe(1);
    const all = m.themes.flatMap((t) => t.quotes).join(" ");
    expect(all).not.toMatch(/bob@x\.com|555-123|John Smith/);
  });
  it("anonymise trims", () => expect(anonymise("a ".repeat(200)).length).toBeLessThanOrEqual(160));
});

describe("pricing analysis", () => {
  it("is read-only maths with labelled assumptions and flags better models", () => {
    const r = analysePricing(null);
    expect(r.inputs.source).toBe("assumed");
    expect(r.results.length).toBeGreaterThanOrEqual(6);
    for (const x of r.results) { expect(Number.isFinite(x.payback30)).toBe(true); expect(x.uncertainty).toBeTruthy(); }
    for (const d of r.decisions) expect(d.body).toMatch(/Nothing changes until you decide/);
  });
});

describe("coherence", () => {
  it("flags wrong price, refund days, spots, free ads; passes true facts", () => {
    const bad = checkCoherence([{ id: "p", text: "Join for $147 a month. 14-day money-back guarantee. First 25 founding spots. Get 50 free ads. Live within 3 days of connecting." }]);
    expect(bad.map((i) => i.kind).sort()).toEqual(["free_ads", "guarantee_days", "live_days", "price", "spots"]);
    expect(checkPage({ id: "p", text: "$97 your first month, then $297/month. Regular $497/month. $9 unlock. 30-day full refund. 10 founding spots. 10 free ads. Live within 7 days." })).toEqual([]);
  });
  it("dedupes by issue key", () => expect(checkCoherence([{ id: "p", text: "$147 and again $147" }])).toHaveLength(1));
});
