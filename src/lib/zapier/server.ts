// Zapier integration: Ad Packs and ready ads with 7-day share links (S3 SigV4 max, fetchable by Slack/Sheets/Meta tools),
// gated exactly like the MCP server (verified-email gate, locked trial/bonus ads get no link).
import type { AdsWorkspace, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AdsHttpError, getOrCreateWorkspace, isPaidWorkspace, requireUser, requireWorkspaceMember } from "@/lib/ads/workspace";
import { loadRunView } from "@/lib/ads/run-view";
import { presignShareable } from "@/lib/ads/storage";
import { canServeAsset } from "@/lib/ads/bonus-access";
import { isBonusUnlocked } from "@/lib/ads/bonus-unlock";
import { downloadNeedsVerifiedEmail, DOWNLOAD_GATE_MESSAGE } from "@/lib/ads/download-gate";
import { SHARE_LINK_SECONDS } from "@/lib/agent-keys/meta-kit";
import { isDeliverable, zapierRun, type ZapierAd, type ZapierRun } from "./format";

const HIDDEN_KINDS = ["gift", "nurture"]; // same as GET /api/ads/runs

async function buildRun(runId: string, access: { user: User; workspace: AdsWorkspace }, origin: string): Promise<ZapierRun | null> {
  const view = await loadRunView(runId);
  if (!view) return null;
  const gated = downloadNeedsVerifiedEmail({ isTrial: view.isTrial, isPaid: isPaidWorkspace(access.workspace), emailVerified: Boolean(access.user.emailVerifiedAt) });
  const unlocked = await isBonusUnlocked(access.workspace);
  const ids = view.ads.filter((a) => a.status === "ready" && !a.locked).flatMap((a) => a.assets.map((x) => x.id));
  const [rows, runRow] = await Promise.all([
    ids.length && !gated ? prisma.adAsset.findMany({ where: { id: { in: ids } }, select: { id: true, storageKey: true, mime: true, ratio: true, ad: { select: { visualBrief: true } } } }) : [],
    prisma.adRun.findUnique({ where: { id: runId }, select: { brandProfile: { select: { landingPage: true, url: true } } } }),
  ]);
  const urls = new Map<string, string>();
  for (const row of rows) {
    if (canServeAsset({ visualBrief: row.ad.visualBrief, assetRatio: row.ratio, unlocked, use: "download" })) {
      urls.set(row.id, await presignShareable(row.storageKey, { contentType: row.mime }));
    }
  }
  const landingUrl = runRow?.brandProfile?.landingPage || runRow?.brandProfile?.url || view.url;
  const expiresAt = new Date(Date.now() + SHARE_LINK_SECONDS * 1000).toISOString();
  const readyCount = view.ads.filter((a) => a.status === "ready").length;
  return zapierRun(view, { landingUrl, urls, expiresAt, origin, gateNote: gated && readyCount > 0 ? DOWNLOAD_GATE_MESSAGE : null });
}

/** One Ad Pack of the caller's workspace (404 otherwise). */
export async function zapierRunFor(runId: string, origin: string): Promise<ZapierRun> {
  const access = await requireWorkspaceMember({ runId });
  const run = await buildRun(runId, access, origin);
  if (!run) throw new AdsHttpError(404, "not_found", "Not found. Check the run id.");
  return run;
}

/** Newest ready ads of the caller's workspace (with links), newest first; `runId` narrows to one pack. */
export async function zapierReadyAds(origin: string, opts: { limit: number; runId?: string }): Promise<ZapierAd[]> {
  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user);
  const recent = await prisma.ad.findMany({
    where: { workspaceId: workspace.id, status: "ready", run: { kind: { notIn: HIDDEN_KINDS } }, ...(opts.runId ? { runId: opts.runId } : {}) },
    orderBy: { updatedAt: "desc" },
    take: opts.limit,
    select: { id: true, runId: true, updatedAt: true },
  });
  const readyAt = new Map(recent.map((a) => [a.id, a.updatedAt.toISOString()]));
  const ads = new Map<string, ZapierAd>();
  for (const runId of [...new Set(recent.map((a) => a.runId))]) {
    const run = await buildRun(runId, { user, workspace }, origin);
    for (const ad of run?.ads ?? []) if (readyAt.has(ad.id) && isDeliverable(ad)) ads.set(ad.id, { ...ad, created_at: readyAt.get(ad.id)! });
  }
  return recent.flatMap((a) => ads.get(a.id) ?? []);
}

