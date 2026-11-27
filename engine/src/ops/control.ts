// Ops control loop (growth systems ops_control + ops_digest). Hourly tick, single replica.
//  - ops_control: once per UTC day writes a `system_status` AdsEvent (the accountability ledger snapshot).
//  - ops_digest:  Monday after 14:50 UTC sends ONE short owner brief (skipped when nothing changed / nothing needs a decision).
// Read-only on business data. Writes only: system_status, ops_brief_sent, heartbeats. Never switches flags.
import { digestAbsorbed, recordDigestSent } from "../../../src/lib/exec/digest-dedupe";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import { buildOwnerBrief } from "../../../src/lib/ops/control/brief";
import { loadLedger, statusProps, STATUS_EVENT } from "../../../src/lib/ops/control/loader";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";

export const BRIEF_EVENT = "ops_brief_sent";
const isoWeek = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y.getTime()) / 86_400_000 + 1) / 7)).padStart(2, "0")}`; };

export async function opsControlTick(db: Db, send?: SendMail, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<{ wrote: boolean; briefed: boolean }> {
  let wrote = false, briefed = false;
  const day = now.toISOString().slice(0, 10);
  if (await systemEnabled(db, "ops_control")) {
    try {
      const exists = await db.adsEvent.findFirst({ where: { name: STATUS_EVENT, props: { path: ["day"], equals: day } }, select: { id: true } });
      if (!exists) {
        const l = await loadLedger(db, now);
        await db.adsEvent.create({ data: { name: STATUS_EVENT, props: JSON.parse(JSON.stringify(statusProps(l, day))) } });
        wrote = true;
      }
      await recordSystemRun(db, "ops_control", { ok: true, outputs: wrote ? 1 : 0 }, now);
    } catch (e) {
      await recordSystemRun(db, "ops_control", { ok: false, error: errMsg(e) }, now);
      throw e;
    }
  }
  if (send && now.getUTCDay() === 1 && now.getUTCHours() * 60 + now.getUTCMinutes() >= 14 * 60 + 50 && (await systemEnabled(db, "ops_digest"))) {
    const week = isoWeek(now);
    try {
      const done = await db.adsEvent.findFirst({ where: { name: BRIEF_EVENT, props: { path: ["week"], equals: week } }, select: { id: true } });
      if (!done) {
        const l = await loadLedger(db, now);
        const snap = await db.adsEvent.findFirst({ where: { name: "revenue_snapshot" }, orderBy: { createdAt: "desc" }, select: { props: true } });
        const sp = (snap?.props ?? null) as { stage?: { roadmap?: string }; economics?: { payingCustomers?: number; mrrCents?: { cents: number | null } }; constraints?: Array<{ label: string }> } | null;
        const owner = await db.adsEvent.findMany({ where: { name: "optimizer_owner_decision", createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 5, select: { props: true } });
        const needs = owner.map((o) => { const p = (o.props ?? {}) as { title?: string; claim?: string }; return String(p.title ?? p.claim ?? ""); }).filter(Boolean);
        const flag = (k: string) => Boolean(l.facts.flags[k]);
        const brief = buildOwnerBrief({
          weekLabel: week, adminUrl: `${(env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "")}/admin/ads/ops`,
          business: sp?.economics ? { stage: sp.stage?.roadmap ?? "unknown", payingCustomers: sp.economics.payingCustomers ?? 0, mrrCents: sp.economics.mrrCents?.cents ?? null, topConstraint: sp.constraints?.[0]?.label ?? null } : null,
          previous: null, findings: l.findings.filter((f) => f.kind !== "unproven"), resolved: [], needsOwner: needs, optimizerLines: [],
        }, { revenueDigest: flag("sys_revenue_digest"), optimizerDigest: flag("sys_optimizer_digest"), opsDigest: true });
        const worth = needs.length > 0 || l.findings.some((f) => f.severity === "high");
        const absorbed = await digestAbsorbed(db, "ops_brief"); // sys_exec_brief ON: the executive brief is the one Monday email
        if (worth && !absorbed) {
          const to = env.OPS_DIGEST_TO || env.ADS_ALERT_EMAIL || "nolan@prestyj.com";
          await send({ to, subject: brief.subject, text: brief.text, html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${brief.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`, headers: {} });
          briefed = true;
          await recordDigestSent(db, "ops_brief", week);
        }
        await db.adsEvent.create({ data: { name: BRIEF_EVENT, props: { week, sent: briefed } } });
        await recordSystemRun(db, "ops_digest", { ok: true, outputs: briefed ? 1 : 0 }, now);
      }
    } catch (e) {
      await recordSystemRun(db, "ops_digest", { ok: false, error: errMsg(e) }, now);
      throw e;
    }
  }
  return { wrote, briefed };
}

export function startOpsControlLoop(opts: { db: Db; send?: SendMail }, everyMs = 60 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    opsControlTick(opts.db, opts.send)
      .then((r) => (r.wrote || r.briefed) && log("info", "ops control", r))
      .catch((e) => log("warn", "ops control failed", { error: errMsg(e) }))
      .finally(() => { running = false; });
  };
  const first = setTimeout(tick, 240_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
