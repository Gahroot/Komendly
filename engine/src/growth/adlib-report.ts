// Growth system `data_report`: monthly refresh of the public "State of Local Service Meta Ads" report
// (/reports/local-service-meta-ads). The site renders the committed snapshot (src/lib/growth/adlib-report-data.json,
// built by scripts/build-adlib-report.ts). Once a month this loop looks at KlyPlace rows with source='adlib': if they
// carry the Ad Library fields (live ad count + first-seen date) for a big enough sample, it recomputes the aggregate and
// stores it in EngineHeartbeat `report:adlib` (the web loader prefers it when newer). Otherwise (today's schema) it
// only records the heartbeat. Before new data is stored, the report text and every leaderboard's text go through the
// AI review gate (facts = the aggregate numbers); any rejection keeps last month's published data and fails the run.
// Kill switch sys_data_report.
import { ADLIB_GATE_RULES, MIN_INDEXABLE_ADVERTISERS, adlibFacts, adlibReportText, buildAdlibReport, leaderboardText, parseFirstSeen, type AdlibReport, type AdlibRow } from "../../../src/lib/growth/adlib-report";
import type { ReviewItem } from "../../../src/lib/growth/review-gate";
import type { AIProvider } from "../providers/types";
import { gate } from "./review-gate";
import { parseBeat, recordSystemRun, systemEnabled, systemHeartbeatId } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import { errMsg, log } from "../log";

export const ADLIB_REPORT_HEARTBEAT_ID = "report:adlib";
const KEY = "data_report" as const;
const MONTH_MS = 30 * 24 * 3600_000;

type Rec = Record<string, unknown>;
const pick = (r: Rec, ...ks: string[]) => { for (const k of ks) if (r[k] !== undefined && r[k] !== null) return r[k]; return undefined; };

/** KlyPlace row (any shape) -> report row, or null when it lacks the Ad Library fields. */
export function placeToAdlibRow(r: Rec): AdlibRow | null {
  const active = Number(pick(r, "activeAds", "active_ads"));
  const firstSeen = pick(r, "firstSeen", "first_seen");
  const fs = firstSeen instanceof Date ? firstSeen.toISOString().slice(0, 10) : typeof firstSeen === "string" ? firstSeen : null;
  if (!Number.isFinite(active) || active < 1 || !parseFirstSeen(fs) || typeof r.niche !== "string" || typeof r.state !== "string") return null;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    page_name: s(r.name), page_url: s(pick(r, "pageUrl", "page_url")) ?? s(r.id), website: s(r.website), domain: s(r.domain), niche: r.niche, city: s(r.city), state: r.state,
    active_ads: active, first_seen: fs!, ad_text_sample: s(pick(r, "adTextSample", "ad_text_sample")), library_url: s(pick(r, "libraryUrl", "library_url")), media_type: s(pick(r, "mediaType", "media_type")),
  };
}

export type GateFn = (item: ReviewItem) => Promise<{ approved: boolean; verdict: { reasons: string[] } }>;

/** Gate the report page text and each leaderboard; returns the rejections (empty = publishable). */
export async function gateAdlibReport(report: AdlibReport, check: GateFn, month: string): Promise<string[]> {
  const facts = adlibFacts(report);
  const items: ReviewItem[] = [
    { system: KEY, kind: "report", itemKey: `adlib:${month}:report`, content: adlibReportText(report), facts, extraRules: ADLIB_GATE_RULES },
    ...report.leaderboards.map((l) => ({ system: KEY, kind: "page", itemKey: `adlib:${month}:lb:${l.slug}`, content: leaderboardText(l, report.collectedOn), facts, extraRules: ADLIB_GATE_RULES })),
  ];
  const rejected: string[] = [];
  for (const it of items) {
    const v = await check(it);
    if (!v.approved) rejected.push(`${it.itemKey}: ${v.verdict.reasons.join("; ")}`);
  }
  return rejected;
}

export async function adlibReportTick(d: { db: Db; provider: Pick<AIProvider, "text"> }, now = new Date()): Promise<{ ran: boolean; rows: number; usable: number; recomputed: boolean; rejected?: string[] }> {
  const { db } = d;
  if (!(await systemEnabled(db, KEY))) return { ran: false, rows: 0, usable: 0, recomputed: false };
  const beat = parseBeat((await db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(KEY) } }))?.meta);
  if (beat.lastOkAt && now.getTime() - new Date(beat.lastOkAt).getTime() < MONTH_MS) return { ran: false, rows: 0, usable: 0, recomputed: false };
  try {
    const places = (await db.klyPlace.findMany({ where: { source: "adlib" } })) as unknown as Rec[];
    const rows = places.map(placeToAdlibRow).filter((x): x is AdlibRow => x !== null);
    let recomputed = false;
    if (rows.length >= MIN_INDEXABLE_ADVERTISERS) {
      const report = buildAdlibReport(rows, now.toISOString().slice(0, 10), now);
      const rejected = await gateAdlibReport(report, (item) => gate(db, d.provider, item), now.toISOString().slice(0, 7));
      if (rejected.length) {
        // Keep last month's published data (snapshot or previous `report:adlib`); fail the run so the monitor alerts.
        log("warn", "data_report rejected by review gate; keeping last published data", { rejected });
        await recordSystemRun(db, KEY, { ok: false, error: `review gate rejected ${rejected.length} item(s): ${rejected[0]}` }, now);
        return { ran: true, rows: places.length, usable: rows.length, recomputed: false, rejected };
      }
      const meta = JSON.parse(JSON.stringify(report)) as object;
      await db.engineHeartbeat.upsert({ where: { id: ADLIB_REPORT_HEARTBEAT_ID }, create: { id: ADLIB_REPORT_HEARTBEAT_ID, kind: "report", ok: true, message: null, meta }, update: { ok: true, message: null, meta } });
      recomputed = true;
    }
    log("info", "data_report cycle", { adlibRows: places.length, usable: rows.length, recomputed, note: recomputed ? undefined : "KlyPlace rows lack live-ad count/first-seen; site keeps the committed snapshot (rerun scripts/build-adlib-report.ts)" });
    await recordSystemRun(db, KEY, { ok: true, outputs: recomputed ? 1 : 0 }, now);
    return { ran: true, rows: places.length, usable: rows.length, recomputed };
  } catch (e) {
    await recordSystemRun(db, KEY, { ok: false, error: errMsg(e) }, now);
    throw e;
  }
}

/** Checks daily; works at most once a month (after the last successful cycle). */
export function startAdlibReportLoop(d: { db: Db; provider: Pick<AIProvider, "text"> }, everyMs = 24 * 3600_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    adlibReportTick(d).catch((e: unknown) => log("warn", "data_report tick failed", { error: errMsg(e) })).finally(() => (running = false));
  };
  const first = setTimeout(tick, 5 * 60_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
