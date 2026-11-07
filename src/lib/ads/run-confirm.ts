import type { AdRun, AdsWorkspace, Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTargetUrl, trialHashes, type RequestFingerprint } from "./abuse";
import { finalizeConfirm, parseTrialClaim } from "./trial-confirm";
import { CONFIRM_WINDOW_SECONDS, ExtractionSchema, MAX_EXTRACT_RETRIES, type Corrections, type Extraction } from "./contracts";
import { markTrialUsed } from "./credits";
import { brandUpdateData, correctionsToBrandUpdate } from "./brand";
import { trackAdsEvent } from "./events";
import { enqueueJob } from "./jobs";
import { domainOf, PRIORITY } from "./run";
import { AdsHttpError } from "./workspace";

/** Longest a user can keep the confirm window open by editing (server cap). */
const MAX_HOLD_SECONDS = 20 * 60; // measured from run creation

export function parseExtraction(value: unknown): Extraction | null {
  const parsed = ExtractionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function ensureBrandProfile(run: AdRun, extraction: Extraction | null) {
  if (run.brandProfileId) {
    const existing = await prisma.brandProfile.findUnique({ where: { id: run.brandProfileId } });
    if (existing) return existing;
  }
  const domain = extraction?.domain || domainOf(run.url);
  const fromExtraction = extraction
    ? {
        name: extraction.brandName,
        colors: extraction.colors,
        fonts: extraction.fonts,
        logoKey: extraction.logoKey,
        assets: extraction.assets,
        audience: extraction.audience,
        mainOffer: extraction.mainOffer,
        pains: extraction.pains,
        proof: extraction.proof,
        facts: extraction.facts,
        landingPage: extraction.landingPage,
        voice: extraction.voice,
      }
    : {};
  return prisma.brandProfile.upsert({
    where: { workspaceId_domain: { workspaceId: run.workspaceId, domain } },
    create: { workspaceId: run.workspaceId, domain, url: run.url, ...fromExtraction },
    update: {},
  });
}

/** Keep sources for pains the user didn't change. */
function painsWithSources(corrected: string[], extraction: Extraction | null, fallback: string) {
  return corrected.map((text) => extraction?.pains.find((p) => p.text === text) ?? { text, sourceUrl: fallback });
}

/** Confirm the extraction (by the user or automatically at the deadline). Idempotent. */
export async function confirmRun(
  run: AdRun,
  ctx: { user: User; workspace: AdsWorkspace; fp: RequestFingerprint; corrections: Corrections; auto: boolean },
): Promise<void> {
  if (run.status !== "awaiting_confirm") {
    if (["queued", "generating", "completed", "partial"].includes(run.status)) {
      if (ctx.auto) return; // the client's own deadline tick racing the engine: nothing to tell the user
      throw new AdsHttpError(409, "already_confirmed", "This run was already confirmed, so these edits weren't applied.");
    }
    throw new AdsHttpError(409, "not_awaiting_confirm", "This run isn't waiting for confirmation.");
  }
  const corrections: Corrections = { ...ctx.corrections, note: undefined };
  const now = new Date();
  const claimed = await prisma.adRun.updateMany({
    where: { id: run.id, status: "awaiting_confirm" },
    data: {
      status: "queued",
      confirmedAt: now,
      corrections: corrections as Prisma.InputJsonValue,
      ...(corrections.goal ? { goal: corrections.goal } : {}),
    },
  });
  if (claimed.count !== 1) {
    if (ctx.auto) return;
    throw new AdsHttpError(409, "already_confirmed", "This run was already confirmed, so these edits weren't applied.");
  }

  const extraction = parseExtraction(run.extraction);
  const brand = await ensureBrandProfile(run, extraction);
  const update = correctionsToBrandUpdate(corrections, extraction?.landingPage ?? run.url);
  if (corrections.pains) update.pains = painsWithSources(corrections.pains, extraction, extraction?.landingPage ?? run.url);
  const hasEdits = Object.values(update).some((v) => v !== undefined);
  if (hasEdits) await prisma.brandProfile.update({ where: { id: brand.id }, data: brandUpdateData(brand, update, now) });
  await prisma.adRun.update({ where: { id: run.id }, data: { brandProfileId: brand.id } });

  // Same advisory lock as the engine's confirm sweeper, so only one plan job is ever enqueued.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"plan:" + run.id}))`;
    const planExists = await tx.adJob.findFirst({ where: { runId: run.id, type: "plan", status: { notIn: ["dead", "canceled"] } }, select: { id: true } });
    if (planExists) return;
    await tx.adJob.create({
      data: { type: "plan", runId: run.id, workspaceId: run.workspaceId, payload: {}, priority: run.isTrial ? PRIORITY.trial : PRIORITY.paid, maxAttempts: 3 },
    });
  });
  if (run.isTrial) await markTrialUsed(run.workspaceId, run.id);
  await finalizeConfirm(prisma, run, {
    auto: ctx.auto,
    edited: Object.entries(corrections).filter(([k, v]) => v !== undefined && k !== "goal").map(([k]) => k),
    claim: parseTrialClaim(run.trialClaim) ?? trialHashes(ctx.user.email, parseTargetUrl(run.url), ctx.fp),
    now,
  });
}

/** Extend the confirm window while the user edits (capped). */
export async function holdRun(run: AdRun): Promise<Date> {
  if (run.status !== "awaiting_confirm") throw new AdsHttpError(409, "not_awaiting_confirm", "This run isn't waiting for confirmation.");
  const cap = run.createdAt.getTime() + MAX_HOLD_SECONDS * 1000;
  const deadline = new Date(Math.max(run.confirmDeadline?.getTime() ?? 0, Math.min(Date.now() + CONFIRM_WINDOW_SECONDS * 1000, cap)));
  await prisma.adRun.updateMany({ where: { id: run.id, status: "awaiting_confirm" }, data: { confirmDeadline: deadline } });
  return deadline;
}

export async function extractRetriesUsed(runId: string): Promise<number> {
  const jobs = await prisma.adJob.count({ where: { runId, type: "extract" } });
  return Math.max(0, jobs - 1);
}

/** Ask the agent to re-extract with an optional note. */
export async function retryExtraction(run: AdRun, ctx: { userId: string; note?: string }): Promise<void> {
  if (run.status !== "awaiting_confirm" && run.status !== "failed") {
    throw new AdsHttpError(409, "not_retryable", "Extraction can only be retried from the review screen.");
  }
  if ((await extractRetriesUsed(run.id)) >= MAX_EXTRACT_RETRIES) {
    throw new AdsHttpError(429, "retries_exhausted", `You've used all ${MAX_EXTRACT_RETRIES} retries. Edit the fields directly instead.`);
  }
  const updated = await prisma.adRun.updateMany({
    where: { id: run.id, status: run.status },
    data: { status: "extracting", confirmDeadline: null, error: null, corrections: ctx.note ? { note: ctx.note } : undefined },
  });
  if (updated.count !== 1) return;
  await enqueueJob({
    type: "extract",
    runId: run.id,
    workspaceId: run.workspaceId,
    priority: run.isTrial ? PRIORITY.trial : PRIORITY.paid,
    payload: { url: run.url, note: ctx.note ?? null, retry: true },
  });
  await trackAdsEvent("extraction_retried", { workspaceId: run.workspaceId, userId: ctx.userId, runId: run.id, props: { hasNote: Boolean(ctx.note) } });
}
