import { describe, expect, it } from "vitest";
import { buildOutboundEmail, checkOutboundEmail, checkVariant, cleanBusinessName, DEFAULT_BODY, DEFAULT_FOLLOWUP, DEFAULT_POSTAL_ADDRESS, DEFAULT_SUBJECT, SEED_COPY, type OutboundCopyContext } from "../copy";
import { nextStep, warmupLimit as wl } from "../policy";

const ctx = (o: Partial<OutboundCopyContext> = {}): OutboundCopyContext => ({
  step: 1,
  businessName: "MCCARRICK ELECTRIC LLC",
  city: "Commerce City",
  niche: "electricians",
  senderName: "Ozzy at Komendly",
  headline: "Panel upgrades done right the first time",
  claimUrl: "https://www.komendly.com/g/abcdefghijklmnopqrstuv",
  unsubscribeUrl: "https://www.komendly.com/u/zyxwvutsrqponmlkjihgfe",
  postalAddress: DEFAULT_POSTAL_ADDRESS,
  ...o,
});

describe("outbound copy", () => {
  it("cleans shouty and glued business names", () => {
    expect(cleanBusinessName("MCCARRICK ELECTRIC LLC")).toBe("McCarrick Electric");
    expect(cleanBusinessName("EVERYDAYPLUMBER.com")).toBe("Everydayplumber");
    expect(cleanBusinessName("JM Electric, Inc.")).toBe("JM Electric");
    expect(cleanBusinessName("Assurance Contractors")).toBe("Assurance Contractors");
    expect(cleanBusinessName("ABC HVAC SERVICES")).toBe("ABC HVAC");
    expect(cleanBusinessName("Henco Plumbing Services")).toBe("Henco Plumbing");
    expect(cleanBusinessName("Witherspoon Rose Culture Service Department")).toBe("Witherspoon Rose Culture");
    expect(cleanBusinessName("Pro Services")).toBe("Pro Services");
  });

  it("every seed passes the gate, with one link, no business name in the subject and no 'Hi there'", () => {
    for (const s of SEED_COPY) {
      expect(checkVariant(s.dimension, s.template), s.key).toBeNull();
      const variant = { [s.dimension]: s.template };
      for (const step of [1, 2] as const) {
        const c = ctx({ step, variant, firstSubject: "made you something" });
        const e = buildOutboundEmail(c);
        expect(checkOutboundEmail(e, c), `${s.key} step ${step}`).toBeNull();
        expect(e.subject).not.toMatch(/mccarrick/i);
        expect(e.text).not.toMatch(/hi there|LLC/i);
      }
    }
  });

  it("allows only 'partner program' / 'partners program', not other uses of partner", () => {
    expect(checkVariant("followup", "Our partner program pays you. {link}")).toBeNull();
    expect(checkVariant("followup", "See the partners program. {link}")).toBeNull();
    expect(checkVariant("followup", "We partner with shops like yours. {link}")).toBe("banned phrase");
    expect(checkVariant("followup", "Be our partner. {link}")).toBe("banned phrase");
    expect(checkVariant("followup", "A partnership awaits. {link}")).toBeNull();
  });

  it("uses the clean name, the Ozzy signature and a compact footer", () => {
    const e = buildOutboundEmail(ctx());
    expect(e.subject).toBe(DEFAULT_SUBJECT);
    expect(e.text.startsWith("Made this for McCarrick Electric")).toBe(true);
    expect(e.text).toContain("Ozzy\nthe ad wizard at Komendly");
    expect(e.text).toContain(`Komendly, ${DEFAULT_POSTAL_ADDRESS}`);
    const n = buildOutboundEmail(ctx({ senderName: "Nolan at Komendly" }));
    expect(n.text).toContain("Nolan\nKomendly");
  });

  it("falls back from the headline body when the ad has no usable headline", () => {
    const body = SEED_COPY.find((s) => s.key === "headline-hook")!.template;
    const e = buildOutboundEmail(ctx({ headline: null, variant: { body } }));
    expect(e.text.startsWith("Made this for McCarrick Electric")).toBe(true);
    expect(checkOutboundEmail(e, ctx({ headline: null }))).toBeNull();
  });

  it("threads the follow-up with a truthful Re:", () => {
    const e = buildOutboundEmail(ctx({ step: 2, firstSubject: "a free gift for you" }));
    expect(e.subject).toBe("Re: a free gift for you");
  });

  it("checkVariant rejects robotic or risky variants", () => {
    expect(checkVariant("subject", DEFAULT_SUBJECT)).toBeNull();
    expect(checkVariant("body", DEFAULT_BODY)).toBeNull();
    expect(checkVariant("followup", DEFAULT_FOLLOWUP)).toBeNull();
    expect(checkVariant("subject", "re: your ad")).toBe("fake reply subject");
    expect(checkVariant("subject", "an ad for {business}")).toMatch(/business/);
    expect(checkVariant("subject", "{price} for you")).toMatch(/unknown placeholder/);
    expect(checkVariant("body", "Hi there, here is {link}")).toBe("banned phrase");
    expect(checkVariant("body", "Hey {business} team, here is {link}")).toMatch(/greeting/);
    expect(checkVariant("body", "two links {link} {link}")).toMatch(/once/);
  });
});

describe("warm-up ramp (3 days)", () => {
  const start = new Date("2026-11-11T00:00:00Z");
  const day = (n: number) => new Date(start.getTime() + (n - 1) * 86_400_000 + 3_600_000);
  it("starts at 10, adds 15 a day, reaches 40 on day 3", () => {
    expect([1, 2, 3, 7, 10].map((d) => wl(start, day(d), 40))).toEqual([10, 25, 40, 40, 40]);
  });
});

describe("nextStep", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const base = { status: "sent", step: 1, repliedAt: null, clickedAt: null, lastSentAt: new Date(now.getTime() - 2 * 86_400_000) };
  it("first email for ready leads", () => {
    expect(nextStep({ ...base, status: "ad_made", step: 0, lastSentAt: null }, now)).toBe(1);
  });
  it("follow-up respects the configured delay", () => {
    expect(nextStep(base, now)).toBeNull(); // default 4 days
    expect(nextStep(base, now, 1 * 86_400_000)).toBe(2);
  });
  it("stops on replies and clicks", () => {
    expect(nextStep({ ...base, repliedAt: now }, now, 0)).toBeNull();
    expect(nextStep({ ...base, status: "clicked" }, now, 0)).toBeNull();
  });
});


import { buildOutboundHtml, emailImageUrl } from "../copy";
describe("html email", () => {
  it("puts the ad + button where the link was, keeps compliance parts, escapes", () => {
    const c = ctx({ businessName: "Bob & Sons <Roofing> LLC" });
    const html = buildOutboundHtml(c, { adImageUrl: "https://www.komendly.com/_next/image?url=x&w=750&q=80", businessName: c.businessName });
    expect(html).toContain("ozzy-email-wave.gif");
    expect(html).toContain("Claim your free ad");
    expect(html).toContain(DEFAULT_POSTAL_ADDRESS);
    expect(html).toContain(c.unsubscribeUrl);
    expect(html).not.toContain("<Roofing>");
    expect(html).toContain("Bob &#38; Sons &#60;Roofing&#62;");
    expect(html.indexOf("Made this for")).toBeLessThan(html.indexOf("<img src=\"https://www.komendly.com/_next/image"));
  });
  it("sizes gift images through Next's optimizer", () => {
    expect(emailImageUrl("https://www.komendly.com/", "/api/ads/gift-public/t/img/a")).toBe("https://www.komendly.com/_next/image?url=%2Fapi%2Fads%2Fgift-public%2Ft%2Fimg%2Fa&w=750&q=75");
  });
});

import { autoPauseReason, sendDayStart, warmupDay } from "../policy";
describe("send day + bounce health", () => {
  it("counts warm-up days in ET calendar days", () => {
    const start = new Date("2026-11-11T20:08:00Z"); // 3:08pm ET
    expect(warmupDay(start, new Date("2026-11-12T03:00:00Z"))).toBe(1); // 10pm ET same day
    expect(warmupDay(start, new Date("2026-11-12T16:10:00Z"))).toBe(2); // 11:10am ET next day
    expect(sendDayStart(new Date("2026-11-12T16:10:00Z")).toISOString()).toBe("2026-11-12T05:00:00.000Z");
    expect(sendDayStart(new Date("2026-11-12T03:00:00Z")).toISOString()).toBe("2026-11-11T05:00:00.000Z");
  });
  it("does not pause on one early bounce, pauses on bursts, real rates and complaints", () => {
    const ok = { bounced: false, complained: false };
    const b = { bounced: true, complained: false };
    expect(autoPauseReason([b, ok, ok, ok, ok, ok, ok])).toBeNull();
    expect(autoPauseReason([b, ...Array(25).fill(ok)])).toBeNull();
    expect(autoPauseReason([b, b, b, ok, ok])).toMatch(/3 bounces/);
    expect(autoPauseReason([b, ...Array(10).fill(ok), b, ...Array(20).fill(ok)])).toBeNull();
    expect(autoPauseReason([b, ...Array(10).fill(ok), b, ...Array(10).fill(ok), b, ...Array(10).fill(ok), b, ...Array(20).fill(ok)])).toMatch(/bounce rate/);
    expect(autoPauseReason([{ bounced: false, complained: true }])).toMatch(/complaint/);
  });
});

import { autoPauseReason as apr, autoResumeDue } from "../policy";
describe("mailbox pause rules (2026-11-12)", () => {
  const sends = (n: number, bouncedIdx: number[]) => Array.from({ length: n }, (_, i) => ({ bounced: bouncedIdx.includes(i), complained: false }));
  it("2 stale website addresses in 27 sends do not pause", () => {
    expect(apr(sends(27, [3, 20]))).toBeNull();
  });
  it("a real pattern still pauses", () => {
    expect(apr(sends(50, [5, 15, 25, 35]))).toMatch(/bounce rate 8\.0%/);
    expect(apr(sends(20, [0, 4, 9]))).toMatch(/3 bounces/);
  });
  it("auto pauses lift after the cool-down; admin pauses never do", () => {
    const t = new Date("2026-11-13T12:00:00Z");
    expect(autoResumeDue("auto: bounce rate 8%", new Date("2026-11-12T11:00:00Z"), t)).toBe(true);
    expect(autoResumeDue("auto: bounce rate 8%", new Date("2026-11-13T00:00:00Z"), t)).toBe(false);
    expect(autoResumeDue("auto: spam complaint (1 in 40)", new Date("2026-11-12T11:00:00Z"), t)).toBe(false);
    expect(autoResumeDue("admin", new Date("2026-11-01T00:00:00Z"), t)).toBe(false);
  });
});

import { buildOutboundEmail as boe, buildOutboundHtml as boh, checkOutboundEmail as coe, checkVariant as cv, SEED_COPY as SEEDS } from "../copy";
describe("gift on click copy", () => {
  const base = { businessName: "Denver Gutter Company", city: "Denver, CO", niche: "gutter installers", senderName: "Ozzy at Komendly", claimUrl: "https://www.komendly.com/g/abc", unsubscribeUrl: "https://www.komendly.com/u/def", postalAddress: "2211 Cole St, Birmingham, MI 48009" };
  const onClick = SEEDS.filter((s) => s.timing === "on-click");
  it("every on-click seed passes the copy rules and never claims the ad already exists", () => {
    expect(onClick.length).toBeGreaterThanOrEqual(6);
    for (const s of onClick) {
      expect(cv(s.dimension, s.template)).toBeNull();
      expect(s.template).not.toMatch(/\bmade (you|this|it|that)\b|your (new )?ad'?s? (is|still)|{headline}/i);
    }
  });
  it("on-click emails pass the final compliance gate", () => {
    for (const body of onClick.filter((s) => s.dimension === "body")) {
      const ctx = { ...base, step: 1 as const, variant: { body: body.template, subject: "want a free ad?" } };
      expect(coe(boe(ctx), ctx)).toBeNull();
    }
    for (const f of onClick.filter((s) => s.dimension === "followup")) {
      const ctx = { ...base, step: 2 as const, variant: { followup: f.template } };
      expect(coe(boe(ctx), ctx)).toBeNull();
    }
  });
  it("the on-click HTML shows the preview card and a draw button", () => {
    const ctx = { ...base, step: 1 as const, variant: { body: onClick.find((s) => s.dimension === "body")!.template } };
    const html = boh(ctx, { adImageUrl: "https://www.komendly.com/api/ads/gift-public/t/preview", businessName: base.businessName, onClick: true });
    expect(html).toContain("Watch Ozzy draw it");
    expect(html).toContain("/preview");
    expect(html).not.toContain("Claim your free ad");
  });
  it("every seed has a timing", () => {
    expect(SEEDS.every((s) => ["any", "prebuilt", "on-click"].includes(s.timing))).toBe(true);
  });
});
