// Pure funnel-check logic (no Next/Prisma/network): shared by scripts/funnel-smoke.ts and /api/cron/funnel-monitor.
import { PUBLIC_OFFER } from "./ads/public-offer";
import { UNLOCK_PACK, AUTOPILOT_PRICE_CENTS, AUTOPILOT_LAUNCH_OFF_CENTS } from "./ads/billing-config";

export interface CheckResult { name: string; ok: boolean; detail: string }

export interface PageSpec {
  path: string;
  /** Accepted HTTP statuses (a redirect is not followed). */
  statuses: number[];
  /** Text that must appear (case-insensitive) in the 200 body. */
  text?: RegExp[];
  /** For redirects: the Location must match. */
  location?: RegExp;
  /** Prices (e.g. "$297") that must appear in the body. */
  prices?: string[];
}

export const PAGE_SPECS: PageSpec[] = [
  { path: "/", statuses: [200], text: [/ozzy/i] },
  { path: "/free-ads", statuses: [200], text: [/free/i, /\b10\b/] },
  { path: "/free-ads/roofers", statuses: [200], text: [/roof/i] },
  { path: "/free-ads/plumbers", statuses: [200], text: [/plumb/i] },
  { path: "/pricing", statuses: [200], text: [/quotes/i], prices: [PUBLIC_OFFER.heroPrice, PUBLIC_OFFER.heroRegularPrice] },
  { path: "/ads/team", statuses: [200, 307, 302], location: /\/ads\/login/ },
  { path: "/developers/api", statuses: [200], text: [/api/i] },
  { path: "/for/agencies", statuses: [200], text: [/client/i] },
  { path: "/compare", statuses: [200], text: [/compared/i] },
  { path: "/results", statuses: [200], text: [/customer results/i] },
  { path: "/robots.txt", statuses: [200], text: [/sitemap:/i] },
  { path: "/llms.txt", statuses: [200], text: [/komendly/i] },
];

/** Routes that must be listed in sitemap.xml. */
export const SITEMAP_MUST_INCLUDE = ["/free-ads", "/free-ads/roofers", "/free-ads/plumbers", "/compare", "/for/agencies"];

/** Same patterns as src/lib/__tests__/public-copy-lint.test.ts. */
export const BANNED_PROMISES: RegExp[] = [/guarantee[ds]? (leads|sales|revenue|roi)/i, /\bget \d+ (leads|customers|sign-?ups|appointments)/i, /one[- ]click/i];

/** Live copy that trips the broad "one click" pattern but promises no outcome (refund line, editing the plan). */
export const ALLOWED_PHRASES: RegExp[] = [/one click, full refund/gi, /fix anything in one click/gi, /cancel anytime in one click/gi, /one-click Meta publishing/gi];

export interface Fetched { status: number; body: string; location?: string | null }

export function checkPage(spec: PageSpec, r: Fetched | { error: string }): CheckResult[] {
  const name = `page ${spec.path}`;
  if ("error" in r) return [{ name, ok: false, detail: `fetch failed: ${r.error}` }];
  const out: CheckResult[] = [];
  if (!spec.statuses.includes(r.status)) return [{ name, ok: false, detail: `status ${r.status}, wanted ${spec.statuses.join("/")}` }];
  if (r.status >= 300 && r.status < 400) {
    if (spec.location && !spec.location.test(r.location ?? "")) out.push({ name, ok: false, detail: `redirects to ${r.location ?? "(none)"}` });
    else out.push({ name, ok: true, detail: `redirect ${r.location ?? ""}` });
    return out;
  }
  const missing = (spec.text ?? []).filter((re) => !re.test(r.body)).map(String);
  const missingPrices = (spec.prices ?? []).filter((p) => !r.body.includes(p));
  const bad = [...missing.map((m) => `missing text ${m}`), ...missingPrices.map((p) => `missing price ${p} (public-offer)`)];
  out.push({ name, ok: bad.length === 0, detail: bad.length ? bad.join("; ") : `200, ${r.body.length} bytes` });
  const text = r.body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const scanned = ALLOWED_PHRASES.reduce((t, re) => t.replace(re, " "), text);
  const hits = BANNED_PROMISES.map((re) => scanned.match(re)?.[0]).filter((x): x is string => !!x);
  out.push({ name: `copy-lint ${spec.path}`, ok: hits.length === 0, detail: hits.length ? `banned phrase: ${hits.join(" | ")}` : "clean" });
  return out;
}

export function checkSitemap(xml: string, base: string): CheckResult {
  const root = base.replace(/\/$/, "");
  const missing = SITEMAP_MUST_INCLUDE.filter((p) => !xml.includes(`<loc>${root}${p}</loc>`));
  return { name: "sitemap.xml", ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : "all routes listed" };
}

/** Unauthenticated /api/ads-billing/offer: 401 (or 200 with an object) is healthy; anything else is not. */
export function checkOfferApi(status: number, body: string): CheckResult {
  const name = "api /api/ads-billing/offer";
  if (status === 401) return { name, ok: true, detail: "401 (auth required)" };
  if (status === 200) {
    try { const j = JSON.parse(body); return { name, ok: typeof j === "object" && j !== null, detail: "200 json" }; } catch { return { name, ok: false, detail: "200 but not JSON" }; }
  }
  return { name, ok: false, detail: `status ${status}` };
}

// ---- Stripe objects (shapes are the minimal Stripe fields we read) ----
export interface StripePriceLike { active?: boolean; unit_amount?: number | null; deleted?: unknown }
export interface StripeCouponLike { valid?: boolean; amount_off?: number | null; deleted?: unknown }

export function checkStripePrice(label: string, id: string | undefined, p: StripePriceLike | null, wantCents: number): CheckResult {
  const name = `stripe price ${label}`;
  if (!id) return { name, ok: false, detail: "env var not set" };
  if (!p || p.deleted) return { name, ok: false, detail: `${id} not found` };
  if (!p.active) return { name, ok: false, detail: `${id} inactive` };
  if (p.unit_amount !== wantCents) return { name, ok: false, detail: `${id} is ${p.unit_amount} cents, expected ${wantCents}` };
  return { name, ok: true, detail: id };
}

export function checkStripeCoupon(label: string, id: string | undefined, c: StripeCouponLike | null, wantOffCents: number): CheckResult {
  const name = `stripe coupon ${label}`;
  if (!id) return { name, ok: false, detail: "env var not set" };
  if (!c || c.deleted) return { name, ok: false, detail: `${id} not found` };
  if (!c.valid) return { name, ok: false, detail: `${id} no longer valid` };
  if (c.amount_off !== wantOffCents) return { name, ok: false, detail: `${id} takes off ${c.amount_off}, expected ${wantOffCents}` };
  return { name, ok: true, detail: id };
}

export const EXPECTED_CENTS = { unlock: UNLOCK_PACK.priceCents, autopilot: AUTOPILOT_PRICE_CENTS, autopilotCouponOff: AUTOPILOT_LAUNCH_OFF_CENTS };

// ---- DB counts -> problems ----
export interface DbFacts {
  finishedPacks24h: number;
  finishedPacksNoReadyAds24h: number;
  paidUnlocksStillLocked: number;
  signups: number;
  signupsNoPack: number;
  stuckRunning: number;
  stuckQueued: number;
}

export const NO_PACK_RATE_ALERT = 0.7;
export const NO_PACK_MIN_SIGNUPS = 3;

export function checkDb(f: DbFacts): CheckResult[] {
  const rate = f.signups ? f.signupsNoPack / f.signups : 0;
  return [
    { name: "db packs with no ready ads", ok: f.finishedPacksNoReadyAds24h === 0, detail: `${f.finishedPacksNoReadyAds24h} of ${f.finishedPacks24h} finished packs in 24h have 0 ready ads` },
    { name: "db paid unlock still locked", ok: f.paidUnlocksStillLocked === 0, detail: `${f.paidUnlocksStillLocked} paid unlock(s) in 7d whose workspace still reads locked` },
    { name: "db sign-ups with no pack", ok: !(f.signups >= NO_PACK_MIN_SIGNUPS && rate >= NO_PACK_RATE_ALERT), detail: `${f.signupsNoPack}/${f.signups} sign-ups (2-26h old) have no pack (${Math.round(rate * 100)}%)` },
    { name: "db stuck AdJobs", ok: f.stuckRunning === 0 && f.stuckQueued < 5, detail: `${f.stuckRunning} running >30min, ${f.stuckQueued} queued >30min` },
  ];
}

// ---- dedupe + message ----
/** Stable key for one problem (check name only: the detail changes as counts move). */
export const problemKey = (c: CheckResult) => c.name;

export function newProblems(results: readonly CheckResult[], alreadyAlerted: ReadonlySet<string>): CheckResult[] {
  return results.filter((r) => !r.ok && !alreadyAlerted.has(problemKey(r)));
}

export function alertMail(problems: readonly CheckResult[], base: string): { subject: string; text: string } {
  return {
    subject: `Komendly check failed: ${problems.map((p) => p.name).join(", ").slice(0, 120)}`,
    text: `Komendly check failed (${base}):\n\n${problems.map((p) => `- ${p.name}: ${p.detail}`).join("\n")}\n\nThis alert is sent once per problem per day.\n`,
  };
}
