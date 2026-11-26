// Trade picker + trade-specific /free-ads headline variants (Hormozi: name the outcome AND the person).
// Light on purpose (no playbook data): imported by the client form. Playbook-backed hero: free-ads-trade-hero.ts.
import { OTHER_TRADE } from "../ads/lead-qualify";

export interface FreeAdsTrade {
  /** Industry / playbook slug (matches /ad-examples/<slug> and the kmd_trade cookie). */
  slug: string;
  /** Short label in the picker. */
  label: string;
  /** "Free Facebook ads for your roofing company, made from your website" */
  headline: string;
  /** Title/description noun: "roofing companies". */
  who: string;
}

/** Top trades first (the order of the picker). roofers keeps its dedicated page at /free-ads/roofers. */
export const FREE_ADS_TRADES: readonly FreeAdsTrade[] = [
  { slug: "roofers", label: "Roofing", who: "roofing companies", headline: "Free Facebook ads for your roofing company, made from your website" },
  { slug: "plumbers", label: "Plumbing", who: "plumbing companies", headline: "Free Facebook ads for your plumbing company, made from your website" },
  { slug: "hvac", label: "HVAC", who: "HVAC companies", headline: "Free Facebook ads for your HVAC company, made from your website" },
  { slug: "landscapers", label: "Landscaping / lawn care", who: "landscaping companies", headline: "Free Facebook ads for your landscaping business, made from your website" },
  { slug: "cleaning-services", label: "Cleaning", who: "cleaning companies", headline: "Free Facebook ads for your cleaning business, made from your website" },
  { slug: "electricians", label: "Electrician", who: "electricians", headline: "Free Facebook ads for your electrical business, made from your website" },
  { slug: "pest-control", label: "Pest control", who: "pest control companies", headline: "Free Facebook ads for your pest control company, made from your website" },
  { slug: "painters", label: "Painting", who: "painting companies", headline: "Free Facebook ads for your painting company, made from your website" },
];

export const GENERIC_HEADLINE = "Free Facebook ads for your business, made from your website";
export const OTHER_LABEL = "Something else";

export function freeAdsTrade(slug: string | null | undefined): FreeAdsTrade | null {
  return FREE_ADS_TRADES.find((t) => t.slug === slug) ?? null;
}

/** Trades with a generated /free-ads/<slug> page (roofers has its own hand-written page). */
export const GENERATED_TRADE_SLUGS: readonly string[] = FREE_ADS_TRADES.filter((t) => t.slug !== "roofers").map((t) => t.slug);

/** Picker options: top trades, then "other". */
export function pickerOptions(): Array<{ value: string; label: string }> {
  return [...FREE_ADS_TRADES.map((t) => ({ value: t.slug, label: t.label })), { value: OTHER_TRADE, label: OTHER_LABEL }];
}

/** A picker value (or cookie) -> a known trade slug / "other" / null. */
export function normalizePicked(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return v === OTHER_TRADE || freeAdsTrade(v) ? v : null;
}
