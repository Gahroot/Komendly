// Builds the editable Google draft for a run: search text, keywords, budget, images. Pure DB + core draft helpers.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Extraction } from "@/lib/ads/contracts";
import { AdsHttpError } from "@/lib/ads/workspace";
import { qcPassed } from "@/lib/ads/meta/publish-request";
import { budgetSuggestion, draftKeywords, draftSearchCopy } from "./core/draft";
import { LIMITS, type GeoPick } from "./core/types";

export const DraftRequestSchema = z.object({ runId: z.string().min(1), adIds: z.array(z.string().min(1)).max(50) });

/** Image ratios Demand Gen takes. */
export const DEMAND_GEN_RATIOS = ["1:1", "4:5", "1.91:1"] as const;

export async function buildGoogleDraft(runId: string, adIds: string[], ctx: { workspaceId: string; currency: string | null }) {
  const run = await prisma.adRun.findUnique({ where: { id: runId }, select: { workspaceId: true, url: true, extraction: true } });
  if (!run || run.workspaceId !== ctx.workspaceId) throw new AdsHttpError(404, "not_found", "Not found.");
  const ads = await prisma.ad.findMany({
    where: { runId, workspaceId: ctx.workspaceId, status: "ready", ...(adIds.length ? { id: { in: adIds } } : {}) },
    orderBy: { index: "asc" },
    select: { id: true, headline: true, body: true, cta: true, qcReport: true, assets: { select: { id: true, ratio: true, mime: true } } },
  });
  const ready = ads.filter((a) => qcPassed(a.qcReport));
  const ex = (run.extraction ?? {}) as Partial<Extraction>;
  const finalUrl = ex.landingPage || run.url;
  const brandName = (ex.brandName || hostOf(finalUrl)).trim();
  const input = { brandName, landingPage: finalUrl, mainOffer: ex.mainOffer ?? null, audience: ex.audience ?? null, location: null, facts: (ex.facts ?? []).map((f) => f.claim) };
  const suggested: GeoPick | null = null; // No business address in the extraction yet.
  return {
    finalUrl,
    businessName: brandName.slice(0, LIMITS.businessName),
    search: draftSearchCopy(input, ready),
    keywords: draftKeywords(input),
    geo: { suggested },
    businessLocation: null as { lat: number; lng: number; label: string } | null,
    budget: budgetSuggestion(ctx.currency),
    images: ready.flatMap((a) => a.assets
      .filter((x) => x.mime.startsWith("image/") && (DEMAND_GEN_RATIOS as readonly string[]).includes(x.ratio))
      .map((x) => ({ adId: a.id, ratio: x.ratio, previewUrl: `/api/ads/assets/${x.id}/preview` }))),
    limits: { headline: LIMITS.headline, description: LIMITS.description, path: LIMITS.path, headlinesMax: LIMITS.headlinesMax, descriptionsMax: LIMITS.descriptionsMax },
  };
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Your business"; }
}
