// Growth system `ad_check` (Meta Ad Check grader, /tools/meta-ad-check). Kill switch: AdsFeatureFlag sys_ad_check.
// Claims AdJob rows of type `adlib_scan` (inserted by web /api/ad-check, or by other systems such as ad_watch), scans
// the Ad Library (./adlib-scan.ts), and writes AdJob.result:
//   payload.purpose "ad_check": AdCheckResult (graded report + up to 3 KlyPlace adlib rivals in the same trade + state)
//   any other purpose:          { ok, scan, total } (raw shared scan)
// Report text is data-filled and goes on a (private) public page, so it passes reviewAdCheckText() (= review gate)
// first; rejected twice -> the job fails closed ("unavailable"). Heartbeat via recordSystemRun every cycle.
import {
  AD_CHECK_JOB_TYPE, MAX_RIVALS, buildAdCheckReport, cleanState, cleanTrade, reportFacts, reportSummaryLines, rivalRow,
  type AdCheckPayload, type AdCheckReport, type AdCheckResult, type AdCheckRival,
} from "../../../src/lib/growth/ad-check";
import { parseAdlibTarget } from "../../../src/lib/growth/adlib-scan";
import { parseBeat, recordSystemRun, systemEnabled, systemHeartbeatId } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import type { AIProvider } from "../providers/types";
import { scanPageDetailed, type AdlibFetcher } from "./adlib-scan";
import { gate } from "./review-gate";

const RUNNING_TTL_MIN = 15;
const BEAT_EVERY_MS = 15 * 60_000;
export const AD_CHECK_DONE_EVENT = "ad_check_done";

export interface ClaimedScanJob { id: string; payload: unknown; attempts: number; maxAttempts: number }

export async function claimScanJobs(db: Pick<Db, "$queryRaw">, worker: string, limit = 1): Promise<ClaimedScanJob[]> {
  return db.$queryRaw<ClaimedScanJob[]>`
    UPDATE "AdJob" SET status = 'running', "lockedBy" = ${worker}, "lockedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "AdJob"
      WHERE type = ${AD_CHECK_JOB_TYPE} AND status = 'queued' AND "runAt" <= now()
      ORDER BY priority DESC, "createdAt" ASC LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload, attempts, "maxAttempts"`;
}

/** Re-queue scans stuck running (engine restart mid-scan); dead after maxAttempts. */
export async function reapScanJobs(db: Pick<Db, "$executeRaw">): Promise<void> {
  await db.$executeRaw`
    UPDATE "AdJob" SET status = CASE WHEN attempts >= "maxAttempts" THEN 'dead'::"AdJobStatus" ELSE 'queued'::"AdJobStatus" END,
      "lockedBy" = NULL, "lockedAt" = NULL, "lastError" = 'stale scan recovered',
      "finishedAt" = CASE WHEN attempts >= "maxAttempts" THEN now() ELSE NULL END
    WHERE type = ${AD_CHECK_JOB_TYPE} AND status = 'running' AND "lockedAt" < now() - make_interval(mins => ${RUNNING_TTL_MIN}::int)`;
}

/** The ONE place report text meets the AI review gate (precheck always runs inside it). */
export async function reviewAdCheckText(db: Db, provider: Pick<AIProvider, "text">, report: AdCheckReport, token: string): Promise<{ approved: boolean; summary: boolean }> {
  const checks = report.checks.map((c) => `${c.label}: ${c.points}/${c.max}. ${c.fact}`);
  const summary = reportSummaryLines(report);
  const item = {
    system: "ad_check", kind: "report", itemKey: `ad_check:${token}`, content: [...summary, ...checks].join("\n"), facts: reportFacts(report),
    extraRules: ["This is a private, token-link report for the business that asked for it (noindex); rival businesses are not named in this text."],
  };
  // Single revision: drop the prose summary, keep only the fact lines.
  const r = await gate(db, provider, item, { revise: async () => checks.join("\n") });
  return { approved: r.approved, summary: r.approved && r.content === item.content };
}

/** Rivals: KlyPlace adlib rows in the same trade + state (most active first), scanned; up to MAX_RIVALS with a page. */
export async function findRivals(db: Db, report: Pick<AdCheckReport, "pageId" | "website">, trade: string, state: string, fetcher?: AdlibFetcher): Promise<AdCheckRival[]> {
  const own = report.website ? parseAdlibTarget(report.website)?.value : undefined;
  const places = await db.klyPlace.findMany({ where: { source: "adlib", niche: trade, state, ...(own ? { NOT: { domain: own } } : {}) }, orderBy: [{ confidence: "desc" }, { id: "asc" }], take: MAX_RIVALS + 3, select: { id: true, website: true } });
  const out: AdCheckRival[] = [];
  for (const p of places) {
    if (out.length >= MAX_RIVALS) break;
    const pageId = /^adlib:(\d{5,20})$/.exec(p.id)?.[1];
    try {
      const r = await scanPageDetailed(db, pageId ?? p.website, { fetcher });
      if (r && r.scan.pageId !== report.pageId && r.scan.liveAds.length && !out.some((x) => x.pageId === r.scan.pageId)) out.push(rivalRow(r.scan, r.total));
    } catch (e) {
      log("warn", "ad check rival scan failed", { place: p.id, error: errMsg(e) });
    }
  }
  return out;
}

/** Trade + state: as given, else from the business's own KlyPlace row (by domain). */
async function tradeAndState(db: Db, p: AdCheckPayload, website: string | undefined): Promise<{ trade?: string; state?: string }> {
  let trade = cleanTrade(p.trade);
  let state = cleanState(p.state);
  if (trade && state) return { trade, state };
  const domains = [website, p.input].map((x) => (x ? parseAdlibTarget(x) : null)).filter((t) => t?.kind === "website").map((t) => t!.value);
  if (domains.length) {
    const place = await db.klyPlace.findFirst({ where: { domain: { in: domains } }, orderBy: { confidence: "desc" }, select: { niche: true, state: true } });
    trade ??= place?.niche ?? undefined;
    state ??= cleanState(place?.state);
  }
  return { trade, state };
}

/** Run one ad_check job end to end. Throws only when the Ad Library can't be read (job retried). */
export async function runAdCheck(db: Db, provider: Pick<AIProvider, "text">, p: AdCheckPayload, fetcher?: AdlibFetcher): Promise<AdCheckResult> {
  const r = await scanPageDetailed(db, p.input, { fetcher });
  if (!r) return { ok: false, reason: "not_found", input: p.input };
  const { trade, state } = await tradeAndState(db, p, r.scan.website);
  const rivals = trade && state ? await findRivals(db, { pageId: r.scan.pageId, website: r.scan.website }, trade, state, fetcher) : [];
  const report = buildAdCheckReport(r.scan, r.total, rivals, { trade, state });
  const v = await reviewAdCheckText(db, provider, report, p.token);
  if (!v.approved) return { ok: false, reason: "unavailable", input: p.input };
  if (v.summary) report.summary = reportSummaryLines(report);
  return { ok: true, report };
}

async function finish(db: Db, id: string, status: "succeeded" | "failed" | "dead", result: object | null, error: string | null) {
  await db.adJob.update({ where: { id }, data: { status, ...(result ? { result } : {}), lastError: error, finishedAt: status === "failed" ? null : new Date(), lockedBy: null, lockedAt: null, ...(status === "failed" ? { runAt: new Date(Date.now() + 60_000) } : {}) } });
}

/** Claim and process queued scan jobs one by one (the fetcher is rate-limited anyway). Returns finished reports. */
export async function processScanJobs(db: Db, provider: Pick<AIProvider, "text">, worker: string, fetcher?: AdlibFetcher): Promise<number> {
  let done = 0;
  for (const job of await claimScanJobs(db, worker, 1)) {
    const p = (job.payload && typeof job.payload === "object" ? job.payload : {}) as Partial<AdCheckPayload> & { input?: string; pageId?: string };
    try {
      if (p.purpose === "ad_check" && typeof p.input === "string" && typeof p.token === "string") {
        const result = await runAdCheck(db, provider, p as AdCheckPayload, fetcher);
        await finish(db, job.id, "succeeded", result, null);
        await db.adsEvent.create({ data: { name: AD_CHECK_DONE_EVENT, props: { system: "ad_check", ok: result.ok, ...(result.ok ? { score: result.report.score, live: result.report.liveCount } : { reason: result.reason }) } } });
        if (result.ok) done++;
      } else {
        const input = String(p.input ?? p.pageId ?? "");
        const r = await scanPageDetailed(db, input, { fetcher });
        await finish(db, job.id, "succeeded", { ok: Boolean(r), scan: (r?.scan ?? null) as object | null, total: r?.total ?? 0 }, null);
      }
    } catch (e) {
      const err = errMsg(e).slice(0, 500);
      log("warn", "adlib scan job failed", { id: job.id, error: err });
      const last = job.attempts >= job.maxAttempts;
      const fail: AdCheckResult = { ok: false, reason: "unavailable", input: String(p.input ?? "") };
      await finish(db, job.id, last ? "dead" : "failed", last ? fail : null, err).catch(() => undefined);
    }
  }
  return done;
}

/** Re-queue failed (retryable) scans whose backoff passed: 'failed' is not picked by claimScanJobs. */
async function requeueFailed(db: Pick<Db, "$executeRaw">) {
  await db.$executeRaw`UPDATE "AdJob" SET status = 'queued' WHERE type = ${AD_CHECK_JOB_TYPE} AND status = 'failed' AND attempts < "maxAttempts" AND "runAt" <= now()`;
}

/** Start the loop: poll every 3 s while sys_ad_check is on; heartbeat every 15 min (outputs = reports finished). */
export function startAdCheckLoop(opts: { db: Db; provider: AIProvider; worker: string }): () => void {
  let stopped = false;
  let busy = false;
  let outputs = 0;
  let lastError: string | null = null;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      if (!(await systemEnabled(opts.db, "ad_check"))) return;
      await reapScanJobs(opts.db);
      await requeueFailed(opts.db);
      outputs += await processScanJobs(opts.db, opts.provider, opts.worker);
      lastError = null;
    } catch (e) {
      lastError = errMsg(e);
      log("warn", "ad check tick failed", { error: lastError });
    } finally {
      busy = false;
    }
  };
  const beat = async () => {
    try {
      if (!(await systemEnabled(opts.db, "ad_check"))) return;
      const prev = parseBeat((await opts.db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId("ad_check") } }))?.meta);
      if (!lastError && prev.lastRunAt && Date.now() - new Date(prev.lastRunAt).getTime() < BEAT_EVERY_MS) return;
      const n = outputs;
      outputs = 0;
      await recordSystemRun(opts.db, "ad_check", { ok: !lastError, outputs: n, error: lastError });
    } catch (e) {
      log("warn", "ad check heartbeat failed", { error: errMsg(e) });
    }
  };
  const t1 = setInterval(() => void tick(), 3000);
  const t2 = setInterval(() => void beat(), 5 * 60_000);
  void beat();
  return () => { stopped = true; clearInterval(t1); clearInterval(t2); };
}
