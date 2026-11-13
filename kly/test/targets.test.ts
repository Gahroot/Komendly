import { describe, expect, it } from "vitest";
import { armAudience, checkArmContent, pickArm, seedArms, seededRng } from "../src/arms";
import { nicheSelectors } from "../src/finder";
import { audienceOf, METROS, NICHES } from "../src/targets";

describe("targets", () => {
  it("every niche seed is a valid niche-level segment with OSM selectors", () => {
    const segs = seedArms().filter((a) => a.dimension === "segment");
    expect(segs.length).toBe(NICHES.length);
    for (const s of segs) expect(checkArmContent("segment", s.content), s.key).toBeNull();
    for (const n of NICHES) {
      expect(nicheSelectors(n.niche)).toEqual(n.osm);
      for (const sel of n.osm) expect(sel).not.toContain("\\\\");
    }
    expect(new Set(METROS).size).toBe(METROS.length);
  });

  it("retires the old per-city segment shape", () => {
    expect(checkArmContent("segment", { niche: "roofers", city: "Denver, CO" })).toMatch(/cities/);
  });

  it("includes high-value niches and agencies, and routes agencies to agency copy", () => {
    expect(NICHES.filter((n) => n.tier === "high_value").length).toBeGreaterThanOrEqual(15);
    expect(audienceOf("marketing agencies")).toBe("agency");
    expect(audienceOf("med spas")).toBe("local");
    expect(audienceOf("social media agencies")).toBe("agency");
    const agencyCopy = seedArms().filter((a) => ["subject", "body", "followup"].includes(a.dimension) && armAudience(a.content) === "agency");
    for (const d of ["subject", "body", "followup"]) expect(agencyCopy.some((a) => a.dimension === d), d).toBe(true);
    for (const a of agencyCopy) expect(checkArmContent(a.dimension, a.content), a.key).toBeNull();
  });

  it("pickArm still works across ~40 fresh niches", () => {
    const arms = NICHES.map((n, i) => ({ id: `a${i}`, sends: 0, clicks: 0, positiveReplies: 0, signups: 0, paid: 0, revenueCents: 0 }));
    const rng = seededRng(1);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(pickArm(arms, rng, 20)!.id);
    expect(seen.size).toBeGreaterThan(30);
  });
});

import { overpass } from "../src/finder";
describe("overpass fallback", () => {
  it("falls through failing endpoints and returns the first success", async () => {
    const tried: string[] = [];
    const fetchJson = async (url: string) => {
      tried.push(url);
      if (!url.includes("good")) throw new Error(`${url} 502`);
      return { elements: [1] };
    };
    const r = await overpass("q", fetchJson as never, undefined, ["https://a/bad", "https://b/good", "https://c/bad"]);
    expect(r).toEqual({ elements: [1] });
    expect(tried).toContain("https://b/good");
    await expect(overpass("q", (async () => { throw new Error("down"); }) as never, undefined, ["https://x", "https://y"])).rejects.toThrow("down");
  });
});

import { acceptProposals } from "../src/strategist";
import { judgeImageUrl } from "../src/hook";
describe("night-1 fixes", () => {
  it("strategist segment keys are the niche (no '|undefined')", () => {
    const out = acceptProposals([{ dimension: "segment", key: "x", niche: "Dental Implant Clinics", rationale: "r" } as never], {}, new Set());
    expect(out[0]?.p.key).toBe("dental implant clinics");
    const one = acceptProposals([{ dimension: "segment", key: "x", niche: "pool builders", city: "Phoenix, AZ", rationale: "r" } as never], {}, new Set());
    expect(one[0]?.p.key).toBe("pool builders|Phoenix, AZ");
  });
  it("the judge gets a resized copy of the gift image", () => {
    expect(judgeImageUrl("https://www.komendly.com/api/ads/gift-public/t/img/a")).toBe("https://www.komendly.com/_next/image?url=%2Fapi%2Fads%2Fgift-public%2Ft%2Fimg%2Fa&w=1080&q=75");
  });
});

import { defaultHasMx } from "../src/finder";
describe("MX guard", () => {
  it("rejects a domain that cannot exist, accepts a real one", async () => {
    expect(await defaultHasMx("no-such-domain-kly-test-8c1f.invalid")).toBe(false);
    expect(await defaultHasMx("getkomendly.com")).toBe(true);
  });
});

import { armTiming } from "../src/arms";
import { timingOf } from "../src/hook";
import { isOnClickLead } from "../src/sender";
describe("gift timing", () => {
  it("seeds the two-way timing test and valid copy arms", () => {
    const seeds = seedArms();
    expect(seeds.filter((a) => a.dimension === "gift_timing").map((a) => a.key).sort()).toEqual(["on-click", "prebuilt"]);
    for (const a of seeds) expect(checkArmContent(a.dimension, a.content)).toBeNull();
  });
  it("unmarked copy is treated as prebuilt", () => {
    expect(armTiming({ template: "x" })).toBe("prebuilt");
    expect(armTiming({ timing: "any" })).toBe("any");
    expect(timingOf({ timing: "on-click" })).toBe("on-click");
    expect(checkArmContent("gift_timing", { timing: "later" })).toMatch(/timing/);
  });
  it("an on-click lead has a gift page but no ad", () => {
    const note = "on-click: Ozzy draws the ads when the prospect opens the link";
    expect(isOnClickLead({ adId: null, giftToken: "t", qualityNotes: note })).toBe(true);
    expect(isOnClickLead({ adId: "a", giftToken: "t", qualityNotes: note })).toBe(false);
    expect(isOnClickLead({ adId: null, giftToken: "t", qualityNotes: "fine" })).toBe(false);
  });
});
