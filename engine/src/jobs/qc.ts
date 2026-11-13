// qc job: claim grounding + vision + technical checks; re-render with feedback or fail.
import { logoCrop } from "../render/composed/logo-crop";
import { imageMime } from "../storage/image-mime";
import { motionCheck } from "../modules/ezmotion/motion-checks";
import { END_CARD_POLICY_SYSTEM, safeZoneCheck } from "../modules/ezmotion/safezone";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ExtractionSchema, RATIO_PIXELS, RATIOS, type Extraction, type Ratio } from "../../../src/lib/ads/contracts";
import { classifyFailures, reviseCopy, swapImage } from "./revise";
import { rejectedAssetKeys } from "./plan";
import { untrusted } from "../prompts/doctrine";
import { GROUNDING_SYSTEM, VISION_SYSTEM } from "../prompts/qc";
import { structured } from "../providers/structured";
import { enqueue, priorityFor } from "../queue/queue";
import { PermanentJobError, type JobContext } from "./context";
import { canHedge, requestReplacement, wantsHedge } from "./replace";
import { maybeFinalizeRun } from "./finalize";
import { mapClaimsToFacts, type Fact } from "./grounding";
import { specFromAd } from "./render";
import { isFreeRun, isGiftRun } from "./gift-policy";
import { BONUS_PRIORITY, countTypeAds, hedgeEnabled, isLocked, maxTypeAds, READY_MILESTONE, retryConcept, typographicSpec } from "./trial-fill";
import { log } from "../log";
import { onBonusTerminal } from "./bonus";

/** Intended copy for the vision check; says so when the layout omits the body by design (no false "body missing"). */
export function intendedCopy(spec: { headline: string; body?: string; cta?: string }, visualBrief: unknown): string {
  const shown = (visualBrief as { render?: { bodyShown?: unknown } } | null)?.render?.bodyShown;
  const body = spec.body && shown === false ? "(none: this layout shows no body line by design; do not fail for a missing body)" : `"${spec.body ?? ""}"`;
  return `Intended copy — headline: "${spec.headline}", body: ${body}, cta: "${spec.cta ?? ""}".`;
}

export const MAX_QC_RERENDERS = 2;
/** Gift runs (cold outbound) get one redraw: on prod data a third render rescued 5 of 37 gift ads (2026-11-12), and
 * Kly's own reviewer already regenerates a weak gift. Saves ~18% of gift image generation. */
export const GIFT_QC_RERENDERS = 1;
export function maxQcRerenders(run: { kind?: string | null }): number {
  return isGiftRun(run) ? GIFT_QC_RERENDERS : MAX_QC_RERENDERS;
}
export const MAX_ASSET_BYTES = 30 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

/** Technical checks on stored assets (pure). */
export function technicalChecks(
  assets: Array<{ ratio: string; mime: string; width: number; height: number; bytes: number }>,
  ratios: string[],
  durations: Array<{ ratio: string; durationSec: number | null }> = [],
): Check[] {
  const checks: Check[] = [];
  const media = assets.filter((a) => a.ratio !== "poster");
  for (const r of ratios) {
    const a = media.find((x) => x.ratio === r);
    if (!a) {
      checks.push({ name: `file_${r}`, pass: false, detail: `missing ${r} output` });
      continue;
    }
    const px = (RATIOS as readonly string[]).includes(r) ? RATIO_PIXELS[r as Ratio] : null;
    const dimsOk = !!px && a.width === px.width && a.height === px.height;
    checks.push({ name: `dims_${r}`, pass: dimsOk, detail: `${a.width}x${a.height}${px ? ` (want ${px.width}x${px.height})` : ""}` });
    checks.push({ name: `size_${r}`, pass: a.bytes > 0 && a.bytes < MAX_ASSET_BYTES, detail: `${a.bytes} bytes` });
    if (a.mime === "video/mp4") {
      const d = durations.find((x) => x.ratio === r)?.durationSec;
      checks.push({ name: `duration_${r}`, pass: d != null && d > 0 && d <= MAX_VIDEO_SECONDS, detail: `${d ?? "?"}s` });
    }
  }
  return checks;
}

const GroundingOut = z.object({
  pass: z.boolean(),
  unsupported: z.array(z.object({ text: z.string(), why: z.string() })),
});

const OpeningOut = z.object({ pass: z.boolean(), detail: z.string() });

const VisionOut = z.object({
  checks: z.array(z.object({ name: z.string(), pass: z.boolean(), detail: z.string() })),
});

export function motionOnScreen(visualBrief: unknown): string[] {
  const t = (visualBrief as { render?: { onScreenText?: unknown } } | null)?.render?.onScreenText;
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
}

export async function qcJob(ctx: JobContext): Promise<unknown> {
  const { db, storage, job } = ctx;
  if (!job.adId) throw new PermanentJobError("qc job without adId");
  const ad = await db.ad.findUnique({ where: { id: job.adId }, include: { assets: true, run: { include: { brandProfile: true } } } });
  if (!ad) throw new PermanentJobError("ad not found");
  if (ad.status !== "qc") return { skipped: `ad status ${ad.status}` };
  const run = ad.run;
  const spec = specFromAd(ad);
  const facts = ((run.brandProfile?.facts as unknown as Fact[] | null) ?? []).filter((f) => f && typeof f.claim === "string");
  const checks: Check[] = [];

  // (c) technical
  const ratios = ad.kind === "motion" && run.isTrial ? ["9:16"] : run.ratios;
  const durations = (job.payload.durations as Array<{ ratio: string; durationSec: number | null }> | undefined) ?? [];
  checks.push(...technicalChecks(ad.assets, ratios, durations));

  // (a) grounding: deterministic mapping, then LLM judge over the full copy
  // Motion: the hype edit shows its own short cards; ground every one of them too.
  const onScreen = ad.kind === "motion" ? motionOnScreen(ad.visualBrief) : [];
  const mapped = mapClaimsToFacts(spec.claims, facts);
  for (const m of mapped) checks.push({ name: "claim_mapped", pass: m.factIndex !== null, detail: m.claim });
  const g = await structured(
    ctx.provider,
    GroundingOut,
    {
      system: GROUNDING_SYSTEM,
      prompt: `${untrusted("facts", facts.map((f, i) => `F${i + 1}. ${f.claim} — "${f.quote}"`).join("\n") || "(no facts: any product claim fails)")}\n\nAD:\nheadline: ${spec.headline}\nbody: ${spec.body ?? ""}\ncta: ${spec.cta ?? ""}\nclaims: ${JSON.stringify(spec.claims)}${onScreen.length ? `\non-screen video text (every card, in order): ${JSON.stringify(onScreen)}` : ""}`,
      reasoning: "low",
      signal: ctx.signal,
    },
    ctx.usage,
  );
  checks.push({ name: "grounded", pass: g.pass && g.unsupported.length === 0, detail: g.unsupported.map((u) => `${u.text}: ${u.why}`).join("; ") || undefined });

  // (b) vision on the first image (poster for motion)
  const img = ad.assets.find((a) => a.mime.startsWith("image/") && a.ratio !== "poster") ?? ad.assets.find((a) => a.ratio === "poster");
  if (img) {
    const bytes = await storage.get(img.storageKey);
    const brand = run.brandProfile;
    const palette = (ad.visualBrief as { palette?: unknown } | null)?.palette;
    const v = await structured(
      ctx.provider,
      VisionOut,
      {
        system: VISION_SYSTEM,
        prompt: `Brand: ${brand?.name ?? ""}; brand colors: ${JSON.stringify(brand?.colors ?? [])}.${palette ? `\nEffective palette the renderer used (all of these count as on-brand, as do their tints/shades): ${JSON.stringify(palette)}.` : ""}\n${onScreen.length ? `This is the end-card frame of a video. Text the video shows (any of it may be on this frame): ${JSON.stringify(onScreen)}.` : intendedCopy(spec, ad.visualBrief)} Awareness: ${spec.awareness}. Angle: ${spec.angle}.\nReturn one entry per check name listed in your instructions.`,
        images: [{ mediaType: imageMime(bytes, img.mime), base64: bytes.toString("base64") }, ...(await logoCrop(bytes, ad.visualBrief))],
        reasoning: "low",
        signal: ctx.signal,
      },
      ctx.usage,
    );
    for (const c of v.checks) {
      // A video's poster is its end card (brand + CTA): the buyer's moment lives in its opening, judged below.
      if (onScreen.length && c.name === "buyer_moment") continue;
      checks.push({ name: `vision_${c.name}`, pass: c.pass, detail: c.detail });
    }
    if (onScreen.length) {
      const o = await structured(
        ctx.provider,
        OpeningOut,
        {
          system: "You review the opening of a short social video ad. Pass when its first words lead with the buyer's own moment, thought or frustration (not features, brand claims or a slogan). Ignore a small brand name or logo label shown alongside it.",
          prompt: `Opening on-screen text, in order: ${JSON.stringify(onScreen.slice(0, 5))}. Reply with JSON {pass, detail}.`,
          reasoning: "low",
          signal: ctx.signal,
        },
        ctx.usage,
      );
      checks.push({ name: "vision_buyer_moment", pass: o.pass, detail: `opening: ${o.detail}` });
      // Motion only: Reels safe zone + no fake button on the end card.
      if (ad.assets.some((a) => a.ratio === "9:16")) {
        const e = await structured(ctx.provider, OpeningOut, { system: END_CARD_POLICY_SYSTEM, prompt: "Reply with JSON {pass, detail}.", images: [{ mediaType: imageMime(bytes, img.mime), base64: bytes.toString("base64") }], reasoning: "low", signal: ctx.signal }, ctx.usage);
        checks.push({ name: "vision_end_card_policy", pass: e.pass, detail: e.detail });
      }
    }
  } else if (ad.kind === "static") {
    checks.push({ name: "vision", pass: false, detail: "no image to inspect" });
  }

  const zone = ad.kind === "motion" ? safeZoneCheck(ad.visualBrief) : null;
  if (zone) checks.push(zone);
  const motionQc = ad.kind === "motion" ? motionCheck(ad.visualBrief) : null;
  if (motionQc) checks.push(motionQc);

  const pass = checks.every((c) => c.pass);
  const now = ctx.now();
  const report = { pass, attempt: ad.qcAttempts + 1, checks } as unknown as Prisma.InputJsonValue;
  const cost = BigInt(Math.round(ctx.usage.reduce((a, u) => a + u.costMicros, 0)));

  if (pass) {
    await db.ad.update({ where: { id: ad.id }, data: { status: "ready", qcReport: report, costMicros: { increment: cost } } });
    if (!isLocked(ad.visualBrief)) await logReadyMilestone(db, run, now);
    const first = await db.adRun.updateMany({ where: { id: run.id, firstAdAt: null }, data: { firstAdAt: now } });
    if (first.count === 1) {
      await db.adsEvent.create({
        data: {
          name: "first_ad_ready",
          workspaceId: run.workspaceId,
          userId: run.userId,
          runId: run.id,
          props: { adId: ad.id, msFromConfirm: run.confirmedAt ? now.getTime() - run.confirmedAt.getTime() : null },
        },
      });
    }
  } else if (ad.qcAttempts < maxQcRerenders(run)) {
    const failed = checks.filter((c) => !c.pass);
    const feedback = failed.map((c) => `${c.name}: ${c.detail ?? "failed"}`).join("\n");
    // Fix the cause, not just re-render: rewrite copy and/or swap the image.
    const { copy, image } = classifyFailures(failed);
    let next = spec;
    const vb = (ad.visualBrief as { triedAssets?: string[]; fallback?: string } | null) ?? {};
    const offTopic = failed.some((c) => c.name === "vision_image_relevant");
    // Trial/gift static that failed ONLY on image relevance: keep the (approved) copy, drop the photo/scene and
    // re-render it typographic (cheap, no image gen; image_relevant cannot fail without a photo).
    const imageOnly = ad.kind === "static" && !isLocked(ad.visualBrief) && (run.isTrial || isFreeRun(run)) && failed.length > 0 && failed.every((c) => c.name === "vision_image_relevant") && vb.fallback !== "type";
    // Capped: past maxTypeAds the ad keeps a photo and gets a different one (swapImage below) instead.
    const retype = imageOnly && countTypeAds(await db.ad.findMany({ where: { runId: run.id, id: { not: ad.id } }, select: { status: true, visualBrief: true, kind: true } })) < maxTypeAds(run);
    if (offTopic && spec.visual.assetKeys.length) {
      // Run-wide ban: other ads and replacements must not reuse an off-topic photo (e.g. wine on a law firm).
      await db.$executeRaw`UPDATE "AdRun" SET extraction = jsonb_set(COALESCE(extraction, '{}'::jsonb), '{rejectedAssetKeys}', COALESCE(extraction->'rejectedAssetKeys', '[]'::jsonb) || ${JSON.stringify(spec.visual.assetKeys)}::jsonb) WHERE id = ${run.id}`;
    }
    const tried = [...new Set([...(vb.triedAssets ?? []), ...spec.visual.assetKeys, ...rejectedAssetKeys(run.extraction)])];
    if (retype) {
      const ex = ExtractionSchema.safeParse(run.extraction);
      const siblings = await db.ad.findMany({ where: { runId: run.id, kind: "static", id: { not: ad.id } }, select: { visualBrief: true } });
      next = typographicSpec(spec, siblings.map((s) => (s.visualBrief as { layout?: string } | null)?.layout ?? ""), ex.success ? ex.data.mainOffer : null);
    } else if (image.length) {
      const ex = ExtractionSchema.safeParse(run.extraction);
      if (offTopic) {
        // Tell the image model WHY the last picture failed and what it must show (AI scenes otherwise retry blind).
        const why = failed.find((c) => c.name === "vision_image_relevant")?.detail ?? "";
        const offer = ex.success ? ex.data.mainOffer : null;
        next = { ...next, visual: { ...next.visual, concept: retryConcept(next.visual.concept, why, offer) } };
      }
      const assets = (Array.isArray(run.brandProfile?.assets) ? (run.brandProfile.assets as unknown as Extraction["assets"]) : ex.success ? ex.data.assets : []) ?? [];
      next = swapImage(next, assets, tried);
    }
    if (copy.length && !retype) next = await reviseCopy(ctx, next, copy, facts).catch(() => next);
    const newCost = BigInt(Math.round(ctx.usage.reduce((a, u) => a + u.costMicros, 0)));
    // Trials: on the first fail also plan a replacement in parallel (hedge), so a slot that keeps failing
    // does not serialise re-render x2 -> replan before the pack can fill. The QC bar is unchanged.
    const hedge = wantsHedge({ isTrial: run.isTrial, freeRun: isFreeRun(run), kind: ad.kind, locked: isLocked(ad.visualBrief), qcAttempts: ad.qcAttempts, enabled: hedgeEnabled() }) && (await canHedge(db, run, now));
    await db.$transaction(async (tx) => {
      if (hedge) {
        await enqueue(tx, { type: "plan", runId: run.id, workspaceId: run.workspaceId, priority: priorityFor(run.isTrial, 30), payload: { replaceAdId: ad.id, hedge: true, feedback: feedback.slice(0, 2000) } });
      }
      await tx.ad.update({
        where: { id: ad.id },
        data: {
          status: "planned",
          qcAttempts: { increment: 1 },
          qcReport: report,
          costMicros: { increment: newCost },
          headline: next.headline,
          hook: next.hook,
          body: next.body ?? null,
          cta: next.cta ?? null,
          claims: next.claims as unknown as Prisma.InputJsonValue,
          visualBrief: { ...((ad.visualBrief as Record<string, unknown> | null) ?? {}), ...next.visual, spec: next, triedAssets: tried, ...(retype ? { fallback: "type" } : {}) } as unknown as Prisma.InputJsonValue,
        },
      });
      await enqueue(tx, {
        type: ad.kind === "motion" ? "render_motion" : "render_static",
        runId: run.id,
        adId: ad.id,
        workspaceId: run.workspaceId,
        priority: isLocked(ad.visualBrief) ? BONUS_PRIORITY : priorityFor(run.isTrial, 25),
        payload: { qcFeedback: feedback },
      });
    });
  } else {
    await db.ad.update({ where: { id: ad.id }, data: { status: "failed_qc", qcAttempts: { increment: 1 }, qcReport: report, costMicros: { increment: cost } } });
    const feedback = checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail ?? "failed"}`).join("\n");
    await requestReplacement(db, ad.id, feedback);
  }
  await maybeFinalizeRun(db, run.id, now);
  if (isLocked(ad.visualBrief)) await onBonusTerminal(db, storage, ad.id, now, ctx.config.assetTtlDays);
  return { pass, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
}


/** Instrumentation: log + event when a run reaches READY_MILESTONE ready pack ads (time-to-6 from confirm). */
async function logReadyMilestone(db: JobContext["db"], run: { id: string; workspaceId: string; userId: string | null; isTrial: boolean; confirmedAt: Date | null }, now: Date): Promise<void> {
  const ads = await db.ad.findMany({ where: { runId: run.id, status: "ready" }, select: { visualBrief: true } });
  if (ads.filter((a) => !isLocked(a.visualBrief)).length !== READY_MILESTONE) return;
  const ms = run.confirmedAt ? now.getTime() - run.confirmedAt.getTime() : null;
  log("info", "run ready milestone", { runId: run.id, ready: READY_MILESTONE, isTrial: run.isTrial, timeToReadyMs: ms });
  await db.adsEvent.create({ data: { name: "ads_ready_6", workspaceId: run.workspaceId, userId: run.userId, runId: run.id, props: { msFromConfirm: ms, isTrial: run.isTrial } } }).catch(() => undefined);
}
