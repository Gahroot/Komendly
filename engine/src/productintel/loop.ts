// Product-intel loop (flag-gated, default OFF): sys_creative_qa scores finished packs (report-only) and writes weekly
// findings; sys_outcome_verify records preventable customer failures (deduped email to Nolan) and the weekly
// creative-effectiveness ledger. All output is AdsEvent rows; nothing edits prompts, packs or customer data.
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import { CREATIVE_FINDING_EVENT, CREATIVE_SCORE_EVENT } from "../../../src/lib/product-intel/creative";
import { buildLedger, EFFECTIVENESS_EVENT, hookLibrary } from "../../../src/lib/product-intel/effectiveness";
import { aggregateFindings, proposalsFromFindings, type ScoreRow } from "../../../src/lib/product-intel/findings";
import { loadOutcomes, loadPerfRows } from "../../../src/lib/product-intel/load";
import { alertEmail, failureDedupeKey, OUTCOME_ALERT_TO, OUTCOME_FAILURE_EVENT, type AlertItem } from "../../../src/lib/product-intel/outcomes";
import { isTestEmail } from "../../../src/lib/ads/lifecycle/select";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import type { AIProvider } from "../providers/types";
import type { Storage } from "../storage/s3";
import { scorePack } from "./score";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MAX_SCORED_PER_TICK = 4;
const MAX_ALERTS_PER_TICK = 20;
export interface PiDeps { db: Db; storage: Storage; send?: SendMail; env?: NodeJS.ProcessEnv; now?: () => Date; provider?: AIProvider | null }
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const sampled = (id: string) => [...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 3 === 0; // critique ~1 in 3 packs

export async function creativeQaTick(d: PiDeps, provider: () => AIProvider | null): Promise<{ scored: number; findings: number }> {
  const now = (d.now ?? (() => new Date()))();
  const runs = await d.db.adRun.findMany({ where: { kind: { not: "gift" }, status: { in: ["completed", "partial"] }, completedAt: { gte: new Date(now.getTime() - 14 * DAY) } }, orderBy: { completedAt: "desc" }, take: 60, select: { id: true, user: { select: { email: true } } } });
  const done = new Set((await d.db.adsEvent.findMany({ where: { name: CREATIVE_SCORE_EVENT, runId: { in: runs.map((r) => r.id) } }, select: { runId: true } })).map((e) => e.runId));
  const todo = runs.filter((r) => !done.has(r.id) && r.user?.email && !isTestEmail(r.user.email)).slice(0, MAX_SCORED_PER_TICK);
  let scored = 0;
  for (const r of todo) {
    try { if (await scorePack({ db: d.db, storage: d.storage, provider: provider() }, r.id, { critique: sampled(r.id) })) scored++; else await d.db.adsEvent.create({ data: { name: CREATIVE_SCORE_EVENT, runId: r.id, props: { skipped: true, reason: "no ready static ads" } } }); }
    catch (e) { log("warn", "creative score failed", { runId: r.id, error: errMsg(e) }); }
  }
  // weekly findings
  let findings = 0;
  const lastBatch = await d.db.adsEvent.findFirst({ where: { name: CREATIVE_FINDING_EVENT }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const lastMarker = await d.db.adsEvent.findFirst({ where: { name: "creative_findings_run" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const lastAt = Math.max(lastBatch?.createdAt.getTime() ?? 0, lastMarker?.createdAt.getTime() ?? 0);
  if (now.getTime() - lastAt >= WEEK) {
    const rows = await d.db.adsEvent.findMany({ where: { name: CREATIVE_SCORE_EVENT, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, take: 500, select: { runId: true, props: true } });
    const scoreRows: ScoreRow[] = rows.filter((e) => e.runId && !(e.props as { skipped?: boolean })?.skipped).map((e) => { const p = e.props as Record<string, any>; return { runId: e.runId!, trade: p.trade ?? null, template: p.template ?? null, model: p.model ?? null, promptVersion: p.promptVersion ?? null, packScore: p.packScore ?? 0, ads: p.ads ?? [], packIssues: p.packIssues ?? [] }; });
    const f = aggregateFindings(scoreRows);
    const proposals = new Map(proposalsFromFindings(f, 50).map((p) => [p.id.split(":")[0], p]));
    const batch = now.toISOString();
    for (const x of f.slice(0, 40)) { await d.db.adsEvent.create({ data: { name: CREATIVE_FINDING_EVENT, props: json({ ...x, batch, packsScored: scoreRows.length, proposal: proposals.get(x.cause) ?? null }) } }); findings++; }
    await d.db.adsEvent.create({ data: { name: "creative_findings_run", props: { batch, packsScored: scoreRows.length, findings } } });
  }
  return { scored, findings };
}

export async function outcomeTick(d: PiDeps): Promise<{ failuresNew: number; emailed: number; ledger: boolean }> {
  const now = (d.now ?? (() => new Date()))();
  const env = d.env ?? process.env;
  const people = await loadOutcomes(d.db, now);
  const found = people.flatMap((p) => p.outcome.failures.map((f) => ({ p, f, key: failureDedupeKey(p.workspaceId, f) })));
  const seen = new Set<string>();
  if (found.length) for (const e of await d.db.adsEvent.findMany({ where: { name: OUTCOME_FAILURE_EVENT, workspaceId: { in: [...new Set(found.map((x) => x.p.workspaceId))] } }, select: { props: true } })) { const k = (e.props as { dedupeKey?: string })?.dedupeKey; if (k) seen.add(k); }
  const fresh = found.filter((x) => !seen.has(x.key)).slice(0, MAX_ALERTS_PER_TICK);
  const created: string[] = [];
  const items: AlertItem[] = [];
  for (const x of fresh) {
    const ev = await d.db.adsEvent.create({ data: { name: OUTCOME_FAILURE_EVENT, workspaceId: x.p.workspaceId, runId: x.f.code.startsWith("pack") ? x.f.ref : null, props: json({ dedupeKey: x.key, code: x.f.code, severity: x.f.severity, reason: x.f.reason, ref: x.f.ref, since: x.f.since, email: x.p.email, workspaceName: x.p.workspaceName }) } });
    created.push(ev.id);
    items.push({ workspaceId: x.p.workspaceId, workspaceName: x.p.workspaceName, email: x.p.email, failure: x.f });
  }
  let emailed = 0;
  if (items.length && d.send && env.CS_DRY_RUN !== "1") {
    const m = alertEmail(items, (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com"));
    try { await d.send({ to: OUTCOME_ALERT_TO, subject: m.subject, text: m.text, html: "", headers: {} }); emailed = items.length; }
    catch (e) { await d.db.adsEvent.deleteMany({ where: { id: { in: created } } }); log("warn", "outcome alert email failed; will retry", { error: errMsg(e) }); }
  }
  // weekly effectiveness ledger
  let ledger = false;
  const last = await d.db.adsEvent.findFirst({ where: { name: EFFECTIVENESS_EVENT }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!last || now.getTime() - last.createdAt.getTime() >= WEEK) {
    const l = buildLedger(await loadPerfRows(d.db, now));
    await d.db.adsEvent.create({ data: { name: EFFECTIVENESS_EVENT, props: json({ ...l, entries: l.entries.slice(0, 80), hookLibrary: hookLibrary(l), generatedAt: now.toISOString() }) } });
    ledger = true;
  }
  return { failuresNew: emailed || !d.send ? created.length : 0, emailed, ledger };
}

export function startProductIntelLoop(deps: PiDeps, everyMs = 60 * 60_000): () => void {
  const env = deps.env ?? process.env;
  let prov: AIProvider | null = null;
  const provider = () => (prov ??= deps.provider ?? (() => { try { return createProvider("codex", { ...env, TEXT_BRAIN: "codex" }, { db: deps.db, by: "engine" }); } catch { return null; } })());
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (await systemEnabled(deps.db, "creative_qa")) {
        try { const r = await creativeQaTick(deps, provider); await recordSystemRun(deps.db, "creative_qa", { ok: true, outputs: r.scored + r.findings }); }
        catch (e) { await recordSystemRun(deps.db, "creative_qa", { ok: false, error: errMsg(e) }); }
      }
      if (await systemEnabled(deps.db, "outcome_verify")) {
        try { const r = await outcomeTick(deps); await recordSystemRun(deps.db, "outcome_verify", { ok: true, outputs: r.failuresNew + (r.ledger ? 1 : 0) }); }
        catch (e) { await recordSystemRun(deps.db, "outcome_verify", { ok: false, error: errMsg(e) }); }
      }
    } finally { busy = false; }
  };
  const first = setTimeout(() => void tick(), 240_000);
  const t = setInterval(() => void tick(), everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
