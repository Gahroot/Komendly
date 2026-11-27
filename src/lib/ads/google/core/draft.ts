// Draft builder: ad pack copy + site extraction -> RSA headlines/descriptions/paths, keywords and a budget suggestion.
// Every output passes the limits (see text.ts); the user edits it and the server re-validates on publish.
import { LIMITS, type KeywordPick, type SearchCopy } from "./types";
import { dedupe, descriptionText, headlineText, keywordText, pathText } from "./text";

export interface DraftAdInput { headline?: string | null; body?: string | null; cta?: string | null }
export interface DraftRunInput {
  brandName: string;
  landingPage: string;
  mainOffer?: string | null;
  audience?: string | null;
  services?: string[];
  location?: string | null; // "Austin, TX"
  facts?: string[];
}

const GENERIC_HEADLINES = ["Visit Our Website", "Get in Touch Today", "See What We Offer", "Talk to Our Team", "Learn More Online"];
const GENERIC_DESCRIPTIONS = [
  "Visit our website to see what we offer and get in touch with our team.",
  "Have a question? Reach out today and we will get back to you.",
];

/** City part of a location string ("Austin, TX" -> "Austin"). */
export function cityOf(location: string | null | undefined): string | null {
  const c = (location ?? "").split(",")[0]?.trim();
  return c && c.length <= 40 ? c : null;
}

function titleCase(s: string): string {
  return s.replace(/\b(\p{Ll})(\p{L}*)/gu, (_m, a: string, b: string) => a.toUpperCase() + b);
}

/** Split the main offer into service-like phrases ("roof repair, gutters and inspections"). */
export function servicesFrom(run: DraftRunInput): string[] {
  const direct = (run.services ?? []).map((s) => s.trim()).filter(Boolean);
  if (direct.length) return dedupe(direct).slice(0, 8);
  const offer = (run.mainOffer ?? "").replace(/\(.*?\)/g, "");
  return dedupe(offer.split(/,|;| and | & |\//i).map((s) => s.trim()).filter((s) => s.split(/\s+/).length <= 4 && s.length >= 3)).slice(0, 6);
}

export function draftSearchCopy(run: DraftRunInput, ads: DraftAdInput[]): SearchCopy {
  const brand = headlineText(run.brandName, LIMITS.headline);
  const city = cityOf(run.location);
  const services = servicesFrom(run);
  const candidates: string[] = [];
  if (brand) candidates.push(brand);
  for (const a of ads) candidates.push(headlineText(a.headline));
  for (const s of services) {
    candidates.push(headlineText(titleCase(s)));
    if (city) candidates.push(headlineText(`${titleCase(s)} in ${city}`));
  }
  if (city && brand) candidates.push(headlineText(`${brand} ${city}`));
  if (city) candidates.push(headlineText(`Serving ${city}`));
  for (const a of ads) if (a.cta) candidates.push(headlineText(titleCase(a.cta)));
  for (const a of ads) if (a.body) candidates.push(headlineText(a.body.split(/[.!?]/)[0]));
  if (brand) candidates.push(headlineText(`Contact ${brand}`));
  let headlines = dedupe(candidates.filter((h) => h.length >= 3)).slice(0, LIMITS.headlinesMax);
  if (headlines.length < 8) headlines = dedupe([...headlines, ...GENERIC_HEADLINES.map((h) => headlineText(h))]).slice(0, Math.max(8, headlines.length));

  const dCand: string[] = [];
  for (const a of ads) if (a.body) dCand.push(descriptionText(a.body));
  if (run.mainOffer) dCand.push(descriptionText(`${run.brandName}: ${run.mainOffer}`));
  for (const f of run.facts ?? []) dCand.push(descriptionText(f));
  if (city && services[0]) dCand.push(descriptionText(`${titleCase(services[0])} for homes and businesses in ${city}. Get in touch today.`));
  let descriptions = dedupe(dCand.filter((d) => d.length >= 10)).slice(0, LIMITS.descriptionsMax);
  if (descriptions.length < LIMITS.descriptionsMin) descriptions = dedupe([...descriptions, ...GENERIC_DESCRIPTIONS.map((d) => descriptionText(d))]).slice(0, LIMITS.descriptionsMax);

  const path1 = pathText(services[0] ?? run.brandName);
  const path2 = city ? pathText(city) : "";
  return { headlines, descriptions, path1, path2: path1 && path2 !== path1 ? path2 : "" };
}

/** Phrase/exact keywords from services (+ city). Ideas from KeywordPlanIdeaService, when available, are appended as phrase. */
export function draftKeywords(run: DraftRunInput, ideas: string[] = []): KeywordPick[] {
  const city = cityOf(run.location)?.toLowerCase();
  const out: KeywordPick[] = [];
  const add = (t: string, match: KeywordPick["match"]) => {
    const text = keywordText(t);
    if (text.length >= 3 && !out.some((k) => k.text === text && k.match === match)) out.push({ text, match });
  };
  for (const s of servicesFrom(run)) {
    add(s, "PHRASE");
    if (city) {
      add(`${s} ${city}`, "PHRASE");
      add(`${s} ${city}`, "EXACT");
    }
    add(`${s} near me`, "PHRASE");
  }
  for (const i of ideas.slice(0, 10)) add(i, "PHRASE");
  if (!out.length) add(run.brandName, "PHRASE");
  return out.slice(0, 30);
}

/** Daily budget suggestion + floor in the account currency (major units). Unknown currencies use the USD numbers. */
const BUDGETS: Record<string, { suggested: number; min: number }> = {
  USD: { suggested: 20, min: 5 }, CAD: { suggested: 25, min: 7 }, AUD: { suggested: 30, min: 8 }, NZD: { suggested: 30, min: 8 },
  EUR: { suggested: 20, min: 5 }, GBP: { suggested: 15, min: 4 }, CHF: { suggested: 20, min: 5 }, SGD: { suggested: 25, min: 7 },
  SEK: { suggested: 200, min: 50 }, NOK: { suggested: 200, min: 50 }, DKK: { suggested: 150, min: 35 }, PLN: { suggested: 80, min: 20 },
  JPY: { suggested: 3000, min: 750 }, INR: { suggested: 1500, min: 400 }, BRL: { suggested: 100, min: 25 }, MXN: { suggested: 350, min: 90 },
  ZAR: { suggested: 350, min: 90 }, AED: { suggested: 75, min: 20 }, HKD: { suggested: 150, min: 40 },
};

export function budgetSuggestion(currency: string | null | undefined): { suggestedDaily: number; currency: string; min: number } {
  const cur = (currency || "USD").toUpperCase();
  const b = BUDGETS[cur] ?? BUDGETS.USD!;
  return { suggestedDaily: b.suggested, currency: cur, min: b.min };
}

export function toMicros(major: number): number {
  return Math.round(major * 100) * 10_000; // round to cents, then micros (Google requires multiples of the currency's minor unit)
}
