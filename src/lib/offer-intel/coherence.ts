// Page-coherence checker: finds prices, guarantee days, live-in-N-days, founding-spot counts and free-ad counts in our
// own copy that contradict public-offer.ts / billing-config.ts. Pure. Callers supply the text (script reads source
// files, the weekly engine job fetches the live pages and reads lifecycle sources).
import { ADS_PLANS, ADS_TOPUPS, annualPriceCents, BFCM_ANNUAL_PRICES, getPlan, AUTOPILOT_REGULAR_PRICE_CENTS, AUTOPILOT_FIRST_MONTH_CENTS } from "../ads/billing-config";
import { PUBLIC_OFFER } from "../ads/public-offer";

export interface PageText { id: string; text: string }
export interface CoherenceIssue { issueKey: string; page: string; kind: "price" | "guarantee_days" | "live_days" | "spots" | "free_ads"; found: string; expected: string; context: string }

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Every dollar figure that legitimately exists in Stripe/billing config (plans, annual, top-ups, launch prices). */
export function knownPrices(): Set<string> {
  const s = new Set<string>([usd(AUTOPILOT_FIRST_MONTH_CENTS), usd(AUTOPILOT_REGULAR_PRICE_CENTS)]);
  for (const p of ADS_PLANS) { s.add(usd(p.priceCents)); if (p.annualPriceEnv) s.add(usd(annualPriceCents(p))); }
  for (const t of ADS_TOPUPS) s.add(usd(t.priceCents));
  // Black Friday annual prepay prices and the 12-monthly-payments figure they are compared with.
  for (const b of BFCM_ANNUAL_PRICES) { s.add(usd(b.priceCents)); s.add(usd((getPlan(b.plan)?.priceCents ?? 0) * 12)); }
  for (const x of [PUBLIC_OFFER.unlockPrice, PUBLIC_OFFER.diyFirstMonth, PUBLIC_OFFER.diyPrice, PUBLIC_OFFER.heroPrice, PUBLIC_OFFER.heroRegularPrice]) s.add(x);
  return s;
}

const near = (text: string, i: number, len = 60) => text.slice(Math.max(0, i - len), i + len).replace(/\s+/g, " ").trim();

export function checkPage(page: PageText, known: ReadonlySet<string> = knownPrices()): CoherenceIssue[] {
  const t = page.text;
  const out: CoherenceIssue[] = [];
  const add = (kind: CoherenceIssue["kind"], found: string, expected: string, i: number) => out.push({ issueKey: `${page.id}|${kind}|${found}`, page: page.id, kind, found, expected, context: near(t, i) });
  for (const m of t.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    const fig = `$${(m[1] ?? "").replace(/,/g, "")}`.replace(/(\.\d)$/, "$10");
    const norm = fig.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const n = Number((m[1] ?? "").replace(/,/g, ""));
    // small per-unit amounts in comparisons ("$15-60 per ad", "$1/day") are not our prices
    if (n < 5 || known.has(fig) || known.has(norm)) continue;
    if (/\b(per ad|freelancer|agenc|competitor|a month billed|ad spend|\/day|per day|budget)\b/i.test(near(t, m.index ?? 0, 50))) continue;
    add("price", fig, [...known].sort().join(", "), m.index ?? 0);
  }
  for (const m of t.matchAll(/(\d+)[- ]day[^.]{0,40}(refund|money[- ]back|guarantee)|(refund|money[- ]back|guarantee)[^.]{0,40}?(\d+)[- ]days?/gi)) {
    const n = m[1] ?? m[4];
    if (n && Number(n) !== 30) add("guarantee_days", `${n} days`, "30-day refund", m.index ?? 0);
  }
  for (const m of t.matchAll(/(?:live|launched)[^.]{0,50}?within (\d+) days/gi)) if (Number(m[1]) !== 7) add("live_days", `${m[1]} days`, "7 days after connecting Meta", m.index ?? 0);
  for (const m of t.matchAll(/(?:first|only) (\d+) (?:founding |roofing )?(?:businesses|companies|spots)|(\d+) founding spots/gi)) {
    const n = Number(m[1] ?? m[2]);
    if (n !== PUBLIC_OFFER.foundingSpots) add("spots", String(n), `${PUBLIC_OFFER.foundingSpots} founding spots`, m.index ?? 0);
  }
  for (const m of t.matchAll(/(\d+) free ads/gi)) {
    const n = Number(m[1]);
    if (![PUBLIC_OFFER.freeAds, PUBLIC_OFFER.referredFreeAds, 3].includes(n)) add("free_ads", String(n), `${PUBLIC_OFFER.freeAds} (${PUBLIC_OFFER.referredFreeAds} referred)`, m.index ?? 0);
  }
  return out;
}

export function checkCoherence(pages: readonly PageText[]): CoherenceIssue[] {
  const known = knownPrices();
  const seen = new Set<string>();
  return pages.flatMap((p) => checkPage(p, known)).filter((i) => (seen.has(i.issueKey) ? false : (seen.add(i.issueKey), true)));
}

/** Visible text of an HTML page (scripts/styles removed). */
export function htmlToText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
}
