// Aggregate benchmark --out runs: ALL_ADS.json (every exported ad file) + summary.json (per-trial economics).
// Usage: tsx scripts/trials-report.ts <trialsDir>   (env: dev DB)
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDb } from "../src/db";

const dir = process.argv[2] ?? "";
const known = new Set(["prestyj.com", "maxteriorslighting.com", "back2sleepnow.com", "yaatuber.com", "easefolio.com", "perrdaht.com", "wearedobi.com", "blackmountain.solutions", "mariangrout.com"]);
const db = createDb();
type Site = { site: string; runId?: string; kind?: string; status: string; readyStatic?: number; readyMotion?: number; qcFirstPassRate?: number; totalSec?: number | null; timeToFirstAdFromSubmitSec?: number | null; jobsCostMicros?: number; stages?: Record<string, { n: number; costMicros: number }> };
type Run = { startedAt: string; wallSec: number; batch: number; codexUsage: { before: unknown; after: unknown }; calls: unknown; sites: Site[] };
// Latest run per site wins (re-runs replace earlier attempts in ALL_ADS); trials keeps every attempt.
const adsBySite = new Map<string, unknown[]>();
const trials: unknown[] = [];
const runs: unknown[] = [];
for (const d of (await readdir(dir)).filter((x) => x.startsWith("run-")).sort()) {
  const r = JSON.parse(await readFile(path.join(dir, d, "results.json"), "utf8")) as Run;
  const pct = (u: unknown) => (u as { body?: { rate_limit?: { primary_window?: { used_percent?: number } } } } | null)?.body?.rate_limit?.primary_window?.used_percent ?? null;
  runs.push({ dir: d, startedAt: r.startedAt, wallSec: r.wallSec, sites: r.sites.length, weeklyUsedBefore: pct(r.codexUsage.before), weeklyUsedAfter: pct(r.codexUsage.after), calls: r.calls });
  for (const s of r.sites) {
    const domain = new URL(s.site).hostname.replace(/^www\./, "");
    const set = known.has(domain) ? "known" : "heldout";
    let summary = "";
    const jobs = s.runId ? await db.adJob.findMany({ where: { runId: s.runId }, select: { type: true, status: true, costMicros: true, attempts: true } }) : [];
    if (s.runId) {
      const run = await db.adRun.findUnique({ where: { id: s.runId }, select: { brandProfileId: true } });
      const bp = run?.brandProfileId ? await db.brandProfile.findUnique({ where: { id: run.brandProfileId }, select: { name: true, mainOffer: true } }) : null;
      summary = [bp?.name, bp?.mainOffer].filter(Boolean).join(" — ");
    }
    const byType: Record<string, number> = {};
    for (const j of jobs) byType[j.type] = (byType[j.type] ?? 0) + Number(j.costMicros) / 1e6;
    trials.push({
      run: d, site: domain, set, status: s.status, readyStatic: s.readyStatic ?? 0, readyMotion: s.readyMotion ?? 0, qcFirstPassRate: s.qcFirstPassRate ?? null,
      totalSec: s.totalSec ?? null, firstAdFromSubmitSec: s.timeToFirstAdFromSubmitSec ?? null, costUsd: (s.jobsCostMicros ?? 0) / 1e6, costByJobType: byType,
      jobs: jobs.length, retriedJobs: jobs.filter((j) => j.attempts > 1).length, deadJobs: jobs.filter((j) => j.status === "dead").length,
    });
    const files = await readdir(path.join(dir, d, domain)).catch(() => [] as string[]);
    if (!files.length) continue;
    const ads: unknown[] = [];
    adsBySite.set(domain, ads);
    for (const f of files.sort()) ads.push({ file: path.join(dir, d, domain, f), site: domain, kind: f.endsWith(".mp4") ? "motion" : "static", set, summary });
  }
}
await db.$disconnect();
const ads = [...adsBySite.keys()].sort().flatMap((k) => adsBySite.get(k) ?? []);
await writeFile(path.join(dir, "ALL_ADS.json"), JSON.stringify(ads, null, 1));
await writeFile(path.join(dir, "summary.json"), JSON.stringify({ runs, trials }, null, 1));
console.log(`${ads.length} ad files, ${trials.length} trials`);
