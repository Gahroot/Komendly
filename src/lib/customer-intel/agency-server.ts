// Agency dashboard data + bulk drop (Next/Prisma glue). Plan gate: Agency plan with a live subscription, and flag sys_agency_ops.
import type { AdsWorkspace, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WEEKLY_RATIOS, WEEKLY_STATICS } from "@/lib/ads/weekly-drop";
import { creditCost } from "@/lib/ads/run";
import { isPaidWorkspace } from "@/lib/ads/billing-gates";
import { isUnlimitedPlan } from "@/lib/ads/billing-config";
import { startRun } from "@/lib/ads/run-start";
import { AdsHttpError } from "@/lib/ads/workspace";
import type { RequestFingerprint } from "@/lib/ads/abuse";
import { clientRows, dueForDrop, planBulkDrop, weekKey, type ClientRow, type RowView } from "./agency";

export const AGENCY_FLAG = "sys_agency_ops";
export const DROP_EVENT = "agency_drop";
const DAY = 86_400_000;

export const dropCost = () => creditCost({ staticCount: WEEKLY_STATICS, ratios: [...WEEKLY_RATIOS], motionCount: 0 });

export async function agencyEnabled(): Promise<boolean> {
  return Boolean((await prisma.adsFeatureFlag.findUnique({ where: { key: AGENCY_FLAG } }).catch(() => null))?.enabled);
}
export const isAgencyWorkspace = (ws: Pick<AdsWorkspace, "adsPlan" | "subscriptionStatus" | "suspendedAt">) => ws.adsPlan === "agency" && isPaidWorkspace(ws);

export async function loadAgencyView(ws: AdsWorkspace, now = new Date()): Promise<{ rows: RowView[]; due: string[]; credits: number; dropCost: number; unlimited: boolean; pooled30d: number }> {
  const brands = await prisma.brandProfile.findMany({ where: { workspaceId: ws.id }, orderBy: { name: "asc" }, select: { id: true, name: true, domain: true, logoKey: true }, take: 50 });
  const runs = await prisma.adRun.findMany({
    where: { workspaceId: ws.id, brandProfileId: { in: brands.map((b) => b.id) }, kind: { notIn: ["gift", "nurture"] }, isTrial: false, createdAt: { gte: new Date(now.getTime() - 90 * DAY) } },
    orderBy: { createdAt: "desc" }, take: 400,
    select: { id: true, brandProfileId: true, status: true, createdAt: true, creditsCharged: true, ads: { select: { status: true, publishes: { select: { status: true } } } } },
  });
  const approvals = runs.length ? await prisma.adsEvent.findMany({ where: { name: "ad_approval", runId: { in: runs.map((r) => r.id) } }, orderBy: { createdAt: "desc" }, select: { runId: true, props: true } }) : [];
  const links = runs.length ? await prisma.adsEvent.findMany({ where: { workspaceId: ws.id, name: "approve_link_created", runId: { in: runs.map((r) => r.id) } }, select: { runId: true } }).catch(() => []) : [];
  const meta = await prisma.metaConnection.findUnique({ where: { workspaceId: ws.id }, select: { id: true } }).catch(() => null);
  const rows: ClientRow[] = brands.map((b) => {
    const mine = runs.filter((r) => r.brandProfileId === b.id);
    const latest = mine[0] ?? null;
    const last = latest ? approvals.find((a) => a.runId === latest.id) : null;
    const action = (last?.props as { action?: string } | null)?.action;
    const sent = latest ? links.some((l) => l.runId === latest.id) : false;
    return {
      brandId: b.id, name: b.name?.trim() || b.domain, domain: b.domain, logoUrl: b.logoKey ? `/api/ads/brands/${b.id}/logo` : null,
      latestRun: latest ? { id: latest.id, status: latest.status, createdAt: latest.createdAt.toISOString(), readyAds: latest.ads.filter((a) => a.status === "ready").length, creditsCharged: latest.creditsCharged } : null,
      approval: action === "approve" ? "approved" : action === "changes" ? "changes" : sent ? "waiting" : "none",
      creditsUsed30d: mine.filter((r) => r.createdAt.getTime() >= now.getTime() - 30 * DAY).reduce((a, r) => a + r.creditsCharged, 0),
      adsLive: mine.some((r) => r.ads.some((a) => a.publishes.some((p) => p.status === "published"))),
      metaConnected: Boolean(meta),
    };
  });
  const cost = dropCost();
  const views = clientRows(rows, now, { credits: ws.creditBalance, dropCost: cost });
  return { rows: views, due: dueForDrop(views), credits: ws.creditBalance, dropCost: cost, unlimited: isUnlimitedPlan(ws, now), pooled30d: rows.reduce((a, r) => a + r.creditsUsed30d, 0) };
}

export interface DropResult { brandId: string; name: string; status: "started" | "already_done" | "failed"; runId?: string; message?: string }

/**
 * Bulk "make this week's drop for these clients". Server-side only: membership comes from the caller, brands are
 * re-read from this workspace, the pool is pre-checked, and every run still goes through startRun (credit reserve,
 * brand limit, concurrency and rate limits). Idempotent per brand per ISO week via AdsEvent agency_drop.
 */
export async function bulkDrop(input: { user: User; workspace: AdsWorkspace; brandIds: string[]; fp: RequestFingerprint; now?: Date }): Promise<{ results: DropResult[]; week: string }> {
  const { user, workspace } = input;
  const now = input.now ?? new Date();
  const week = weekKey(now);
  const brands = await prisma.brandProfile.findMany({ where: { workspaceId: workspace.id, id: { in: input.brandIds } }, select: { id: true, name: true, domain: true, url: true } });
  const done = await prisma.adsEvent.findMany({ where: { workspaceId: workspace.id, name: DROP_EVENT, props: { path: ["week"], equals: week } }, select: { props: true } });
  const doneIds = new Map(done.map((d) => [(d.props as { brandId?: string }).brandId ?? "", (d.props as { runId?: string }).runId]));
  const todo = brands.filter((b) => !doneIds.has(b.id));
  const plan = planBulkDrop({ selected: todo.map((b) => b.id), valid: new Set(brands.map((b) => b.id)), perRunCost: dropCost(), credits: workspace.creditBalance, unlimited: isUnlimitedPlan(workspace, now) });
  if (todo.length && !plan.ok) throw new AdsHttpError(plan.cost ? 402 : 400, plan.cost ? "insufficient_credits" : "invalid_input", plan.reason);
  const results: DropResult[] = brands.filter((b) => doneIds.has(b.id)).map((b) => ({ brandId: b.id, name: b.name || b.domain, status: "already_done" as const, runId: doneIds.get(b.id) }));
  for (const b of todo) {
    try {
      const r = await startRun({ url: b.url, brandProfileId: b.id, goal: "auto", count: WEEKLY_STATICS, ratios: [...WEEKLY_RATIOS], motion: false }, { user, workspace, fp: input.fp });
      await prisma.adsEvent.create({ data: { name: DROP_EVENT, workspaceId: workspace.id, userId: user.id, runId: r.runId, props: { week, brandId: b.id, runId: r.runId } } });
      results.push({ brandId: b.id, name: b.name || b.domain, status: "started", runId: r.runId });
    } catch (e) {
      results.push({ brandId: b.id, name: b.name || b.domain, status: "failed", message: e instanceof AdsHttpError ? e.message : "Something went wrong. Try this client again in a minute." });
    }
  }
  return { results, week };
}
