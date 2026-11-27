// Cheap, pure regression guards for business-critical rules in CLAUDE.md. Static reads of the repo; no DB, no network.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTOPILOT_PRICE_CENTS, AUTOPILOT_REGULAR_PRICE_CENTS, AUTOPILOT_FIRST_MONTH_CENTS, AD_DEPARTMENT_PRICE_CENTS, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { AUTOPILOT_GUARANTEE_LINE, PUBLIC_OFFER } from "@/lib/ads/public-offer";
import { APPROVED_GUARANTEE_TEXTS } from "@/lib/offer-intel/facts";
import { PUBLIC_BANNED } from "@/lib/offer-intel/copy-lint";
import { unlockEmail, UNLOCK_KINDS } from "@/lib/ads/lifecycle/unlock-emails";
import { founderNote } from "@/lib/ads/lifecycle/founder";
import { GROWTH_SYSTEMS } from "@/lib/growth/systems";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    if (f === "node_modules" || f === "__tests__") return [];
    const rel = path.join(dir, f);
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel, ext) : ext.test(f) ? [rel] : [];
  });
}
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

describe("credit packs", () => {
  it("create the CreditPurchase row (unique stripePaymentId) before incrementing minutes, never an upsert", () => {
    const src = read("src/lib/credit-fulfilment.ts");
    const create = src.indexOf("creditPurchase.create(");
    const inc = src.indexOf("bonusMinutes: { increment: input.minutes");
    expect(create).toBeGreaterThan(-1);
    expect(inc).toBeGreaterThan(create);
    expect(src).not.toMatch(/creditPurchase\.upsert/);
    expect(read("prisma/schema.prisma")).toMatch(/stripePaymentId\s+String\s+@unique/);
  });
});

describe("webhooks", () => {
  const routes = walk("src/app/api", /^route\.ts$/).filter((f) => /webhook|inbound\/resend/.test(f));
  it("finds the known webhook routes", () => expect(routes.length).toBeGreaterThanOrEqual(7));
  for (const f of routes) {
    it(`${f} reads the raw body (request.text) before verifying`, () => {
      const full = read(f);
      const s = full.slice(Math.max(0, full.search(/export (async )?function POST/)));
      const text = s.search(/\.text\(\)/);
      const verify = s.search(/constructEvent|verify\w*\(|createHmac/);
      expect(text).toBeGreaterThan(-1);
      if (verify > -1) expect(text).toBeLessThan(verify);
    });
  }
});

describe("middleware publicPrefixes", () => {
  const mw = read("src/middleware.ts");
  const block = /const publicPrefixes = \[([\s\S]*?)\n\];/.exec(mw)?.[1] ?? "";
  const prefixes = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
  const covered = (p: string) => prefixes.some((x) => p.startsWith(x));
  const apiPath = (f: string) => "/" + path.dirname(f).replace(/^src\/app\//, "").replace(/\[[^\]]+\]/g, "x") + "/";
  const routes = walk("src/app/api", /^route\.ts$/);
  it("covers cron, inbound, billing/leads/Meta webhooks and Shopify/Jobber callbacks", () => {
    for (const f of routes.filter((r) => /\/cron\/|webhook|inbound\/resend|\/meta-webhooks\//.test(r) && !r.includes("/webhooks/"))) {
      expect(covered(apiPath(f)), apiPath(f)).toBe(true);
    }
  });
  it("FAL + video-status webhooks are public and fail closed without a secret (S-07)", () => {
    expect(covered("/api/webhooks/fal/")).toBe(true);
    expect(read("src/app/api/webhooks/fal/route.ts")).toMatch(/if \(!webhookSecret\)[\s\S]{0,200}503/);
    expect(read("src/app/api/webhooks/video-status/route.ts")).toMatch(/if \(!webhookSecret\)[\s\S]{0,200}503/);
  });
});

describe("Dockerfile whitelists exist for engine and kly", () => {
  it("both have a dockerfile-shared guard test", () => {
    expect(read("engine/test/dockerfile-shared.test.ts")).toContain("COPY");
    expect(read("kly/test/dockerfile-shared.test.ts")).toContain("COPY");
  });
});

describe("page titles", () => {
  it("never append ' | Komendly' (the root template does)", () => {
    const bad = walk("src/app", /\.(ts|tsx)$/).filter((f) => /^ {0,2}title:\s*[`"'][^`"'\n]*\|\s*Komendly[`"']/m.test(read(f)));
    expect(bad).toEqual([]);
  });
});

describe("price constants agree", () => {
  it("public offer strings derive from billing-config", () => {
    expect(PUBLIC_OFFER.heroPrice).toBe(usd(AUTOPILOT_PRICE_CENTS));
    expect(PUBLIC_OFFER.heroRegularPrice).toBe(usd(AUTOPILOT_REGULAR_PRICE_CENTS));
    expect(PUBLIC_OFFER.diyPrice).toBe(usd(AD_DEPARTMENT_PRICE_CENTS));
    expect(PUBLIC_OFFER.unlockPrice).toBe(usd(UNLOCK_PACK.priceCents));
    expect(AUTOPILOT_PRICE_CENTS).toBeLessThan(AUTOPILOT_REGULAR_PRICE_CENTS);
    expect(AUTOPILOT_FIRST_MONTH_CENTS).toBeLessThan(AUTOPILOT_PRICE_CENTS);
  });
  it("no hard-coded stale price of the old plans on public pages", () => {
    const pricing = [read("src/lib/ads/public-offer.ts")].join("\n");
    expect(pricing).not.toMatch(/\$(147|247)\b/);
  });
});

describe("guarantee wording", () => {
  it("the autopilot guarantee line is the approved one and promises no results", () => {
    expect(APPROVED_GUARANTEE_TEXTS).toContain(AUTOPILOT_GUARANTEE_LINE);
    expect(AUTOPILOT_GUARANTEE_LINE).toMatch(/can't promise leads or sales/);
    expect(AUTOPILOT_GUARANTEE_LINE).toMatch(/30-day full refund/);
  });
});

describe("lifecycle email builders", () => {
  const unsub = "https://komendly.com/api/ads/email-unsubscribe?t=x";
  const outputs = [
    ...UNLOCK_KINDS.flatMap((kind) => [true, false].map((open) => unlockEmail({ kind, firstName: "Sam", brandName: "Acme", packUrl: "https://k/p", offerUrl: "https://k/o", pricingUrl: "https://k/pr", unsubscribeUrl: unsub, autopilotOpen: open, diyFirstMonthOpen: open }))),
    founderNote({ firstName: "Sam", brandName: "Acme", readyAdCount: 10, runUrl: "https://k/r", unsubscribeUrl: unsub }),
  ];
  it("contain no banned promise phrases and always an unsubscribe link", () => {
    for (const o of outputs) {
      const all = `${o.subject}\n${o.text}`;
      for (const re of PUBLIC_BANNED) expect(re.test(all), `${re} in ${o.subject}`).toBe(false);
      expect(all).not.toMatch(/guarantee[ds]? (results|growth|customers)|skyrocket|never miss a lead/i);
      expect(o.text).toContain(unsub);
    }
  });
});

describe("feature flags", () => {
  it("every systemEnabled(db, key) key used in code is registered in systems.ts", () => {
    const registered = new Set<string>(GROWTH_SYSTEMS.map((s) => s.key));
    const used = new Set<string>();
    for (const dir of ["src", "engine/src", "kly/src"]) {
      for (const f of walk(dir, /\.(ts|tsx)$/)) for (const m of read(f).matchAll(/systemEnabled\(\s*[\w.]+,\s*"([a-z_]+)"/g)) used.add(m[1] ?? "");
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((k) => !registered.has(k))).toEqual([]);
  });
});
