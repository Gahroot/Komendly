// "Are my ads working?" (growth system meta_results, kill switch AdsFeatureFlag sys_meta_results). Hourly, single replica.
// For each Ad Department workspace with a Meta connection and published ads, once per ISO week (workspace time zone):
// last-7-day ad-level insights from the Marketing API (ads_read) -> report (src/lib/ads/results/insights.ts) -> the
// plain-English email block is AI-gated with the exact numbers as facts; rejected -> numbers-only block (gated too);
// rejected again -> no block. Stored as AdsEvent meta_results_report {week, report, paragraphs, gated}; the Monday weekly
// email (jobs/weekly.ts) appends `paragraphs`, the dashboard card shows `report`. No insights = report null = nothing shown.
// Team workspaces (a MarketingMandate exists, prd.md R4): the weekly Ozzy report (src/lib/ads/team/report.ts) from stored
// data only (AdPerformanceDay, MetaLead, MarketingAction; no Meta calls). Deterministic text; optional wording polish on the
// Codex provider only (never OpenAI/MiMo), accepted only with identical numbers and a passed review gate, else the fixed text.
import { z } from "zod";
import { decryptToken, tokenKey } from "../../../src/lib/ads/meta/core/crypto";
import type { StoredMetaToken } from "../../../src/lib/ads/meta/core/types";
import {
  buildResultsReport, fetchAccountCurrency, fetchAdInsights, fetchAdStatuses, resultsParagraphs, resultsText, RESULTS_EVENT, type FetchLike, type OurMetaAd, type ResultsReport,
} from "../../../src/lib/ads/results/insights";
import { isAdDepartment, isoWeekKey } from "../../../src/lib/ads/weekly-drop";
import { dayKey } from "../../../src/lib/ads/team/contracts";
import {
  buildTeamReport, reportWindow, sameNumbers, teamReportFacts, teamReportParagraphs, teamResultsReport, type TeamReport,
} from "../../../src/lib/ads/team/report";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import type { ReviewItem } from "../../../src/lib/growth/review-gate";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { structured } from "../providers/structured";
import type { AIProvider, TextRequest, UsageMeter } from "../providers/types";
import { gate } from "./review-gate";

const SYSTEM = "meta_results" as const;
const MAX_PER_TICK = 25;

export interface MetaResultsDeps { db: Db; provider: AIProvider | null; fetch?: FetchLike; now?: () => Date }

type Gate = (item: ReviewItem) => Promise<{ approved: boolean; content: string | null }>;

/** Exact numbers the reviewer may accept (the report plus the derived figures shown in the text). */
export function resultsFacts(r: ResultsReport): string {
  const t = resultsText(r);
  return [
    "Numbers below come from the customer's Meta Marketing API insights (last 7 days, ad level). Derived figures (CTR = clicks / impressions, cost per lead = spend / leads) are computed from them.",
    `REPORT JSON: ${JSON.stringify(r)}`,
    `COMPUTED SENTENCES (exact): ${[t.headline, ...t.ads, ...t.changes].join(" | ")}`,
    "Kept = Komendly ads still active; swapped = ads turned off this week (losers are replaced weekly); new = ads published this week.",
  ].join("\n");
}

/** Full block, else the numbers-only block, each through the gate; [] when both are rejected (send nothing). */
export async function gatedResultsBlock(g: Gate, r: ResultsReport, itemKey: string): Promise<{ paragraphs: string[]; gated: "full" | "numbers" | null }> {
  const facts = resultsFacts(r);
  const extraRules = ["This block is inserted into the customer's own weekly email from Komendly; it reports their Meta ad results. It must not predict or promise future results."];
  const full = resultsParagraphs(r);
  const a = await g({ system: SYSTEM, kind: "report", itemKey: `${itemKey}:full`, content: full.join("\n\n"), facts, extraRules });
  if (a.approved) return { paragraphs: full, gated: "full" };
  const t = resultsText(r);
  const plain = [`Are your ads working? ${t.headline}`, t.note];
  const b = await g({ system: SYSTEM, kind: "report", itemKey: `${itemKey}:numbers`, content: plain.join("\n\n"), facts, extraRules });
  return b.approved ? { paragraphs: plain, gated: "numbers" } : { paragraphs: [], gated: null };
}

function workspaceToken(encrypted: string, now: number): StoredMetaToken | null {
  try {
    const token = JSON.parse(decryptToken(encrypted, tokenKey(process.env.ADS_TOKEN_KEY))) as StoredMetaToken;
    return token.expiresAt && token.expiresAt <= now ? null : token; // expired: skip (publish flow refreshes/asks to reconnect)
  } catch {
    return null;
  }
}

/** One workspace's report for the last 7 days, or null when there are no insights for our ads. */
export async function workspaceReport(db: Db, f: FetchLike, ws: { id: string; adAccountId: string | null; encryptedToken: string }, now: Date): Promise<ResultsReport | null> {
  const token = workspaceToken(ws.encryptedToken, now.getTime());
  if (!token) return null;
  const rows = await db.metaPublish.findMany({
    where: { status: "published", metaAdId: { not: null }, ad: { workspaceId: ws.id } },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: { metaAdId: true, adId: true, adAccountId: true, updatedAt: true, ad: { select: { headline: true } } },
  });
  const ours: (OurMetaAd & { account: string })[] = rows.flatMap((r) => {
    const account = r.adAccountId ?? ws.adAccountId;
    return r.metaAdId && account ? [{ metaAdId: r.metaAdId, key: r.adId, label: r.ad.headline || "Untitled ad", publishedAt: r.updatedAt.toISOString(), account }] : [];
  });
  if (!ours.length) return null;
  const account = ws.adAccountId && ours.some((o) => o.account === ws.adAccountId) ? ws.adAccountId : ours[0]!.account;
  const mine = ours.filter((o) => o.account === account);
  const graphVersion = process.env.META_GRAPH_VERSION || "v25.0";
  const adIds = mine.map((o) => o.metaAdId);
  const insights = await fetchAdInsights(f, { token: token.accessToken, adAccountId: account, graphVersion, adIds });
  if (!insights.length) return null;
  const [statuses, currency] = await Promise.all([
    fetchAdStatuses(f, { token: token.accessToken, graphVersion, adIds }),
    fetchAccountCurrency(f, { token: token.accessToken, adAccountId: account, graphVersion }),
  ]);
  return buildResultsReport({ currency, rows: insights, statuses, ours: mine, windowStart: new Date(now.getTime() - 7 * 86_400_000) });
}

// ---------- team workspaces: weekly Ozzy report from stored data ----------

/** The Codex provider's own text (bypassing a MiMo text wrapper), or null for any other provider: no AI then. */
export function codexOnly(p: AIProvider | null, env: NodeJS.ProcessEnv = process.env): AIProvider | null {
  if (!p || p.name !== "codex") return null;
  const model = env.TEAM_REPORT_TEXT_MODEL || env.WINBACK_TEXT_MODEL || "gpt-6-luna";
  const codexText = (p as { fallbackText?: AIProvider["text"] }).fallbackText ?? p.text.bind(p);
  return { name: "codex", text: (r: TextRequest) => codexText({ ...r, model }), image: (r) => p.image(r), health: () => p.health() };
}

const PolishSchema = z.object({ paragraphs: z.array(z.string().min(1).max(1200)).min(2).max(8) });
const POLISH_SYSTEM = [
  "You are Ozzy, the friendly marketing director of a small AI marketing team, writing the weekly report email block for a local business owner.",
  "Rewrite the given paragraphs in warm, plain English. Keep the same order and meaning.",
  "Keep EVERY number, amount, date and count exactly as written; add no new numbers; drop none.",
  "Keep the words measured / estimated / unknown next to the numbers they label. Never promise or predict results. Add no actions the text doesn't mention.",
  "Return JSON {paragraphs: string[]}.",
].join(" ");

/** Deterministic paragraphs, optionally reworded by Codex. Any failure, number change or gate rejection -> the fixed text. */
export async function teamReportBlock(
  r: TeamReport,
  o: { codex: AIProvider | null; gate?: Gate; itemKey: string },
): Promise<{ paragraphs: string[]; source: "ai" | "fixed"; reason?: string }> {
  const fixed = teamReportParagraphs(r);
  if (!o.codex) return { paragraphs: fixed, source: "fixed", reason: "no codex provider" };
  try {
    const usage: UsageMeter[] = [];
    const out = await structured(o.codex, PolishSchema, { system: POLISH_SYSTEM, prompt: `PARAGRAPHS:\n${fixed.map((p, i) => `${i + 1}. ${p}`).join("\n")}`, reasoning: "low", signal: AbortSignal.timeout(90_000) }, usage);
    const polished = out.paragraphs.map((p) => p.trim()).filter(Boolean);
    if (!sameNumbers(fixed, polished)) return { paragraphs: fixed, source: "fixed", reason: "numbers changed" };
    if (o.gate) {
      const v = await o.gate({ system: SYSTEM, kind: "report", itemKey: o.itemKey, content: polished.join("\n\n"), facts: teamReportFacts(r), extraRules: ["This block is inserted into the customer's own weekly email from Komendly; it reports their managed Meta ads. It must not predict or promise future results."] });
      if (!v.approved) return { paragraphs: fixed, source: "fixed", reason: "review gate rejected" };
    }
    return { paragraphs: polished, source: "ai" };
  } catch (e) {
    return { paragraphs: fixed, source: "fixed", reason: errMsg(e).slice(0, 200) };
  }
}

/** One team workspace's report from stored rows (no Meta calls). */
export async function loadTeamReport(db: Db, m: { workspaceId: string; state: string; stateReason: string | null; monthlyLimitMinor: number; currency: string; launchedAt: Date | null }, now: Date, tz: string | null): Promise<{ team: TeamReport; report: ResultsReport | null }> {
  const zone = tz ?? "America/New_York";
  const window = reportWindow(dayKey(now, zone));
  const from = window.prevStart < window.monthStart ? window.prevStart : window.monthStart;
  const after = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000); // padded; rows are filtered by local day below
  const [days, leads, actions] = await Promise.all([
    db.adPerformanceDay.findMany({ where: { workspaceId: m.workspaceId, day: { gte: from, lte: window.today } }, select: { metaAdId: true, adId: true, day: true, spendMinor: true, impressions: true, clicks: true, leads: true } }),
    db.metaLead.findMany({ where: { workspaceId: m.workspaceId, receivedAt: { gte: after } }, select: { receivedAt: true } }),
    db.marketingAction.findMany({ where: { workspaceId: m.workspaceId, createdAt: { gte: after } }, orderBy: { createdAt: "asc" }, take: 2000, select: { role: true, kind: true, summary: true, outcome: true, createdAt: true } }),
  ]);
  const team = buildTeamReport({
    window,
    mandate: { state: m.state, stateReason: m.stateReason, monthlyLimitMinor: m.monthlyLimitMinor, currency: m.currency, launchedAt: m.launchedAt },
    days,
    leadDays: leads.map((l) => dayKey(l.receivedAt, zone)),
    actions: actions.map((a) => ({ role: a.role, kind: a.kind, summary: a.summary, outcome: a.outcome, day: dayKey(a.createdAt, zone) })),
  });
  const ids = [...new Set(days.flatMap((d) => (d.adId ? [d.adId] : [])))];
  const ads = ids.length ? await db.ad.findMany({ where: { id: { in: ids } }, select: { id: true, headline: true } }) : [];
  const report = teamResultsReport({ window, currency: team.currency, days, labels: new Map(ads.map((a) => [a.id, a.headline])) });
  return { team, report };
}

export interface MetaResultsTick { enabled: boolean; reports: number; empty: number; errors: number }

export async function metaResultsTick(d: MetaResultsDeps): Promise<MetaResultsTick> {
  const out: MetaResultsTick = { enabled: false, reports: 0, empty: 0, errors: 0 };
  if (!(await systemEnabled(d.db, SYSTEM))) return out; // off: no cycle, no heartbeat
  out.enabled = true;
  const now = d.now?.() ?? new Date();
  const f: FetchLike = d.fetch ?? ((u, init) => fetch(u, init));
  const errors: string[] = [];
  let done = 0;
  const teamWs = new Set<string>();
  try {
    // Team workspaces first: the weekly Ozzy report from stored data.
    const mandates = await d.db.marketingMandate.findMany({
      select: { workspaceId: true, state: true, stateReason: true, monthlyLimitMinor: true, currency: true, launchedAt: true, workspace: { select: { adsPlan: true, subscriptionStatus: true, suspendedAt: true } } },
    });
    const codex = codexOnly(d.provider);
    for (const m of mandates) {
      teamWs.add(m.workspaceId); // never also gets the old Meta-API report
      if (done >= MAX_PER_TICK) continue;
      if (!isAdDepartment(m.workspace)) continue;
      const tz = (await d.db.adsAutopilot.findUnique({ where: { workspaceId: m.workspaceId }, select: { timezone: true } }))?.timezone ?? null;
      const week = isoWeekKey(now, tz);
      const prior = await d.db.adsEvent.findFirst({ where: { name: RESULTS_EVENT, workspaceId: m.workspaceId, props: { path: ["week"], equals: week } }, select: { id: true } });
      if (prior) continue;
      done++;
      try {
        const { team, report } = await loadTeamReport(d.db, m, now, tz);
        const block = await teamReportBlock(team, { codex, gate: codex ? (item) => gate(d.db, codex, item) : undefined, itemKey: `team_report:${m.workspaceId}:${week}` });
        await d.db.adsEvent.create({ data: { name: RESULTS_EVENT, workspaceId: m.workspaceId, props: { week, reportedWeek: team.week, report: report as unknown as object, team: team as unknown as object, paragraphs: block.paragraphs, gated: block.source === "ai" ? "full" : "fixed", source: block.source, ...(block.reason ? { reason: block.reason } : {}) } as object } });
        await d.db.marketingAction.createMany({
          data: [{ workspaceId: m.workspaceId, role: "director", kind: "report_sent", summary: `Wrote your weekly report for ${team.since} to ${team.until}.`, evidence: { week, reportedWeek: team.week, source: block.source }, dedupeKey: `report:${m.workspaceId}:${week}` }],
          skipDuplicates: true,
        });
        out.reports++;
      } catch (e) {
        out.errors++;
        errors.push(`${m.workspaceId}: ${errMsg(e)}`.slice(0, 200));
      }
    }
    const conns = await d.db.metaConnection.findMany({
      select: { workspaceId: true, adAccountId: true, encryptedToken: true, workspace: { select: { adsPlan: true, subscriptionStatus: true, suspendedAt: true } } },
    });
    for (const c of conns) {
      if (done >= MAX_PER_TICK) break;
      if (teamWs.has(c.workspaceId) || !isAdDepartment(c.workspace)) continue;
      const tz = (await d.db.adsAutopilot.findUnique({ where: { workspaceId: c.workspaceId }, select: { timezone: true } }))?.timezone ?? null;
      const week = isoWeekKey(now, tz);
      const prior = await d.db.adsEvent.findFirst({ where: { name: RESULTS_EVENT, workspaceId: c.workspaceId, props: { path: ["week"], equals: week } }, select: { id: true } });
      if (prior) continue;
      done++;
      try {
        const report = await workspaceReport(d.db, f, { id: c.workspaceId, adAccountId: c.adAccountId, encryptedToken: c.encryptedToken }, now);
        let block: { paragraphs: string[]; gated: "full" | "numbers" | null } = { paragraphs: [], gated: null };
        if (report && d.provider) {
          const provider = d.provider;
          block = await gatedResultsBlock((item) => gate(d.db, provider, item), report, `results:${c.workspaceId}:${week}`);
        }
        await d.db.adsEvent.create({ data: { name: RESULTS_EVENT, workspaceId: c.workspaceId, props: { week, report: report as unknown as object, paragraphs: block.paragraphs, gated: block.gated } as object } });
        if (report) out.reports++;
        else out.empty++;
      } catch (e) {
        out.errors++;
        errors.push(`${c.workspaceId}: ${errMsg(e)}`.slice(0, 200));
      }
    }
  } catch (e) {
    errors.push(errMsg(e));
  }
  await recordSystemRun(d.db, SYSTEM, { ok: errors.length === 0, outputs: out.reports, error: errors.join("; ") || null }, now);
  return out;
}

/** Hourly loop. Returns a stop function. */
export function startMetaResultsLoop(d: MetaResultsDeps, everyMs = 60 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    metaResultsTick(d)
      .then((r) => r.enabled && (r.reports || r.errors) && log("info", "meta results tick", { ...r }))
      .catch((e) => log("warn", "meta results tick failed", { error: errMsg(e) }))
      .finally(() => { running = false; });
  };
  const first = setTimeout(tick, 120_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}

/** Approved results paragraphs for a workspace's week (for the Monday weekly email); [] = show nothing. */
export async function weeklyResultsParagraphs(db: Db, workspaceId: string, week: string | null): Promise<string[]> {
  if (!week || !(await systemEnabled(db, SYSTEM))) return [];
  const ev = await db.adsEvent.findFirst({ where: { name: RESULTS_EVENT, workspaceId, props: { path: ["week"], equals: week } }, orderBy: { createdAt: "desc" }, select: { props: true } });
  const p = (ev?.props as { paragraphs?: unknown } | null)?.paragraphs;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}
