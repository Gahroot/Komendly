// qc job: claim grounding + vision + technical checks; re-render with feedback or fail.
import { logoCrop } from "../render/composed/logo-crop";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ExtractionSchema, RATIO_PIXELS, RATIOS, type Extraction, type Ratio } from "../../../src/lib/ads/contracts";
import { classifyFailures, reviseCopy, swapImage } from "./revise";
import { untrusted } from "../prompts/doctrine";
import { GROUNDING_SYSTEM, VISION_SYSTEM } from "../prompts/qc";
import { structured } from "../providers/structured";
import { enqueue, priorityFor } from "../queue/queue";
import { PermanentJobError, type JobContext } from "./context";
import { requestReplacement } from "./replace";
import { maybeFinalizeRun } from "./finalize";
import { mapClaimsToFacts, type Fact } from "./grounding";
import { specFromAd } from "./render";

export const MAX_QC_RERENDERS = 2;
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

const VisionOut = z.object({
  checks: z.array(z.object({ name: z.string(), pass: z.boolean(), detail: z.string() })),
});

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
  const mapped = mapClaimsToFacts(spec.claims, facts);
  for (const m of mapped) checks.push({ name: "claim_mapped", pass: m.factIndex !== null, detail: m.claim });
  const g = await structured(
    ctx.provider,
    GroundingOut,
    {
      system: GROUNDING_SYSTEM,
      prompt: `${untrusted("facts", facts.map((f, i) => `F${i + 1}. ${f.claim} — "${f.quote}"`).join("\n") || "(no facts: any product claim fails)")}\n\nAD:\nheadline: ${spec.headline}\nbody: ${spec.body ?? ""}\ncta: ${spec.cta ?? ""}\nclaims: ${JSON.stringify(spec.claims)}`,
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
        prompt: `Brand: ${brand?.name ?? ""}; brand colors: ${JSON.stringify(brand?.colors ?? [])}.${palette ? `\nEffective palette the renderer used (all of these count as on-brand, as do their tints/shades): ${JSON.stringify(palette)}.` : ""}\nIntended copy — headline: "${spec.headline}", body: "${spec.body ?? ""}", cta: "${spec.cta ?? ""}". Awareness: ${spec.awareness}. Angle: ${spec.angle}.\nReturn one entry per check name listed in your instructions.`,
        images: [{ mediaType: img.mime, base64: bytes.toString("base64") }, ...(await logoCrop(bytes, ad.visualBrief))],
        reasoning: "low",
        signal: ctx.signal,
      },
      ctx.usage,
    );
    for (const c of v.checks) checks.push({ name: `vision_${c.name}`, pass: c.pass, detail: c.detail });
  } else if (ad.kind === "static") {
    checks.push({ name: "vision", pass: false, detail: "no image to inspect" });
  }

  const pass = checks.every((c) => c.pass);
  const now = ctx.now();
  const report = { pass, attempt: ad.qcAttempts + 1, checks } as unknown as Prisma.InputJsonValue;
  const cost = BigInt(Math.round(ctx.usage.reduce((a, u) => a + u.costMicros, 0)));

  if (pass) {
    await db.ad.update({ where: { id: ad.id }, data: { status: "ready", qcReport: report, costMicros: { increment: cost } } });
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
  } else if (ad.qcAttempts < MAX_QC_RERENDERS) {
    const failed = checks.filter((c) => !c.pass);
    const feedback = failed.map((c) => `${c.name}: ${c.detail ?? "failed"}`).join("\n");
    // Fix the cause, not just re-render: rewrite copy and/or swap the image.
    const { copy, image } = classifyFailures(failed);
    let next = spec;
    const vb = (ad.visualBrief as { triedAssets?: string[] } | null) ?? {};
    const tried = [...(vb.triedAssets ?? []), ...spec.visual.assetKeys];
    if (image.length) {
      const ex = ExtractionSchema.safeParse(run.extraction);
      const assets = (Array.isArray(run.brandProfile?.assets) ? (run.brandProfile.assets as unknown as Extraction["assets"]) : ex.success ? ex.data.assets : []) ?? [];
      next = swapImage(next, assets, tried);
    }
    if (copy.length) next = await reviseCopy(ctx, next, copy, facts).catch(() => next);
    const newCost = BigInt(Math.round(ctx.usage.reduce((a, u) => a + u.costMicros, 0)));
    await db.$transaction(async (tx) => {
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
          visualBrief: { ...((ad.visualBrief as Record<string, unknown> | null) ?? {}), ...next.visual, spec: next, triedAssets: tried } as unknown as Prisma.InputJsonValue,
        },
      });
      await enqueue(tx, {
        type: ad.kind === "motion" ? "render_motion" : "render_static",
        runId: run.id,
        adId: ad.id,
        workspaceId: run.workspaceId,
        priority: priorityFor(run.isTrial, 25),
        payload: { qcFeedback: feedback },
      });
    });
  } else {
    await db.ad.update({ where: { id: ad.id }, data: { status: "failed_qc", qcAttempts: { increment: 1 }, qcReport: report, costMicros: { increment: cost } } });
    const feedback = checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail ?? "failed"}`).join("\n");
    await requestReplacement(db, ad.id, feedback);
  }
  await maybeFinalizeRun(db, run.id, now);
  return { pass, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
}

