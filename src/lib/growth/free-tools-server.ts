// Server side of the free tools: kill switch, per-IP rate limit, hard daily cap, job queue, usage events.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { trackAdsEvent } from "@/lib/ads/events";
import { systemEnabled } from "@/lib/growth/systems";
import { dailyCap, perIpHourly, startOfUtcDay, underDailyCap, type AiToolSlug, type FreeToolSlug } from "@/lib/growth/free-tools";

export const freeToolsEnabled = () => systemEnabled(prisma, "free_tools");

export function hashIp(ip: string): string {
  return createHash("sha256").update(`free_tools:${ip}`).digest("hex").slice(0, 32);
}

export function trackToolUse(tool: FreeToolSlug): Promise<void> {
  return trackAdsEvent("free_tool_used", { props: { system: "free_tools", tool } });
}

export type QueueResult = { ok: true; jobId: string } | { ok: false; status: number; error: string };

/** Queue one AI tool request. Refuses (429) over the per-IP hourly limit or the global daily cap. */
export async function queueAiTool(tool: AiToolSlug, input: Record<string, string>, ip: string): Promise<QueueResult> {
  const ipHash = hashIp(ip);
  if (!(await rateLimit(`free_tool:${ipHash}`, perIpHourly(process.env), 3600))) {
    return { ok: false, status: 429, error: "You've used this a lot in the last hour. Try again later, or make full ads from your website." };
  }
  const usedToday = await prisma.freeToolJob.count({ where: { createdAt: { gte: startOfUtcDay(new Date()) } } });
  if (!underDailyCap(usedToday, dailyCap(process.env))) {
    return { ok: false, status: 429, error: "Today's free AI runs are used up. Come back tomorrow, or make full ads from your website." };
  }
  const job = await prisma.freeToolJob.create({ data: { tool, input, ipHash }, select: { id: true } });
  await trackToolUse(tool);
  return { ok: true, jobId: job.id };
}
