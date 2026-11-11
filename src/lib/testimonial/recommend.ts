// Actor recommendation for a review: instant keyword ranking + the engine's Codex ranking
// (AdJob `testimonial_recommend_actors`) once it has finished.
import { prisma } from "@/lib/prisma";
import { heuristicActorPicks, TESTIMONIAL_RECOMMEND_JOB_TYPE, type ActorPick } from "@/lib/testimonial/contracts";

export const RECOMMEND_LIMIT = 5;

export interface Recommendation {
  status: "none" | "queued" | "running" | "ready" | "failed";
  source: "codex" | "heuristic";
  picks: ActorPick[];
  jobId: string | null;
}

async function latestJob(userId: string, reviewId: string) {
  return prisma.adJob.findFirst({
    where: {
      type: TESTIMONIAL_RECOMMEND_JOB_TYPE,
      AND: [{ payload: { path: ["reviewId"], equals: reviewId } }, { payload: { path: ["userId"], equals: userId } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, result: true },
  });
}

function codexPicks(result: unknown): ActorPick[] | null {
  if (!result || typeof result !== "object") return null;
  const picks = (result as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return null;
  return picks.filter((p): p is ActorPick => !!p && typeof p.actorId === "string" && typeof p.reason === "string");
}

/** Finished engine ranking only (null when none). */
export async function getReadyRecommendation(userId: string, reviewId: string): Promise<ActorPick[] | null> {
  const job = await latestJob(userId, reviewId);
  return job?.status === "succeeded" ? codexPicks(job.result) : null;
}

export async function getRecommendation(userId: string, reviewId: string): Promise<Recommendation | null> {
  const review = await prisma.review.findFirst({ where: { id: reviewId, userId }, select: { reviewText: true, businessName: true } });
  if (!review) return null;
  const job = await latestJob(userId, reviewId);
  const ready = job?.status === "succeeded" ? codexPicks(job.result) : null;
  if (job && ready) return { status: "ready", source: "codex", picks: ready, jobId: job.id };
  const actors = await prisma.falActor.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const picks = heuristicActorPicks(review.reviewText, review.businessName, actors, RECOMMEND_LIMIT);
  const status: Recommendation["status"] = !job ? "none" : job.status === "dead" || job.status === "succeeded" ? "failed" : job.status === "running" ? "running" : "queued";
  return { status, source: "heuristic", picks, jobId: job?.id ?? null };
}

/** Enqueue unless a live or finished job exists for this review. */
export async function enqueueRecommendation(userId: string, reviewId: string): Promise<string> {
  const job = await latestJob(userId, reviewId);
  if (job && job.status !== "dead") return job.id;
  const row = await prisma.adJob.create({
    data: { type: TESTIMONIAL_RECOMMEND_JOB_TYPE, payload: { reviewId, userId, limit: RECOMMEND_LIMIT }, priority: 150, maxAttempts: 2 },
    select: { id: true },
  });
  return row.id;
}
