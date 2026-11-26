// Server runner for the weekly content queue (cron /api/cron/content-queue). Flag sys_content_queue, default OFF.
// Vercel's filesystem is read-only, so the queue is stored as AdsEvent `content_queue_built` (props = the queue); other
// systems read it with latestContentQueue(). scripts/content-queue.ts writes the same queue to a file for local tooling.
import { prisma } from "@/lib/prisma";
import { buildContentQueue, isoWeek, type ContentQueue } from "./content-queue";
import { recordSystemRun, systemEnabled } from "./systems";

export async function runContentQueue(now = new Date()): Promise<{ status: "off" | "exists" | "built"; items?: number }> {
  if (!(await systemEnabled(prisma, "content_queue"))) return { status: "off" };
  try {
    const week = isoWeek(now);
    const have = await prisma.adsEvent.findFirst({ where: { name: "content_queue_built", props: { path: ["week"], equals: week } }, select: { id: true } });
    if (have) {
      await recordSystemRun(prisma, "content_queue", { ok: true, outputs: 0 }, now);
      return { status: "exists" };
    }
    const queue = buildContentQueue(now);
    await prisma.adsEvent.create({ data: { name: "content_queue_built", props: JSON.parse(JSON.stringify(queue)) } });
    await recordSystemRun(prisma, "content_queue", { ok: true, outputs: queue.items.length }, now);
    return { status: "built", items: queue.items.length };
  } catch (e) {
    await recordSystemRun(prisma, "content_queue", { ok: false, error: e instanceof Error ? e.message : "failed" }, now);
    throw e;
  }
}

/** The newest queue, or null (what the social/content systems read). */
export async function latestContentQueue(): Promise<ContentQueue | null> {
  const row = await prisma.adsEvent.findFirst({ where: { name: "content_queue_built" }, orderBy: { createdAt: "desc" }, select: { props: true } });
  return (row?.props as unknown as ContentQueue | null) ?? null;
}
