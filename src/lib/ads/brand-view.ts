import type { BrandProfile } from "@prisma/client";
import type { BrandSummary } from "./run-types";

function colorsOf(value: unknown): { hex: string; role: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is { hex: string; role: string } => typeof c?.hex === "string" && typeof c?.role === "string");
}

export function brandSummary(b: BrandProfile): BrandSummary {
  return {
    id: b.id,
    domain: b.domain,
    name: b.name,
    url: b.url,
    colors: colorsOf(b.colors),
    updatedAt: b.updatedAt.toISOString(),
    logoUrl: b.logoKey ? `/api/ads/brands/${b.id}/logo` : null,
  };
}

/** Full editable profile for /ads/brands/[id]. */
export function brandDetail(b: BrandProfile) {
  return {
    ...brandSummary(b),
    fonts: Array.isArray(b.fonts) ? b.fonts : [],
    audience: b.audience ?? "",
    mainOffer: b.mainOffer ?? "",
    landingPage: b.landingPage ?? b.url,
    voice: b.voice ?? "",
    pains: Array.isArray(b.pains) ? b.pains : [],
    proof: Array.isArray(b.proof) ? b.proof : [],
    facts: Array.isArray(b.facts) ? b.facts : [],
    userEdited: b.userEdited && typeof b.userEdited === "object" ? b.userEdited : {},
  };
}
export type BrandDetail = ReturnType<typeof brandDetail>;
