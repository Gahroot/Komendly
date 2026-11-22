// Choices for the "Where, budget, goal" step of the Meta publish flow. Pure, client-safe (web only).
import { PUBLISH_GOALS, type PublishGoal } from "./core/publish";
import { placementLabel } from "./status-types";

export const META_COUNTRIES: readonly { code: string; name: string }[] = [
  { code: "US", name: "United States" }, { code: "CA", name: "Canada" }, { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" }, { code: "AU", name: "Australia" }, { code: "NZ", name: "New Zealand" },
  { code: "DE", name: "Germany" }, { code: "AT", name: "Austria" }, { code: "CH", name: "Switzerland" },
  { code: "FR", name: "France" }, { code: "BE", name: "Belgium" }, { code: "NL", name: "Netherlands" },
  { code: "LU", name: "Luxembourg" }, { code: "ES", name: "Spain" }, { code: "PT", name: "Portugal" },
  { code: "IT", name: "Italy" }, { code: "DK", name: "Denmark" }, { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" }, { code: "FI", name: "Finland" }, { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czechia" }, { code: "GR", name: "Greece" }, { code: "RO", name: "Romania" },
  { code: "MX", name: "Mexico" }, { code: "BR", name: "Brazil" }, { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" }, { code: "CO", name: "Colombia" }, { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" }, { code: "PH", name: "Philippines" }, { code: "MY", name: "Malaysia" },
  { code: "JP", name: "Japan" }, { code: "KR", name: "South Korea" }, { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" }, { code: "IL", name: "Israel" }, { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" }, { code: "KE", name: "Kenya" },
];

export const MAX_COUNTRIES = 25;

/** "en-GB" -> "GB" when it's in our list, else US. */
export function countryFromLocale(locale: string | null | undefined): string {
  let region: string | undefined;
  try {
    region = locale ? new Intl.Locale(locale).maximize().region : undefined;
  } catch {
    region = undefined;
  }
  return region && META_COUNTRIES.some((c) => c.code === region) ? region : "US";
}

// Meta stores budgets in the currency's smallest unit; these currencies have no cents (Meta "offset 1").
const NO_CENTS = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

export function toMinorUnits(major: number, currency: string | null | undefined): number {
  return Math.round(major * (currency && NO_CENTS.has(currency.toUpperCase()) ? 1 : 100));
}

export function fromMinorUnits(minor: number, currency: string | null | undefined): number {
  return minor / (currency && NO_CENTS.has(currency.toUpperCase()) ? 1 : 100);
}

/** Prefilled daily budget per ad set in major units; null when we can't suggest a sensible number for the currency. */
export function suggestedDailyBudget(currency: string | null | undefined): number | null {
  return currency && NO_CENTS.has(currency.toUpperCase()) ? null : 15;
}

export function formatMoney(major: number, currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(major);
  } catch {
    return `${major} ${currency ?? ""}`.trim();
  }
}

export const GOAL_OPTIONS: readonly { value: PublishGoal; label: string; hint: string }[] = [
  { value: "sales", label: "Sales", hint: "People buy on your website." },
  { value: "leads", label: "Leads", hint: "People call, book or fill in a form." },
  { value: "traffic", label: "Website visits", hint: "Send people to your website." },
  { value: "awareness", label: "Get seen", hint: "Show your business to as many people as possible." },
];

/** Run goal -> picker default; auto/app installs fall back to traffic (same as the publisher). */
export function defaultPublishGoal(runGoal: string | null | undefined): PublishGoal {
  return PUBLISH_GOALS.find((g) => g === runGoal) ?? "traffic";
}

/** One ad set per placement group that the chosen sizes use (mirrors core/mapping). */
export function adSetPlan(ads: readonly { ratios: string[] }[], ratios: readonly string[]): { label: string; ratios: string[]; ads: number }[] {
  const groups = new Map<string, { ratios: Set<string>; ads: number }>();
  for (const ad of ads) {
    const seen = new Set<string>();
    for (const r of ad.ratios.filter((x) => ratios.includes(x))) {
      const label = placementLabel(r);
      const g = groups.get(label) ?? { ratios: new Set<string>(), ads: 0 };
      g.ratios.add(r);
      if (!seen.has(label)) { g.ads += 1; seen.add(label); }
      groups.set(label, g);
    }
  }
  return [...groups].map(([label, g]) => ({ label, ratios: [...g.ratios].sort(), ads: g.ads }));
}
