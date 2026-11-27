import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/ads/jobs";
import { googleAccess } from "@/lib/ads/google/access";
import { GOOGLE_JOBS, GOOGLE_JOB_TYPES, SYNC_STALE_MS, canCreateAccounts, oauthVerified } from "@/lib/ads/google/config";
import { readinessFor } from "@/lib/ads/google/connection";
import { googleAdsUrl } from "@/lib/ads/google/core/ops";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Everything the Google dialog and gallery panel need for one run. Publishes come from the DB; stale ones get a background sync. */
export async function GET(request: Request) {
  try {
    const runId = new URL(request.url).searchParams.get("runId");
    if (!runId) throw new AdsHttpError(400, "invalid", "Missing run.");
    const { workspace } = await requireWorkspaceMember({ runId });
    const access = await googleAccess(workspace);
    if (access !== "ok") return NextResponse.json({ available: false, locked: access, canCreateAccounts: false, oauthVerified: oauthVerified(), connection: null, publishes: [] });

    const [conn, rows, job] = await Promise.all([
      prisma.googleAdsConnection.findUnique({ where: { workspaceId: workspace.id } }),
      prisma.googlePublish.findMany({ where: { runId, workspaceId: workspace.id }, orderBy: { createdAt: "desc" } }),
      prisma.adJob.findFirst({ where: { runId, workspaceId: workspace.id, type: { in: GOOGLE_JOB_TYPES } }, orderBy: { createdAt: "desc" }, select: { type: true, status: true, lastError: true } }),
    ]);

    // Stale serving/policy/metrics: queue a sync, never wait for it.
    const now = Date.now();
    const stale = rows.some((r) => r.status === "published" && (!r.metricsAt || now - r.metricsAt.getTime() > SYNC_STALE_MS));
    if (stale) {
      const inFlight = await prisma.adJob.findFirst({ where: { runId, workspaceId: workspace.id, type: GOOGLE_JOBS.sync, status: { in: ["queued", "running"] } }, select: { id: true } });
      if (!inFlight) await enqueueJob({ type: GOOGLE_JOBS.sync, runId, workspaceId: workspace.id, payload: { runId }, priority: 1, maxAttempts: 1 }).catch(() => undefined);
    }

    const readiness = conn ? await readinessFor(conn) : null;
    return NextResponse.json({
      available: true,
      canCreateAccounts: canCreateAccounts(),
      oauthVerified: oauthVerified(),
      connection: conn && readiness ? {
        mode: conn.mode, email: conn.email ?? undefined, customerId: conn.customerId ?? undefined, accountName: conn.accountName ?? undefined,
        currency: conn.currency ?? undefined, timeZone: conn.timeZone ?? undefined, readiness,
      } : null,
      publishes: rows.map((r) => ({
        id: r.id, kind: r.kind, status: r.status, campaignId: r.campaignId ?? undefined, campaignName: r.campaignName ?? undefined,
        adCount: r.kind === "search" ? 1 : Math.max(1, strings(r.adIds).length),
        serving: r.serving, policy: r.policy, policyIssues: strings(r.policyIssues),
        metrics: r.metrics ? { ...(r.metrics as object), since: (r.metrics as { since?: string }).since ?? r.createdAt.toISOString() } : undefined,
        googleAdsUrl: googleAdsUrl(r.customerId, r.campaignId), error: r.error ?? undefined, updatedAt: r.updatedAt.toISOString(),
      })),
      job: job ? { type: job.type, status: job.status, error: job.status === "failed" ? job.lastError?.slice(0, 300) ?? undefined : undefined } : undefined,
    });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
