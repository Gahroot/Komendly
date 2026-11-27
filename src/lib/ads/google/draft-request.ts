// Builds the editable Google draft for a run: search text (AI gateway, rules fallback), keywords, service-area geo,
// budget, images. DB + core draft helpers; the AI and geo calls never fail the draft (rules / no suggestion instead).
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Extraction } from "@/lib/ads/contracts";
import { gatewayText } from "@/lib/ai-gateway/client";
import type { GatewayTextFn } from "@/lib/ai-gateway/core";
import { AdsHttpError } from "@/lib/ads/workspace";
import { qcPassed } from "@/lib/ads/meta/publish-request";
import { authFor } from "./connection";
import { budgetSuggestion, draftGoogleCopy, suggestServiceArea, type DraftRunInput } from "./core/draft";
import { suggestGeo } from "./core/ops";
import { LIMITS, type GeoPick } from "./core/types";

export const DraftRequestSchema = z.object({ runId: z.string().min(1), adIds: z.array(z.string().min(1)).max(50) });

/** Image ratios Demand Gen takes. An ad is offered only with a 1:1 or 1.91:1 image (Demand Gen needs one). */
export const DEMAND_GEN_RATIOS = ["1:1", "4:5", "1.91:1"] as const;
const DEMAND_GEN_REQUIRED = ["1:1", "1.91:1"];

/** Extraction -> drafter input: facts (claims), verbatim quotes (number grounding), offer, audience. */
export function draftInputFromExtraction(ex: Partial<Extraction>, finalUrl: string, brandName: string): DraftRunInput {
  return {
    brandName, landingPage: finalUrl, mainOffer: ex.mainOffer ?? null, audience: ex.audience ?? null, location: null,
    facts: (ex.facts ?? []).map((f) => f.claim).filter(Boolean),
    quotes: (ex.facts ?? []).map((f) => f.quote).filter(Boolean),
  };
}

const draftText: GatewayTextFn = (req) => gatewayText(req, { purpose: "google_ads_draft", requester: "web", timeoutMs: 35_000 });

export async function buildGoogleDraft(
  runId: string, adIds: string[],
  ctx: { workspaceId: string; currency: string | null; conn?: Parameters<typeof authFor>[0] | null; text?: GatewayTextFn },
) {
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
  const input = draftInputFromExtraction(ex, finalUrl, brandName);
  const draft = await draftGoogleCopy(input, ready, ctx.text ?? draftText);
  let suggested: GeoPick | null = null;
  if (ctx.conn && draft.serviceAreas.length) {
    try {
      const auth = authFor(ctx.conn);
      suggested = await suggestServiceArea(draft.serviceAreas, input.location, (q) => suggestGeo(auth, q));
    } catch {
      suggested = null; // the owner picks the area themselves
    }
  }
  return {
    finalUrl,
    businessName: brandName.slice(0, LIMITS.businessName),
    search: draft.search,
    keywords: draft.keywords,
    geo: { suggested },
    businessLocation: null as { lat: number; lng: number; label: string } | null,
    budget: budgetSuggestion(ctx.currency),
    images: ready
      .filter((a) => a.assets.some((x) => x.mime.startsWith("image/") && DEMAND_GEN_REQUIRED.includes(x.ratio)))
      .flatMap((a) => a.assets
        .filter((x) => x.mime.startsWith("image/") && (DEMAND_GEN_RATIOS as readonly string[]).includes(x.ratio))
        .map((x) => ({ adId: a.id, ratio: x.ratio, previewUrl: `/api/ads/assets/${x.id}/preview` }))),
    limits: { headline: LIMITS.headline, description: LIMITS.description, path: LIMITS.path, headlinesMax: LIMITS.headlinesMax, descriptionsMax: LIMITS.descriptionsMax },
  };
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Your business"; }
}
