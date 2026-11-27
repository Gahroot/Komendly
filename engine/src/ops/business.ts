// Business operations loop: financial intelligence (sys_finance_intel), business admin digest (sys_biz_admin) and partner
// operations (sys_partner_ops). Hourly tick, single replica, all three OFF until their AdsFeatureFlag. Read-only on business
// data; writes only AdsEvents (ad_spend, finance_snapshot, obligations_digest_sent, partner_statement, partner_*_sent) and
// heartbeats. Never moves money, never switches flags, never changes spend. Emails go to ADS_ALERT_EMAIL / approved partners.
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import { FIXED_ITEMS } from "../../../src/lib/ops/finance/data";
import { FINANCE_EVENT, loadFinance } from "../../../src/lib/ops/finance/load";
import { fetchMetaDaySpendCents } from "../../../src/lib/ops/finance/meta-spend";
import { OBLIGATIONS } from "../../../src/lib/ops/admin/data";
import { digestSection, evaluateAll } from "../../../src/lib/ops/admin/obligations";
import { loadPartnerOps, lastFullMonth, PARTNER_PAID_EVENTS } from "../../../src/lib/ops/partners/load";
import { STATEMENT_EVENT } from "../../../src/lib/ops/partners/statement";
import { activationEmail, thanksDue, thankYouEmail } from "../../../src/lib/ops/partners/health";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";

const DIGEST_EVENT = "obligations_digest_sent";
const isoWeek = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - y.getTime()) / 86_400_000 + 1) / 7)}`; };
const html = (t: string) => `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
const exists = (db: Db, name: string, path: string, equals: string, workspaceId?: string) => db.adsEvent.findFirst({ where: { name, props: { path: [path], equals }, ...(workspaceId ? { workspaceId } : {}) }, select: { id: true } });

export async function financeTick(db: Db, send?: SendMail, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<number> {
  if (!(await systemEnabled(db, "finance_intel"))) return -1;
  const day = now.toISOString().slice(0, 10);
  let out = 0;
  try {
    // 1. record yesterday's Meta spend (read-only Insights call) so CAC includes it
    const y = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    if (env.META_ADS_TOKEN && !(await exists(db, "ad_spend", "day", y))) {
      const cents = await fetchMetaDaySpendCents(y, env);
      if (cents !== null) { await db.adsEvent.create({ data: { name: "ad_spend", props: { day: y, amountCents: cents, source: "meta_insights" } } }); out++; }
    }
    // 2. daily snapshot (+ weekly marker on Mondays)
    if (!(await exists(db, FINANCE_EVENT, "day", day))) {
      const f = await loadFinance(db, FIXED_ITEMS, now, env);
      await db.adsEvent.create({ data: { name: FINANCE_EVENT, props: JSON.parse(JSON.stringify({ day, kind: now.getUTCDay() === 1 ? "week" : "day", finance: f })) } });
      out++;
      const a = f.month.anomaly?.spike ? f.month.anomaly : f.week.anomaly?.spike ? f.week.anomaly : null;
      const to = env.ADS_ALERT_EMAIL;
      if (a && to && send && !(await exists(db, "finance_anomaly_alerted", "day", day))) {
        const text = `Cost anomaly: ${a.reason}. Check engine cost (AdRun.costMicros) and provider usage. Nothing was paused automatically.`;
        await send({ to, subject: "Cost spike detected", text, html: html(text), headers: {} });
        await db.adsEvent.create({ data: { name: "finance_anomaly_alerted", props: { day, value: a.value, baseline: a.baseline } } });
      }
    }
    await recordSystemRun(db, "finance_intel", { ok: true, outputs: out }, now);
    return out;
  } catch (e) { await recordSystemRun(db, "finance_intel", { ok: false, error: errMsg(e) }, now); throw e; }
}

export async function adminTick(db: Db, send?: SendMail, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<boolean> {
  if (!(await systemEnabled(db, "biz_admin"))) return false;
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 15) return false; // Monday, after the ops brief (14:50 UTC)
  const week = isoWeek(now);
  try {
    if (await exists(db, DIGEST_EVENT, "week", week)) return false;
    const hasRevenue = (await db.adsEvent.count({ where: { name: { in: ["purchased", "renewed", "paid_converted"] } } })) > 0;
    const sec = digestSection(evaluateAll(OBLIGATIONS, now, { hasRevenue }));
    const to = env.ADS_ALERT_EMAIL;
    let sent = false;
    if (sec && send && to) { await send({ to, subject: sec.subject, text: sec.text, html: html(sec.text), headers: {} }); sent = true; }
    await db.adsEvent.create({ data: { name: DIGEST_EVENT, props: { week, count: sec?.count ?? 0, sent } } });
    await recordSystemRun(db, "biz_admin", { ok: true, outputs: sent ? 1 : 0 }, now);
    return sent;
  } catch (e) { await recordSystemRun(db, "biz_admin", { ok: false, error: errMsg(e) }, now); throw e; }
}

const MAX_ACTIVATION_PER_DAY = 5, MAX_THANKS_PER_DAY = 2;
export async function partnerTick(db: Db, send?: SendMail, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<number> {
  if (!(await systemEnabled(db, "partner_ops"))) return -1;
  let out = 0;
  try {
    const ops = await loadPartnerOps(db, now, lastFullMonth(now), env);
    if (now.getUTCDate() >= 2) {
      for (const r of ops.rows) {
        if (await db.adsEvent.findFirst({ where: { name: STATEMENT_EVENT, AND: [{ props: { path: ["partnerId"], equals: r.statement.partnerId } }, { props: { path: ["month"], equals: ops.month } }] }, select: { id: true } })) continue;
        if (r.statement.status === "no_activity" && r.statement.referredSignups === 0) continue;
        await db.adsEvent.create({ data: { name: STATEMENT_EVENT, props: JSON.parse(JSON.stringify(r.statement)) } });
        out++;
      }
    }
    if (send) {
      const base = (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
      let act = 0, thanks = 0;
      for (const r of ops.rows) {
        if (!r.email) continue;
        const ws = (await db.adsPartner.findUnique({ where: { id: r.input.id }, select: { workspaceId: true } }))?.workspaceId;
        if (!ws) continue;
        if (r.health === "activation_needed" && r.link && act < MAX_ACTIVATION_PER_DAY) {
          const m = activationEmail(r.input.name, r.link, `${base}/ads/partner`);
          await send({ to: r.email, subject: m.subject, text: m.text, html: html(m.text), headers: {} });
          await db.adsEvent.create({ data: { name: PARTNER_PAID_EVENTS.activation, workspaceId: ws, props: { partnerId: r.input.id } } });
          act++; out++;
        } else if (r.health === "top" && thanksDue(r.input, now) && thanks < MAX_THANKS_PER_DAY) {
          const m = thankYouEmail(r.input.name, r.input.payingCustomers);
          await send({ to: r.email, subject: m.subject, text: m.text, html: html(m.text), headers: {} });
          await db.adsEvent.create({ data: { name: PARTNER_PAID_EVENTS.thanks, workspaceId: ws, props: { partnerId: r.input.id } } });
          thanks++; out++;
        }
      }
    }
    await recordSystemRun(db, "partner_ops", { ok: true, outputs: out }, now);
    return out;
  } catch (e) { await recordSystemRun(db, "partner_ops", { ok: false, error: errMsg(e) }, now); throw e; }
}

export function startBusinessOpsLoop(opts: { db: Db; send?: SendMail; env?: NodeJS.ProcessEnv }, everyMs = 60 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    const env = opts.env ?? process.env;
    (async () => {
      for (const [name, fn] of [["finance", () => financeTick(opts.db, opts.send, env)], ["admin", () => adminTick(opts.db, opts.send, env)], ["partners", () => partnerTick(opts.db, opts.send, env)]] as const) {
        try { await fn(); } catch (e) { log("warn", `business ops ${name} failed`, { error: errMsg(e) }); }
      }
    })().finally(() => { running = false; });
  };
  const first = setTimeout(tick, 240_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
