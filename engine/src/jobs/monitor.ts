// System monitor: every 10 min, computes each growth system's health and emails ADS_ALERT_EMAIL once per incident
// (failing / stalled / silent), plus a "recovered" note; same for the Codex provider heartbeat. Decisions are pure
// (src/lib/growth/monitor.ts); this file only does I/O. Writes its own heartbeat (EngineHeartbeat monitor:alerts).
import { GROWTH_SYSTEMS, parseBeat, systemEnabled, systemHeartbeatId } from "../../../src/lib/growth/systems";
import { MONITOR_CYCLE_MINUTES, MONITOR_HEARTBEAT_ID, alertEmail, decideProviderAlert, decideSystemAlert, parseMonitorBeat, providerProblem, type AlertDecision } from "../../../src/lib/growth/monitor";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";

export interface MonitorDeps { db: Db; send: SendMail; env?: NodeJS.ProcessEnv; now?: () => Date }

export async function monitorTick(d: MonitorDeps): Promise<{ alerts: number }> {
  const env = d.env ?? process.env;
  const now = (d.now ?? (() => new Date()))();
  const to = env.ADS_ALERT_EMAIL;
  const adminUrl = `${(env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "")}/admin/money`;
  let alerts = 0;
  const notify = async (what: string, dec: AlertDecision): Promise<void> => {
    const m = alertEmail(what, dec, adminUrl);
    if (!m) return;
    log("warn", "monitor alert", { what, action: dec.action });
    if (!to) return;
    await d.send({ to, subject: m.subject, text: m.text, html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${m.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`, headers: {} });
    alerts += 1;
  };
  const errors: string[] = [];
  for (const sys of GROWTH_SYSTEMS) {
    try {
      const id = systemHeartbeatId(sys.key);
      const row = await d.db.engineHeartbeat.findUnique({ where: { id } });
      const beat = row ? parseBeat(row.meta) : null;
      const { decision } = decideSystemAlert(sys, await systemEnabled(d.db, sys.key), beat, now);
      if (decision.action === "none" || !row) continue;
      // Store state first (send failures retry never spam: alertedAt set means "handled").
      const alerting = decision.action === "alert";
      const meta = { ...(row.meta as object), alertedAt: alerting ? now.toISOString() : null, alertReason: alerting ? decision.reason : null };
      await d.db.engineHeartbeat.update({ where: { id }, data: { meta } });
      await notify(sys.label, decision);
    } catch (e) {
      errors.push(`${sys.key}: ${errMsg(e)}`);
    }
  }
  const prev = parseMonitorBeat((await d.db.engineHeartbeat.findUnique({ where: { id: MONITOR_HEARTBEAT_ID } }).catch(() => null))?.meta);
  let codex = { codexAlertedAt: prev.codexAlertedAt, codexAlertReason: prev.codexAlertReason };
  try {
    const pb = await d.db.engineHeartbeat.findUnique({ where: { id: "provider:codex" } });
    const dec = decideProviderAlert(providerProblem(pb, now), prev.codexAlertedAt);
    if (dec.action === "alert") codex = { codexAlertedAt: now.toISOString(), codexAlertReason: dec.reason };
    if (dec.action === "recover") codex = { codexAlertedAt: null, codexAlertReason: null };
    await notify("Codex provider (engine AI)", dec.action === "recover" ? { action: "recover", reason: prev.codexAlertReason ?? "" } : dec);
  } catch (e) {
    errors.push(`codex: ${errMsg(e)}`);
  }
  const at = now.toISOString();
  const meta = { ...prev, ...codex, lastRunAt: at, runs: prev.runs + 1, alertsSent: prev.alertsSent + alerts, lastAlertAt: alerts ? at : prev.lastAlertAt, lastError: errors.length ? errors.join("; ").slice(0, 500) : null };
  const ok = errors.length === 0;
  await d.db.engineHeartbeat.upsert({ where: { id: MONITOR_HEARTBEAT_ID }, create: { id: MONITOR_HEARTBEAT_ID, kind: "monitor", ok, message: meta.lastError, meta }, update: { ok, message: meta.lastError, meta } });
  return { alerts };
}

export function startMonitorLoop(d: MonitorDeps): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await monitorTick(d);
    } catch (e) {
      log("error", "monitor tick failed", { error: errMsg(e) });
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), 60_000);
  const timer = setInterval(() => void tick(), MONITOR_CYCLE_MINUTES * 60_000);
  return () => { clearTimeout(first); clearInterval(timer); };
}
