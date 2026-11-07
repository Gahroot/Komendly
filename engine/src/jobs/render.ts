// render_static / render_motion jobs.
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { AdSpecSchema, type AdSpec, type Ratio, RATIOS } from "../../../src/lib/ads/contracts";
import { enqueue, priorityFor } from "../queue/queue";
import { runKey } from "../storage/keys";
import { buildBrandKit } from "./brandkit";
import { supersededReason } from "./render-guard";
import { PermanentJobError, type JobContext } from "./context";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { PLAN_SYSTEM } from "../prompts/plan";
import { structured } from "../providers/structured";
import { loadMotionModule, loadStaticModule } from "./modules";
import { staticMode } from "../render/composed/mode";
import { tryComposed } from "../render/composed/fallback";
import { newComposedTimings } from "../render/composed/index";
import { log } from "../log";

const ShortCopy = z.object({ headline: z.string(), body: z.string().optional(), cta: z.string().optional() });

/** Ask the strategist to shorten copy that overflowed the layout (same idea, fewer words). */
export async function shortenCopy(ctx: JobContext, spec: AdSpec, why: string): Promise<AdSpec> {
  const r = await structured(
    ctx.provider,
    ShortCopy,
    {
      system: PLAN_SYSTEM,
      prompt: `This ad's copy does not fit the layout (${why}). Rewrite it ~35% shorter: same angle, same buyer moment, plain words, no new claims.\nheadline: ${spec.headline}\nbody: ${spec.body ?? ""}\ncta: ${spec.cta ?? ""}`,
      reasoning: "low",
      signal: ctx.signal,
    },
    ctx.usage,
  );
  return AdSpecSchema.parse({
    ...spec,
    headline: r.headline.slice(0, 90),
    body: r.body ? r.body.slice(0, 220) : undefined,
    cta: r.cta ? r.cta.slice(0, 30) : spec.cta,
  });
}

export async function effectivePalette(brand: { colors: Array<{ hex: string; role: string }>; logoPath: string | null }): Promise<Record<string, unknown>> {
  const { buildPalette } = await import("../render/static/color");
  const { analyzeLogo } = await import("../render/static/logo");
  const info = brand.logoPath ? await analyzeLogo(brand.logoPath) : null;
  return { ...buildPalette(brand.colors, info?.vivid ?? null), logoVivid: info?.vivid ?? null };
}

export function specFromAd(ad: { visualBrief: unknown }): AdSpec {
  const vb = ad.visualBrief as { spec?: unknown } | null;
  const parsed = AdSpecSchema.safeParse(vb?.spec);
  if (!parsed.success) throw new PermanentJobError("ad has no valid spec in visualBrief.spec");
  return parsed.data;
}

function runRatios(ratios: string[]): Ratio[] {
  const r = ratios.filter((x): x is Ratio => (RATIOS as readonly string[]).includes(x));
  return r.length ? r : ["1:1"];
}

/** Templates already used by the run's other static ads (from their render meta), for the per-set cap. */
export async function runTemplatesUsed(db: JobContext["db"], runId: string, adId: string): Promise<string[]> {
  const rows = await db.ad.findMany({ where: { runId, kind: "static", id: { not: adId } }, select: { visualBrief: true } });
  return rows
    .map((r) => (r.visualBrief as { render?: { template?: unknown } } | null)?.render?.template)
    .filter((t): t is string => typeof t === "string")
    .sort();
}

/** Background field families (accent/dark/page/photo) of the run's other ads, from their render meta. */
export async function runFieldsUsed(db: JobContext["db"], runId: string, adId: string): Promise<string[]> {
  const rows = await db.ad.findMany({ where: { runId, kind: "static", id: { not: adId } }, select: { visualBrief: true } });
  return rows
    .map((r) => (r.visualBrief as { render?: { field?: unknown } } | null)?.render?.field)
    .filter((f): f is string => typeof f === "string" && f.length > 0)
    .sort();
}

/** Perceptual hashes of the run's other composed ads, for the diversity check. */
export async function runComposedHashes(db: JobContext["db"], runId: string, adId: string): Promise<string[]> {
  const rows = await db.ad.findMany({ where: { runId, kind: "static", id: { not: adId } }, select: { visualBrief: true } });
  return rows
    .map((r) => (r.visualBrief as { render?: { hash?: unknown } } | null)?.render?.hash)
    .filter((h): h is string => typeof h === "string" && h.length > 0)
    .sort();
}

/** Runs fn on a pooled render browser, timing the wait for a page slot and the render itself. */
async function timedBrowser<T>(
  pool: <R>(fn: (b: import("playwright").Browser) => Promise<R>, signal?: AbortSignal) => Promise<R>,
  fn: (b: import("playwright").Browser) => Promise<T>,
  signal: AbortSignal,
  lap: (name: string, t: number) => void,
): Promise<T> {
  const tWait = Date.now();
  return pool((b) => {
    lap("browserWaitMs", tWait);
    const tRender = Date.now();
    return fn(b).finally(() => lap("templateRenderMs", tRender));
  }, signal);
}

export async function renderJob(ctx: JobContext): Promise<unknown> {
  const { db, storage, job } = ctx;
  if (!job.adId) throw new PermanentJobError("render job without adId");
  const ad = await db.ad.findUnique({ where: { id: job.adId }, include: { run: { include: { brandProfile: true } } } });
  if (!ad) throw new PermanentJobError("ad not found");
  const early = await supersededReason(db, job, ctx.config.workerId);
  if (early) return { skipped: early };
  const run = ad.run;
  const spec = specFromAd(ad);
  const qcFeedback = typeof job.payload.qcFeedback === "string" ? job.payload.qcFeedback : undefined;
  const started = Date.now();
  // Instrumentation: per-phase wall-clock ms, stored in render meta and logged.
  const phases: Record<string, number> = { queueWaitMs: job.claimedAt && job.readyAt ? Math.max(0, job.claimedAt.getTime() - job.readyAt.getTime()) : -1 };
  const lap = (name: string, t: number) => (phases[name] = (phases[name] ?? 0) + Date.now() - t);
  await db.ad.update({ where: { id: ad.id }, data: { status: "rendering" } });

  const workDir = await mkdtemp(path.join(ctx.config.scratchDir, `ad-${ad.id}-`));
  try {
    const tKit = Date.now();
    const brand = await buildBrandKit(storage, workDir, { extraction: run.extraction, profile: run.brandProfile }, spec.visual.assetKeys);
    lap("brandKitMs", tKit);
    let files!: Array<{ ratio: Ratio; path: string; mime: string; width: number; height: number; bytes: number; durationSec?: number }>;
    let posterPath: string | undefined;
    let renderMeta: Record<string, unknown> | null = null;
    if (ad.kind === "motion") {
      const m = await loadMotionModule();
      if (!m.ok) throw new PermanentJobError(m.error);
      const res = await m.mod.renderMotionAd({
        spec,
        brand,
        siteUrl: run.url,
        ratios: run.isTrial ? ["9:16"] : runRatios(run.ratios),
        workDir,
        provider: ctx.provider,
        maxSeconds: 15,
        signal: ctx.signal,
        qcFeedback,
      });
      ctx.usage.push(...res.usage);
      files = res.files;
      posterPath = res.posterPath;
    } else {
      const timings = newComposedTimings();
      const tComposed = Date.now();
      const composedInput = { spec, brand, ratios: runRatios(run.ratios), workDir, avoidHashes: await runComposedHashes(db, run.id, ad.id), timings };
      const composed = staticMode() === "composed" ? await tryComposed(ctx, composedInput) : null;
      if (composed) {
        lap("composedMs", tComposed);
        Object.assign(phases, timings);
      }
      renderMeta = composed?.meta ?? { path: "template", mode: staticMode() };
      if (composed?.files) files = composed.files;
      const m = composed?.files ? null : await loadStaticModule();
      if (m && !m.ok) throw new PermanentJobError(m.error);
      let cur = spec;
      for (let fit = 0; m?.ok; fit++) {
        try {
          const [usedTemplates, usedFields] = await Promise.all([runTemplatesUsed(db, run.id, ad.id), runFieldsUsed(db, run.id, ad.id)]);
          const input = { spec: cur, brand, ratios: runRatios(run.ratios), workDir, provider: ctx.provider, signal: ctx.signal, qcFeedback, usedTemplates, usedFields };
          const withB = m.mod.renderStaticAdWith;
          const res = withB
            ? ctx.shared.withRenderBrowser
              ? await timedBrowser(ctx.shared.withRenderBrowser.bind(ctx.shared), (b) => withB(b, input), ctx.signal, lap)
              : await withB(await ctx.shared.renderBrowser(), input)
            : await m.mod.renderStaticAd(input);
          ctx.usage.push(...res.usage);
          files = res.files;
          const tpl = (res as { template?: unknown }).template;
          if (typeof tpl === "string" && renderMeta) renderMeta = { ...renderMeta, template: tpl };
          // Record the background family so later ads in the run can spread across families.
          const field = (res as { reports?: Array<{ field?: unknown }> }).reports?.find((r) => typeof r.field === "string")?.field;
          if (typeof field === "string" && renderMeta) renderMeta = { ...renderMeta, field };
          break;
        } catch (e) {
          const code = (e as { code?: unknown }).code;
          if (code !== "text_overflow" || fit >= 2) throw e;
          cur = await shortenCopy(ctx, cur, e instanceof Error ? e.message : "text overflow");
          await db.ad.update({
            where: { id: ad.id },
            data: { headline: cur.headline, body: cur.body ?? null, cta: cur.cta ?? null, visualBrief: { ...cur.visual, spec: cur } as unknown as Prisma.InputJsonValue },
          });
        }
      }
    }
    if (files.length === 0) throw new Error("renderer returned no files");
    // Effective palette the static renderer used (same functions it calls), for QC.
    const palette = await effectivePalette(brand).catch(() => null);
    const freshBrief = ((await db.ad.findUnique({ where: { id: ad.id }, select: { visualBrief: true } }))?.visualBrief as Record<string, unknown> | null) ?? {};

    const now = ctx.now();
    const expiresAt = new Date(now.getTime() + ctx.config.assetTtlDays * 86_400_000);
    const version = `v${ad.qcAttempts + 1}-${job.attempts}`;
    const rows: Array<{ adId: string; ratio: string; storageKey: string; mime: string; width: number; height: number; bytes: number; expiresAt: Date }> = [];
    const tUpload = Date.now();
    for (const f of files) {
      const ext = f.mime === "video/mp4" ? "mp4" : f.mime === "image/jpeg" ? "jpg" : "png";
      const key = runKey(run.workspaceId, run.id, "ads", ad.id, `${f.ratio.replace(":", "x")}-${version}.${ext}`);
      const body = await readFile(f.path);
      await storage.put(key, body, f.mime);
      rows.push({ adId: ad.id, ratio: f.ratio, storageKey: key, mime: f.mime, width: f.width, height: f.height, bytes: body.length, expiresAt });
    }
    if (posterPath) {
      const key = runKey(run.workspaceId, run.id, "ads", ad.id, `poster-${version}.png`);
      await storage.put(key, await readFile(posterPath), "image/png");
      rows.push({ adId: ad.id, ratio: "poster", storageKey: key, mime: "image/png", width: 0, height: 0, bytes: (await stat(posterPath)).size, expiresAt });
    }
    lap("uploadMs", tUpload);
    phases.totalMs = Date.now() - started;
    if (renderMeta) renderMeta = { ...renderMeta, phases };
    log("info", "render phases", { id: job.id, adId: ad.id, runId: run.id, kind: ad.kind, ...phases });
    const cost = ctx.usage.reduce((a, u) => a + u.costMicros, 0);
    // Re-check before touching the ad: another render may have taken over while this one ran.
    const late = await supersededReason(db, job, ctx.config.workerId);
    if (late) {
      await storage.deleteRunObjects(rows.map((r) => r.storageKey));
      return { skipped: late, files: 0 };
    }
    // Previous attempt's assets are superseded: delete their objects and rows.
    const old = await db.adAsset.findMany({ where: { adId: ad.id }, select: { storageKey: true } });
    const stale = old.map((o) => o.storageKey).filter((k) => !rows.some((r) => r.storageKey === k));
    const committed = await db.$transaction(async (tx) => {
      // Serialise commits per ad and fence on the lock, so only one render can land.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"render:" + ad.id}))`;
      if (await supersededReason(tx, job, ctx.config.workerId)) return false;
      await tx.adAsset.deleteMany({ where: { adId: ad.id } });
      await tx.adAsset.createMany({ data: rows });
      await tx.ad.update({
        where: { id: ad.id },
        data: {
          status: "qc",
          visualBrief: { ...freshBrief, ...(palette ? { palette } : {}), ...(renderMeta ? { render: renderMeta } : {}) } as unknown as Prisma.InputJsonValue,
          costMicros: { increment: BigInt(Math.round(cost)) }, durationMs: Date.now() - started },
      });
      await enqueue(tx, {
        type: "qc",
        runId: run.id,
        adId: ad.id,
        workspaceId: run.workspaceId,
        priority: priorityFor(run.isTrial, 30),
        payload: { durations: files.map((f) => ({ ratio: f.ratio, durationSec: f.durationSec ?? null })) },
      });
      return true;
    });
    if (!committed) {
      await storage.deleteRunObjects(rows.map((r) => r.storageKey));
      return { skipped: "superseded at commit", files: 0 };
    }
    // Only now that this render landed are the previous attempt's objects safe to delete.
    if (stale.length) await storage.deleteRunObjects(stale);
    return { files: rows.length };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
