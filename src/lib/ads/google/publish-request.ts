// Validates a Google publish request (every limit, again) and enqueues publish_google + pending GooglePublish rows.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/ads/jobs";
import { AdsHttpError } from "@/lib/ads/workspace";
import { qcPassed } from "@/lib/ads/meta/publish-request";
import { budgetSuggestion, toMicros } from "./core/draft";
import { keywordText, searchCopyErrors } from "./core/text";
import { CAMPAIGN_KINDS, LIMITS, type CampaignKind, type GeoPick, type KeywordPick } from "./core/types";
import { GOOGLE_JOBS, GOOGLE_JOB_TYPES } from "./config";

const Geo = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("location"), id: z.string().regex(/^\d+$/), name: z.string().max(200), type: z.string().max(60), countryCode: z.string().max(2) }),
  z.object({ kind: z.literal("radius"), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), miles: z.number().positive().max(LIMITS.radiusMilesMax), label: z.string().max(200) }),
]);

export const GooglePublishSchema = z.object({
  runId: z.string().min(1),
  adIds: z.array(z.string().min(1)).max(LIMITS.demandGenImagesMax),
  customerId: z.string().min(10).max(14),
  campaigns: z.array(z.enum(CAMPAIGN_KINDS as [CampaignKind, ...CampaignKind[]])).min(1).max(2),
  dailyBudget: z.number().positive().max(100_000),
  geo: z.array(Geo).min(1).max(LIMITS.geoMax),
  keywords: z.array(z.object({ text: z.string().max(200), match: z.enum(["PHRASE", "EXACT"]) })).min(1).max(LIMITS.keywordsMax),
  search: z.object({ headlines: z.array(z.string().max(200)).max(LIMITS.headlinesMax), descriptions: z.array(z.string().max(400)).max(LIMITS.descriptionsMax), path1: z.string().max(60), path2: z.string().max(60) }),
  finalUrl: z.string().url().max(2000),
  youtubeVideoUrl: z.string().max(300).optional(),
});
export type GooglePublishRequest = z.infer<typeof GooglePublishSchema>;

/** YouTube link or id -> 11-char video id. */
export function youtubeVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const id = host === "youtu.be" ? u.pathname.slice(1).split("/")[0]
    : host === "youtube.com" ? u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/)?.[1] : null;
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Plain-words problems with the request (server re-check of every limit). [] = OK. */
export function publishRequestErrors(req: GooglePublishRequest, currency: string | null): string[] {
  const errs: string[] = [];
  const search = { headlines: req.search.headlines.map((h) => h.trim()), descriptions: req.search.descriptions.map((d) => d.trim()), path1: req.search.path1.trim(), path2: req.search.path2.trim() };
  errs.push(...searchCopyErrors(search, LIMITS));
  for (const k of req.keywords) {
    const t = keywordText(k.text);
    if (!t || t !== k.text.trim().toLowerCase().replace(/\s+/g, " ")) errs.push(`The search phrase "${k.text.slice(0, 40)}" has characters Google won't accept.`);
  }
  const min = budgetSuggestion(currency).min;
  if (req.dailyBudget < min) errs.push(`The daily budget must be at least ${min} ${budgetSuggestion(currency).currency}.`);
  if (!/^https?:\/\//i.test(req.finalUrl)) errs.push("The web page must start with https://");
  if (req.youtubeVideoUrl?.trim() && !youtubeVideoId(req.youtubeVideoUrl)) errs.push("That doesn't look like a YouTube link.");
  if (req.campaigns.includes("demand_gen") && req.adIds.length === 0 && !req.youtubeVideoUrl?.trim()) errs.push("Pick at least one image for image ads.");
  return [...new Set(errs)];
}

export async function publishJobInFlight(runId: string, workspaceId: string): Promise<boolean> {
  return !!(await prisma.adJob.findFirst({ where: { runId, workspaceId, type: GOOGLE_JOBS.publish, status: { in: ["queued", "running"] } }, select: { id: true } }));
}

export async function enqueueGooglePublish(
  req: GooglePublishRequest,
  ctx: { workspaceId: string; userId: string; conn: { mode: string; customerId: string; loginCustomerId: string | null; currency: string | null } },
) {
  const run = await prisma.adRun.findUnique({ where: { id: req.runId }, select: { workspaceId: true } });
  if (!run || run.workspaceId !== ctx.workspaceId) throw new AdsHttpError(404, "not_found", "Not found.");
  if (await publishJobInFlight(req.runId, ctx.workspaceId)) throw new AdsHttpError(409, "publish_in_progress", "Your ads are already being created. Give it a minute.");
  const errs = publishRequestErrors(req, ctx.conn.currency);
  if (errs.length) throw new AdsHttpError(400, "invalid", errs[0]!, { problems: errs });
  const adIds = [...new Set(req.adIds)];
  if (adIds.length) {
    const ads = await prisma.ad.findMany({ where: { id: { in: adIds }, runId: req.runId, workspaceId: ctx.workspaceId }, select: { id: true, status: true, qcReport: true } });
    if (ads.filter((a) => a.status === "ready" && qcPassed(a.qcReport)).length !== adIds.length) {
      throw new AdsHttpError(400, "ads_not_ready", "Only finished ads that passed our quality checks can go to Google.");
    }
  }
  const geo: GeoPick[] = req.geo;
  const keywords: KeywordPick[] = req.keywords.map((k) => ({ text: keywordText(k.text), match: k.match }));
  const campaigns = [...new Set(req.campaigns)];
  const payload = {
    customerId: ctx.conn.customerId, loginCustomerId: ctx.conn.loginCustomerId, mode: ctx.conn.mode, campaigns,
    dailyBudgetMicros: toMicros(req.dailyBudget), currency: ctx.conn.currency, geo, keywords,
    search: { headlines: req.search.headlines.map((h) => h.trim()), descriptions: req.search.descriptions.map((d) => d.trim()), path1: req.search.path1.trim(), path2: req.search.path2.trim() },
    finalUrl: req.finalUrl.trim(), adIds, youtubeVideoUrl: req.youtubeVideoUrl?.trim() || undefined,
    youtubeVideoId: req.youtubeVideoUrl?.trim() ? youtubeVideoId(req.youtubeVideoUrl) : undefined, requestedBy: ctx.userId,
  };
  const job = await enqueueJob({ type: GOOGLE_JOBS.publish, runId: req.runId, workspaceId: ctx.workspaceId, payload, priority: 5, maxAttempts: 1 });
  await prisma.googlePublish.createMany({
    data: campaigns.map((kind) => ({ runId: req.runId, workspaceId: ctx.workspaceId, kind, customerId: ctx.conn.customerId, adIds: kind === "demand_gen" ? adIds : [], jobId: job.id })),
  });
  return { jobId: job.id };
}

export { GOOGLE_JOB_TYPES };
