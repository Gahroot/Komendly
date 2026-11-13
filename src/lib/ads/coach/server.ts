// Ozzy Ad Coach server helpers (DB access, views, the "Make 5 more like the winner" start).
import type { AdCoachReview, AdsWorkspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { coachAccess, type CoachAccess } from "./access";
import { COACH_JOB_TYPE, CoachVerdictSchema, COACH_STATUSES, type CoachStatus, type RunSeed } from "./contracts";
import type { CoachReviewView } from "./view";

export async function loadCoachAccess(ws: AdsWorkspace, now: Date): Promise<CoachAccess> {
  const [freeUsed, last24h] = await Promise.all([
    prisma.adCoachReview.count({ where: { workspaceId: ws.id, free: true, status: { not: "failed" } } }),
    prisma.adCoachReview.count({ where: { workspaceId: ws.id, createdAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
  ]);
  return coachAccess(ws, { freeUsed, last24h });
}

export function reviewView(r: AdCoachReview): CoachReviewView {
  const v = CoachVerdictSchema.safeParse(r.verdict);
  const status: CoachStatus = (COACH_STATUSES as readonly string[]).includes(r.status) ? (r.status as CoachStatus) : "failed";
  return {
    id: r.id,
    status,
    kind: r.kind === "table" ? "table" : "screenshots",
    note: r.note,
    fileCount: Array.isArray(r.files) ? r.files.length : 0,
    verdict: v.success ? v.data : null,
    error: r.error,
    moreRunId: r.moreRunId,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function enqueueCoachJob(review: AdCoachReview): Promise<void> {
  await prisma.adJob.create({
    data: { type: COACH_JOB_TYPE, workspaceId: review.workspaceId, payload: { reviewId: review.id }, priority: 10, maxAttempts: 2 },
  });
}

/** Website + brand for the seeded run: the matched ad's run, else the newest brand profile. */
export async function seedTarget(ws: AdsWorkspace, matchedAdId: string | null): Promise<{ url: string; brandProfileId?: string } | null> {
  if (matchedAdId) {
    const ad = await prisma.ad.findFirst({ where: { id: matchedAdId, workspaceId: ws.id }, select: { run: { select: { url: true, brandProfileId: true } } } });
    if (ad) return { url: ad.run.url, ...(ad.run.brandProfileId ? { brandProfileId: ad.run.brandProfileId } : {}) };
  }
  const brand = await prisma.brandProfile.findFirst({ where: { workspaceId: ws.id, runs: { some: { kind: { notIn: ["gift"] } } } }, orderBy: { updatedAt: "desc" }, select: { id: true, url: true } });
  return brand ? { url: brand.url, brandProfileId: brand.id } : null;
}

export async function seedFor(ws: AdsWorkspace, review: AdCoachReview): Promise<RunSeed | null> {
  const v = CoachVerdictSchema.safeParse(review.verdict);
  const w = v.success ? v.data.winner : null;
  if (!w) return null;
  let visual: RunSeed["visual"];
  if (w.matchedAdId) {
    const ad = await prisma.ad.findFirst({ where: { id: w.matchedAdId, workspaceId: ws.id }, select: { visualBrief: true } });
    const vb = (ad?.visualBrief ?? null) as { concept?: unknown; layout?: unknown } | null;
    visual = {
      ...(typeof vb?.concept === "string" ? { concept: vb.concept.slice(0, 1000) } : {}),
      ...(typeof vb?.layout === "string" ? { layout: vb.layout.slice(0, 120) } : {}),
    };
  }
  return {
    angle: w.angle,
    hook: w.hook,
    headline: w.headline,
    style: w.style,
    ...(visual ? { visual } : {}),
    ...(w.matchedAdId ? { sourceAdId: w.matchedAdId } : {}),
    coachReviewId: review.id,
  };
}
