// Server side of trade attribution (see ./trade.ts): read and write the workspace's `trade_tagged` AdsEvent.
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "./events";
import { normalizeTrade, tradeFromEventProps } from "./trade";

type FindTag = (workspaceId: string) => Promise<{ props: unknown } | null>;

const findFirstTag: FindTag = (workspaceId) =>
  prisma.adsEvent.findFirst({ where: { workspaceId, name: "trade_tagged" }, orderBy: { createdAt: "asc" }, select: { props: true } });

/** The trade a workspace signed up for (first `trade_tagged` event wins), or null. Never throws. */
export async function workspaceTrade(workspaceId: string, find: FindTag = findFirstTag): Promise<string | null> {
  try {
    return tradeFromEventProps((await find(workspaceId))?.props);
  } catch {
    return null;
  }
}

/** Tag the workspace with a trade once (later tags are ignored). Returns the workspace's trade. Never throws. */
export async function tagWorkspaceTrade(workspaceId: string, raw: unknown, ctx: { userId?: string; via: string }): Promise<string | null> {
  const trade = normalizeTrade(raw);
  const existing = await workspaceTrade(workspaceId);
  if (existing || !trade) return existing;
  await trackAdsEvent("trade_tagged", { workspaceId, userId: ctx.userId, props: { trade, via: ctx.via } });
  return trade;
}
