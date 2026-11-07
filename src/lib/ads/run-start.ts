import { Prisma, type AdsWorkspace, type BrandProfile, type User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSafeTargetUrl, checkTrialEligibility, rateLimit, recordTrialClaim, trialHashes, type RequestFingerprint } from "./abuse";
import { extractionFromBrand } from "./brand-extraction";
import { AD_GOALS, AWARENESS_LEVELS, RATIOS, TRIAL_AWARENESS_MIX, TRIAL_GRANT, TRIAL_RATIOS } from "./contracts";
import { InsufficientCreditsError, markTrialUsed, reserveCredits } from "./credits";
import { trackAdsEvent } from "./events";
import { enqueueJob } from "./jobs";
import { awarenessMixFor, creditCost, domainOf, normalizeUrl, PRIORITY, sha256 } from "./run";
import { TRIAL_REASON_MESSAGES } from "./run-labels";
import { AdsHttpError, isPaidWorkspace } from "./workspace";

const CONFIRMED_STATUSES: readonly string[] = ["queued", "generating", "completed", "partial"];

export const StartRunSchema = z.object({
  url: z.string().trim().min(3).max(2048),
  goal: z.enum(AD_GOALS).optional(),
  count: z.number().int().min(1).max(50).optional(),
  awareness: z.array(z.enum(AWARENESS_LEVELS)).min(1).max(5).optional(),
  ratios: z.array(z.enum(RATIOS)).min(1).max(3).optional(),
  motion: z.boolean().optional(),
  /** Reuse a saved brand profile and skip extraction ("Generate more"). */
  brandProfileId: z.string().max(64).optional(),
  /** Force a fresh crawl even when a brand profile exists for this domain. */
  reextract: z.boolean().optional(),
});
export type StartRunInput = z.infer<typeof StartRunSchema>;

const RUNS_PER_HOUR = 10;

function trialStaticCount(): number {
  const fromEnv = Number(process.env.ADS_TRIAL_STATIC_COUNT);
  return Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv <= TRIAL_GRANT.static ? fromEnv : TRIAL_GRANT.static;
}

async function safeUrl(raw: string): Promise<URL> {
  try {
    return await assertSafeTargetUrl(normalizeUrl(raw));
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "That doesn't look like a public website URL.";
    throw new AdsHttpError(400, "blocked_url", message);
  }
}

export async function startRun(input: StartRunInput, ctx: { user: User; workspace: AdsWorkspace; fp: RequestFingerprint }) {
  const { user, workspace, fp } = ctx;
  if (workspace.suspendedAt) throw new AdsHttpError(403, "suspended", TRIAL_REASON_MESSAGES.suspended ?? "Suspended.");
  if (!(await rateLimit(`runs:${user.id}`, RUNS_PER_HOUR, 3600))) {
    throw new AdsHttpError(429, "rate_limited", "You're starting runs very quickly. Give it a few minutes and try again.");
  }
  const target = await safeUrl(input.url);
  const url = target.toString();
  const domain = domainOf(url);
  const goal = input.goal ?? "auto";
  const brand = input.brandProfileId
    ? await prisma.brandProfile.findFirst({ where: { id: input.brandProfileId, workspaceId: workspace.id } })
    : await prisma.brandProfile.findUnique({ where: { workspaceId_domain: { workspaceId: workspace.id, domain } } });
  if (input.brandProfileId && !brand) throw new AdsHttpError(404, "not_found", "Brand profile not found.");

  const isTrial = !isPaidWorkspace(workspace) && !workspace.trialUsedAt;
  const fpHashes = { clientIpHash: fp.ip ? sha256(fp.ip) : null, deviceHash: fp.deviceId ? sha256(fp.deviceId) : null };

  if (isTrial) {
    // One in-flight trial at a time: send the user back to it instead of starting another.
    const existing = await prisma.adRun.findFirst({
      where: { workspaceId: workspace.id, isTrial: true, status: { notIn: ["failed", "canceled"] } },
      select: { id: true, status: true, url: true },
    });
    if (existing && !CONFIRMED_STATUSES.includes(existing.status)) return { runId: existing.id, resumed: true };
    if (existing) {
      // Confirmed by the engine's auto-confirm sweeper, which doesn't claim the trial: claim it now and block.
      await recordTrialClaim(workspace.id, user.id, existing.url, fp);
      await markTrialUsed(workspace.id, existing.id);
      throw new AdsHttpError(402, "trial_used", TRIAL_REASON_MESSAGES.trial_used ?? "Free trial already used.");
    }
    const eligibility = await checkTrialEligibility(user.id, workspace.id, url, fp);
    if (!eligibility.ok) {
      const status = eligibility.reason === "email_unverified" ? 403 : 402;
      throw new AdsHttpError(status, eligibility.reason, TRIAL_REASON_MESSAGES[eligibility.reason] ?? "Free trial unavailable.");
    }
    const run = await prisma.adRun.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        brandProfileId: brand?.id,
        url,
        goal,
        status: "extracting",
        isTrial: true,
        staticCount: trialStaticCount(),
        motionCount: TRIAL_GRANT.motion,
        ratios: TRIAL_RATIOS,
        awarenessMix: TRIAL_AWARENESS_MIX,
        ...fpHashes,
        trialClaim: claimJson(trialHashes(user.email, target, fp)),
      },
    });
    await enqueueJob({ type: "extract", runId: run.id, workspaceId: workspace.id, priority: PRIORITY.trial, payload: { url } });
    await trackAdsEvent("trial_started", { workspaceId: workspace.id, userId: user.id, runId: run.id, props: { domain, goal } });
    return { runId: run.id, resumed: false };
  }

  const staticCount = input.count ?? 10;
  const ratios = input.ratios ?? ["1:1"];
  const levels = input.awareness ?? ["problem_aware", "solution_aware"];
  const motionCount = input.motion ? 1 : 0;
  const cost = creditCost({ staticCount, ratios, motionCount });
  // Reuse the saved brand (explicit "Generate more" or same domain) unless a re-crawl was asked for.
  const reused = brand && !input.reextract ? await reusedExtraction(brand, url, goal) : null;
  const skipExtraction = reused !== null;
  const run = await prisma.adRun.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      brandProfileId: brand?.id,
      url,
      goal,
      status: skipExtraction ? "queued" : "extracting",
      confirmedAt: skipExtraction ? new Date() : null,
      ...(reused ? { extraction: reused.extraction as Prisma.InputJsonValue, resolvedGoal: reused.goal } : {}),
      isTrial: false,
      staticCount,
      motionCount,
      ratios,
      awarenessMix: awarenessMixFor(levels, staticCount),
      creditsReserved: cost,
      ...fpHashes,
    },
  });
  try {
    await reserveCredits(workspace.id, run.id, cost);
  } catch (error) {
    await prisma.adRun.delete({ where: { id: run.id } });
    if (error instanceof InsufficientCreditsError) {
      throw new AdsHttpError(402, "insufficient_credits", `This needs ${error.needed} credits and you have ${error.available}. Top up or upgrade to continue.`, {
        needed: error.needed,
        available: error.available,
      });
    }
    throw error;
  }
  await enqueueJob({
    type: skipExtraction ? "plan" : "extract",
    runId: run.id,
    workspaceId: workspace.id,
    priority: PRIORITY.paid,
    payload: { url },
  });
  return { runId: run.id, resumed: false };
}

/** Extraction for a run that reuses a brand profile, seeded from the brand's latest extracted run. */
async function reusedExtraction(brand: BrandProfile, url: string, goal: StartRunInput["goal"] | "auto") {
  const last = await prisma.adRun.findFirst({
    where: { brandProfileId: brand.id, extraction: { not: Prisma.AnyNull } },
    orderBy: { createdAt: "desc" },
    select: { extraction: true, resolvedGoal: true },
  });
  const extraction = extractionFromBrand(brand, last?.extraction ?? null, url, last?.resolvedGoal ?? "leads");
  if (!extraction) return null;
  return { extraction, goal: goal && goal !== "auto" ? goal : (last?.resolvedGoal ?? extraction.suggestedGoal) };
}

function claimJson(h: { domainHash: string; emailHash: string; ipHash: string | null; deviceHash: string | null }): Prisma.InputJsonObject {
  return { domainHash: h.domainHash, emailHash: h.emailHash, ipHash: h.ipHash, deviceHash: h.deviceHash };
}
