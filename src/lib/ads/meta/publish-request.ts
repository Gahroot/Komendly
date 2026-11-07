// Validates a publish request and enqueues the engine job + pending MetaPublish rows.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { RATIOS, type Ratio } from "@/lib/ads/contracts";
import { enqueueJob } from "@/lib/ads/jobs";
import { AdsHttpError } from "@/lib/ads/workspace";
import type { PublishJobPayload } from "./core/publish";

export const PublishRequestSchema = z.object({
  runId: z.string().min(1),
  adIds: z.array(z.string().min(1)).min(1).max(50),
  adAccountId: z.string().regex(/^(act_)?\d+$/),
  pageId: z.string().regex(/^\d+$/),
  budget: z.number().int().positive().max(100_000_000).optional(), // minor units, ad set daily budget
  ratios: z.array(z.enum(RATIOS)).min(1).optional(),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(25).optional(),
});
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export function qcPassed(qcReport: unknown): boolean {
  return !!qcReport && typeof qcReport === "object" && (qcReport as { pass?: unknown }).pass === true;
}

export async function enqueueMetaPublish(req: PublishRequest, ctx: { workspaceId: string; userId: string }) {
  const run = await prisma.adRun.findUnique({ where: { id: req.runId }, select: { workspaceId: true, ratios: true, status: true } });
  if (!run || run.workspaceId !== ctx.workspaceId) throw new AdsHttpError(404, "not_found", "Not found.");
  const ads = await prisma.ad.findMany({ where: { id: { in: req.adIds }, runId: req.runId, workspaceId: ctx.workspaceId }, include: { assets: true } });
  const eligible = ads.filter((a) => a.status === "ready" && qcPassed(a.qcReport));
  if (eligible.length !== req.adIds.length) throw new AdsHttpError(400, "ads_not_ready", "Only finished ads that passed quality checks can be published.");
  const ratios: Ratio[] = (req.ratios ?? RATIOS.filter((r) => run.ratios.includes(r))).filter((r) => run.ratios.includes(r));
  if (!ratios.length) throw new AdsHttpError(400, "no_ratios", "Pick at least one format.");
  const payload: PublishJobPayload & { requestedBy: string } = {
    adIds: eligible.map((a) => a.id).sort(), adAccountId: req.adAccountId, pageId: req.pageId,
    budget: req.budget, ratios, countries: req.countries, requestedBy: ctx.userId,
  };
  const job = await enqueueJob({ type: "publish_meta", runId: req.runId, workspaceId: ctx.workspaceId, payload: { ...payload }, priority: 5, maxAttempts: 1 });
  const rows = eligible.flatMap((a) => ratios.filter((r) => a.assets.some((x) => x.ratio === r)).map((ratio) => ({ adId: a.id, ratio, jobId: job.id, adAccountId: req.adAccountId })));
  await prisma.metaPublish.createMany({ data: rows });
  await prisma.metaConnection.update({ where: { workspaceId: ctx.workspaceId }, data: { adAccountId: req.adAccountId, pageId: req.pageId } }).catch(() => undefined);
  return { jobId: job.id, rows: rows.length };
}
