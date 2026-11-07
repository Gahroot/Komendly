import type { BrandProfile, Prisma } from "@prisma/client";
import { z } from "zod";
import type { Corrections } from "./contracts";

const Sourced = z.object({ text: z.string().max(500), sourceUrl: z.string().max(2048), quote: z.string().max(1000).optional() });

/** Fields a user may edit on /ads/brands/[id]. */
export const BrandUpdateSchema = z.object({
  name: z.string().max(120).optional(),
  colors: z.array(z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{3,8}$/), role: z.string().max(40) })).max(12).optional(),
  fonts: z.array(z.object({ family: z.string().max(80), role: z.string().max(40), sourceUrl: z.string().max(2048).optional() })).max(6).optional(),
  audience: z.string().max(500).optional(),
  mainOffer: z.string().max(500).optional(),
  landingPage: z.string().url().max(2048).optional(),
  voice: z.string().max(500).optional(),
  pains: z.array(Sourced).max(8).optional(),
  proof: z.array(Sourced.extend({ kind: z.enum(["testimonial", "stat", "logo", "award", "other"]) })).max(20).optional(),
  facts: z.array(z.object({ claim: z.string().max(500), sourceUrl: z.string().max(2048), quote: z.string().max(1000) })).max(40).optional(),
});
export type BrandUpdate = z.infer<typeof BrandUpdateSchema>;

function editedMap(profile: Pick<BrandProfile, "userEdited">): Record<string, string> {
  const value = profile.userEdited;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
}

/** Build a BrandProfile update from a partial edit, stamping each changed field in userEdited. */
export function brandUpdateData(profile: Pick<BrandProfile, "userEdited">, update: BrandUpdate, now: Date): Prisma.BrandProfileUpdateInput {
  const edited = { ...editedMap(profile) };
  const data: Prisma.BrandProfileUpdateInput = {};
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) continue;
    edited[key] = now.toISOString();
    (data as Record<string, unknown>)[key] = value;
  }
  data.userEdited = edited;
  return data;
}

/** Map confirm-screen corrections onto the brand profile (pains keep no source: user-provided). */
export function correctionsToBrandUpdate(c: Corrections, landingFallback: string): BrandUpdate {
  return {
    audience: c.audience,
    mainOffer: c.mainOffer,
    landingPage: c.landingPage,
    pains: c.pains?.map((text) => ({ text, sourceUrl: landingFallback, quote: undefined })),
  };
}
