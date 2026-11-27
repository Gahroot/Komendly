// Ops loop: every 10 min (single replica) runs support ticket sync, the infra watch and the incident engine, each behind its
// own flag (sys_support_ops, sys_infra_watch, sys_incidents; all default OFF). Daily incident review at the first tick of the day.
import { dailyIncidentReview, incidentTick, type OpsDb } from "../../../src/lib/ops/incident-io";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import { infraTick } from "./infra";
import { supportTick } from "./support";

export interface OpsDeps { db: Db; send: SendMail; env?: NodeJS.ProcessEnv; now?: () => Date }

export async function opsTick(d: OpsDeps): Promise<void> {
  const now = (d.now ?? (() => new Date()))();
  const env = d.env ?? process.env;
  await supportTick(d.db, now).catch((e) => log("warn", "support tick failed", { error: errMsg(e) }));
  await infraTick(d).catch((e) => log("warn", "infra tick failed", { error: errMsg(e) }));
  if (!(await systemEnabled(d.db, "incidents"))) return;
  try {
    const db = d.db as unknown as OpsDb;
    const send = async (m: { to: string; subject: string; text: string }) => { await d.send({ ...m, html: `<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">${m.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`, headers: {} }); };
    const r = await incidentTick(db, send, { now, adminUrl: (env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "") });
    const filed = await dailyIncidentReview(db, now);
    await recordSystemRun(d.db, "incidents", { ok: true, outputs: r.created + r.contained + filed }, now);
  } catch (e) {
    await recordSystemRun(d.db, "incidents", { ok: false, error: errMsg(e) }, now);
    log("error", "incident tick failed", { error: errMsg(e) });
  }
}

export function startOpsLoop(d: OpsDeps): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await opsTick(d); } finally { running = false; }
  };
  const first = setTimeout(() => void tick(), 90_000);
  const timer = setInterval(() => void tick(), 10 * 60_000);
  return () => { clearTimeout(first); clearInterval(timer); };
}
