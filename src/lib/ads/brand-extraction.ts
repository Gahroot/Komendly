// "Generate more" skips extraction: rebuild the run's extraction from the saved brand profile
// (user edits win), filling fields the profile doesn't store from the brand's latest extraction.
import type { BrandProfile } from "@prisma/client";
import { ExtractionSchema, type Extraction } from "./contracts";

type Goal = Extraction["suggestedGoal"];

function arr<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) && value.length > 0 ? (value as T[]) : fallback;
}

/** Returns null when neither the profile nor a previous extraction gives a valid brief. */
export function extractionFromBrand(brand: BrandProfile, previous: unknown, url: string, goalHint: Goal = "leads"): Extraction | null {
  const prev = ExtractionSchema.safeParse(previous);
  const p = prev.success ? prev.data : null;
  const candidate = {
    url: p?.url ?? brand.url ?? url,
    domain: brand.domain,
    brandName: brand.name ?? p?.brandName ?? brand.domain,
    audience: brand.audience ?? p?.audience ?? "",
    mainOffer: brand.mainOffer ?? p?.mainOffer ?? "",
    pains: arr(brand.pains, p?.pains ?? []),
    proof: arr(brand.proof, p?.proof ?? []),
    facts: arr(brand.facts, p?.facts ?? []),
    landingPage: brand.landingPage ?? p?.landingPage ?? url,
    suggestedGoal: p?.suggestedGoal ?? goalHint,
    voice: brand.voice ?? p?.voice,
    colors: arr(brand.colors, p?.colors ?? []),
    fonts: arr(brand.fonts, p?.fonts ?? []),
    logoKey: brand.logoKey ?? p?.logoKey ?? null,
    assets: arr(brand.assets, p?.assets ?? []),
  };
  const parsed = ExtractionSchema.safeParse(candidate);
  if (!parsed.success || !parsed.data.audience || !parsed.data.mainOffer) return null;
  return parsed.data;
}
