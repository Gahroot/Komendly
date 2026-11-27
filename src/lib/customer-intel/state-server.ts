// Loads the CustomerState for nextBestAction from the workspace's own rows. Flag sys_simplicity (default OFF).
import type { AdsWorkspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPaidWorkspace } from "@/lib/ads/billing-gates";
import { dropCost } from "./agency-server";
import { nextBestAction, type CustomerState, type NextAction } from "./next-action";

export async function simplicityEnabled(): Promise<boolean> {
  return Boolean((await prisma.adsFeatureFlag.findUnique({ where: { key: "sys_simplicity" } }).catch(() => null))?.enabled);
}

export async function loadCustomerState(ws: AdsWorkspace, now = new Date()): Promise<CustomerState> {
  const run = await prisma.adRun.findFirst({ where: { workspaceId: ws.id, kind: { notIn: ["gift", "nurture"] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true, ads: { select: { status: true, publishes: { select: { status: true } } } } } });
  const [meta, downloaded, approval, link] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { workspaceId: ws.id }, select: { id: true } }).catch(() => null),
    run ? prisma.adsEvent.count({ where: { workspaceId: ws.id, name: "export_downloaded" } }) : Promise.resolve(0),
    run ? prisma.adsEvent.findFirst({ where: { name: "ad_approval", runId: run.id }, orderBy: { createdAt: "desc" }, select: { props: true } }) : null,
    run ? prisma.adsEvent.findFirst({ where: { name: "approve_link_created", runId: run.id }, select: { id: true } }) : null,
  ]);
  const action = (approval?.props as { action?: string } | null)?.action;
  return {
    paid: isPaidWorkspace(ws), trialUsed: Boolean(ws.trialUsedAt), runStatus: run?.status ?? null,
    readyAds: run?.ads.filter((a) => a.status === "ready").length ?? 0, downloaded: downloaded > 0,
    approvalPending: Boolean(link) && !action, changesRequested: action === "changes",
    metaConnected: Boolean(meta), adsLive: Boolean(run?.ads.some((a) => a.publishes.some((p) => p.status === "published"))),
    credits: ws.creditBalance, dropCost: dropCost(), daysSinceLastPack: run ? Math.floor((now.getTime() - run.createdAt.getTime()) / 86_400_000) : null,
  };
}

/** The one next step for a workspace, or null when the flag is off. Never throws. */
export async function nextStepFor(ws: AdsWorkspace): Promise<NextAction | null> {
  try {
    return (await simplicityEnabled()) ? nextBestAction(await loadCustomerState(ws)) : null;
  } catch {
    return null;
  }
}
