// Server runner for the IndexNow system (cron /api/cron/indexnow). Flag sys_indexnow, default OFF. Submission history
// lives in AdsEvent `indexnow_submitted` {urls[], status} so it survives deploys; no schema change.
import sitemap from "@/app/sitemap";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";
import { MAX_URLS_PER_DAY, normalizeUrls, RESUBMIT_AFTER_DAYS, selectUrls, submitToIndexNow, type IndexNowResult } from "./indexnow";
import { organicPaths } from "./organic/registry";
import { recordSystemRun, systemEnabled } from "./systems";

export async function runIndexNow(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<IndexNowResult | { status: "off" }> {
  if (!(await systemEnabled(prisma, "indexnow"))) return { status: "off" };
  try {
    const entries = await sitemap();
    const all = normalizeUrls([...organicPaths(), ...entries.map((e) => e.url)], SITE_URL);
    const since = new Date(now.getTime() - RESUBMIT_AFTER_DAYS * 86_400_000);
    const rows = await prisma.adsEvent.findMany({ where: { name: "indexnow_submitted", createdAt: { gt: since } }, select: { createdAt: true, props: true } });
    const recent = new Set<string>();
    let sentToday = 0;
    for (const r of rows) {
      const urls = (r.props as { urls?: unknown } | null)?.urls;
      if (!Array.isArray(urls)) continue;
      for (const u of urls) if (typeof u === "string") recent.add(u);
      if (now.getTime() - r.createdAt.getTime() < 86_400_000) sentToday += urls.length;
    }
    const todo = selectUrls(all, recent, Math.min(sentToday, MAX_URLS_PER_DAY));
    const result = await submitToIndexNow(SITE_URL, todo, fetchImpl);
    if (result.submitted > 0) await prisma.adsEvent.create({ data: { name: "indexnow_submitted", props: { urls: todo, status: result.status } } });
    await recordSystemRun(prisma, "indexnow", { ok: result.status !== "failed", outputs: result.submitted, error: result.status === "failed" ? `IndexNow HTTP ${result.httpStatus ?? "error"}` : null }, now);
    return result;
  } catch (e) {
    await recordSystemRun(prisma, "indexnow", { ok: false, error: e instanceof Error ? e.message : "failed" }, now);
    throw e;
  }
}
