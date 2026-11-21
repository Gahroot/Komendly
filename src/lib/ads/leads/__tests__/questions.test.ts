import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../../industries";
import { answerText, leadFormQuestions, Q_KEYS, questionLabel, TRADE_QUESTION_NICHES } from "../questions";

describe("per-trade lead-form questions", () => {
  it("asks home-service trades service, homeowner, timeline and ZIP", () => {
    const s = leadFormQuestions("roofers");
    expect(s.niche).toBe("roofers");
    expect(s.questions.map((q) => q.key ?? q.type)).toEqual([Q_KEYS.service, Q_KEYS.homeowner, Q_KEYS.timeline, "ZIP", "FULL_NAME", "EMAIL"]);
    expect(s.questions[0]!.options!.map((o) => o.value)).toContain("Storm damage inspection");
  });
  it("uses an urgent timeline for emergency trades and new/returning for venues", () => {
    expect(leadFormQuestions("plumbers").questions.find((q) => q.key === Q_KEYS.timeline)!.options![0]!.value).toBe("Today");
    expect(leadFormQuestions("dentists").questions.some((q) => q.key === Q_KEYS.visit)).toBe(true);
    expect(leadFormQuestions("dentists").questions.some((q) => q.key === Q_KEYS.homeowner)).toBe(false);
  });
  it("falls back to a generic set and only adds phone on request", () => {
    const g = leadFormQuestions(null);
    expect(g.niche).toBe("generic");
    expect(g.questions.some((q) => q.type === "PHONE")).toBe(false);
    expect(leadFormQuestions("roofers", { includePhone: true }).questions.at(-1)!.type).toBe("PHONE");
  });
  it("only keys known Komendly niches, with unique option keys", () => {
    const slugs = new Set(INDUSTRIES.map((i) => i.slug));
    for (const n of TRADE_QUESTION_NICHES) {
      expect(slugs.has(n), n).toBe(true);
      for (const q of leadFormQuestions(n).questions) {
        const keys = (q.options ?? []).map((o) => o.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });
  it("maps answers back to labels", () => {
    expect(questionLabel(Q_KEYS.timeline)).toBe("When do you need this done?");
    expect(questionLabel("zip_code")).toBe("ZIP");
    expect(answerText(["yes_i_own_it"])).toBe("Yes, I own it");
    expect(answerText(["a_b@x.com"])).toBe("a_b@x.com");
  });
});
