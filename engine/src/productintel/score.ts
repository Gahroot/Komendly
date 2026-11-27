// scorePack(runId): programmatic image + copy checks on every ready static ad of a pack, plus (optional) a rubric
// critique through the Codex provider on a sample (vision on the first image sample). Stores AdsEvent `creative_score`.
// Report-only: never blocks or edits a pack. Exposed for the render pipeline to call later.
import { CREATIVE_SCORE_EVENT, scorePackPure, scoreFromIssues, type AdCopy, type ImageMetrics, type PackScore } from "../../../src/lib/product-intel/creative";
import { blend, buildCritiquePrompt, CRITIQUE_SYSTEM, critiqueToIssues, CritiqueSchema, type Critique } from "../../../src/lib/product-intel/critique";
import type { z } from "zod";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import type { AIProvider } from "../providers/types";
import { structured } from "../providers/structured";
import type { Storage } from "../storage/s3";
import { imageMetrics } from "./image-metrics";

const SAMPLE = 3;
const arr = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export interface ScoreDeps { db: Db; storage: Storage; provider?: AIProvider | null; now?: () => Date }

export async function scorePack(d: ScoreDeps, runId: string, opts: { critique?: boolean; write?: boolean } = {}): Promise<(PackScore & { critiqued: number; trade: string | null; model: string; promptVersion: string }) | null> {
  const run = await d.db.adRun.findUnique({ where: { id: runId }, select: { id: true, workspaceId: true, brandProfileId: true, extraction: true } });
  if (!run) return null;
  const [brand, ads, tag] = await Promise.all([
    run.brandProfileId ? d.db.brandProfile.findUnique({ where: { id: run.brandProfileId }, select: { name: true, colors: true, logoKey: true, mainOffer: true } }) : null,
    d.db.ad.findMany({ where: { runId, status: "ready", kind: "static" }, orderBy: { index: "asc" }, take: 30, select: { id: true, index: true, kind: true, awareness: true, angle: true, hook: true, headline: true, body: true, cta: true, claims: true, visualBrief: true, assets: { where: { mime: { startsWith: "image/" } }, orderBy: { createdAt: "asc" }, take: 1, select: { storageKey: true, mime: true } } } }),
    d.db.adsEvent.findFirst({ where: { workspaceId: run.workspaceId, name: "trade_tagged" }, orderBy: { createdAt: "desc" }, select: { props: true } }),
  ]);
  const main = ads.filter((a) => !rec(a.visualBrief).bonusKind);
  if (!main.length) return null;
  const trade = typeof rec(tag?.props).trade === "string" ? String(rec(tag?.props).trade) : null;
  const ext = rec(run.extraction);
  const city = typeof ext.city === "string" ? ext.city : typeof ext.location === "string" ? ext.location : null;
  const ctx = { trade, city, offer: brand?.mainOffer ?? null, brandName: brand?.name ?? null, hasLogo: Boolean(brand?.logoKey) };
  const hexes = arr(brand?.colors).map((c) => String(c.hex ?? ""));
  const bufs = new Map<string, Buffer>();
  const items: Array<{ copy: AdCopy; metrics: ImageMetrics | null }> = [];
  for (const a of main) {
    let metrics: ImageMetrics | null = null;
    const key = a.assets[0]?.storageKey;
    if (key) {
      try { const b = await d.storage.get(key); bufs.set(a.id, b); metrics = await imageMetrics(b, hexes); } catch (e) { log("warn", "creative qa image failed", { adId: a.id, error: errMsg(e) }); }
    }
    const vb = rec(a.visualBrief);
    items.push({ copy: { id: a.id, index: a.index, kind: a.kind, awareness: a.awareness, angle: a.angle, hook: a.hook, headline: a.headline, body: a.body, cta: a.cta, claimCount: arr(a.claims).length, template: typeof vb.layout === "string" ? vb.layout : typeof rec(vb.concept).layout === "string" ? String(rec(vb.concept).layout) : null }, metrics });
  }
  const score = scorePackPure(runId, items, ctx);
  let critiqued = 0;
  if (opts.critique && d.provider?.name === "codex") {
    try {
      const sample = items.filter((_, i) => i % Math.max(1, Math.floor(items.length / SAMPLE)) === 0).slice(0, SAMPLE);
      const first = sample[0] ? bufs.get(sample[0].copy.id) : undefined;
      const images = first ? [{ mediaType: "image/jpeg", base64: (await (await import("sharp")).default(first).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer()).toString("base64") }] : undefined;
      const c = await structured(d.provider, CritiqueSchema as unknown as z.ZodType<Critique>, { system: CRITIQUE_SYSTEM, prompt: buildCritiquePrompt(ctx, sample.map((s) => s.copy)) + (images ? "\nOne image (the first ad) is attached." : ""), images, reasoning: "low", signal: AbortSignal.timeout(120_000) }, []);
      for (const r of c.ads) {
        const a = score.ads.find((x) => x.adId === r.adId);
        if (!a) continue;
        const { issues, rubric } = critiqueToIssues(r);
        a.issues.push(...issues);
        a.score = blend(scoreFromIssues(a.issues.filter((i) => !i.code.startsWith("ai_"))), rubric);
        critiqued++;
      }
      if (critiqued) score.packScore = Math.round(score.ads.reduce((s, a) => s + a.score, 0) / score.ads.length);
    } catch (e) { log("warn", "creative critique failed (programmatic score kept)", { runId, error: errMsg(e) }); }
  }
  const result = { ...score, critiqued, trade, model: d.provider?.name ?? "none", promptVersion: "unversioned" };
  if (opts.write !== false) await d.db.adsEvent.create({ data: { name: CREATIVE_SCORE_EVENT, workspaceId: run.workspaceId, runId, props: JSON.parse(JSON.stringify(result)) } });
  return result;
}
