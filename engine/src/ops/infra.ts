// Infrastructure watch (flag sys_infra_watch, default OFF). READ-ONLY: HTTP GETs, one TLS handshake, RDAP lookups,
// pg_stat reads and SELECTs. Writes only `infra_check` AdsEvents (the incident job turns their signals into incidents)
// and a weekly "expiring soon" email to the owner. Never changes infrastructure. Docs: docs/ops/incident-runbook.md.
import tls from "node:tls";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import { codexLoginItem, dbSignals, evalExpiry, expirySignals, expiringSoon, httpSignals, OWNED_DOMAINS, parseRdapExpiry, weeklyExpiryEmail, type ExpiryEval, type ExpiryItem, type HttpFact } from "../../../src/lib/ops/infra";
import type { Signal } from "../../../src/lib/ops/incidents";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as object;
const FAST_EVERY_MS = 55 * 60_000;
const SLOW_EVERY_MS = 12 * 3_600_000;
const OWNER = "nolan@prestyj.com";

export function tlsExpiry(host: string, timeoutMs = 10_000): Promise<Date | null> {
  return new Promise((resolve) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
      const v = s.getPeerCertificate()?.valid_to;
      s.end();
      const d = v ? new Date(v) : null;
      resolve(d && !Number.isNaN(d.getTime()) ? d : null);
    });
    s.on("error", () => resolve(null));
    s.on("timeout", () => { s.destroy(); resolve(null); });
  });
}

async function http(name: string, url: string): Promise<HttpFact> {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "komendly-infra-watch" } });
    return { name, url, status: r.status, ms: Date.now() - t };
  } catch (e) {
    return { name, url, status: null, ms: null, error: errMsg(e).slice(0, 200) };
  }
}

async function rdapExpiry(domain: string): Promise<Date | null> {
  try {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/rdap+json" } });
    return r.ok ? parseRdapExpiry(await r.json()) : null;
  } catch { return null; }
}

export async function dbFacts(db: Db) {
  const [r] = await db.$queryRaw<{ conns: bigint; maxc: string; size: bigint; slow: bigint; waiting: bigint }[]>`
    select (select count(*) from pg_stat_activity) as conns,
           current_setting('max_connections') as maxc,
           pg_database_size(current_database()) as size,
           (select count(*) from pg_stat_activity where state = 'active' and now() - query_start > interval '30 seconds') as slow,
           (select count(*) from pg_stat_activity where wait_event_type = 'Lock') as waiting`;
  if (!r) throw new Error("pg_stat returned no row");
  return { connections: Number(r.conns), maxConnections: Number(r.maxc), sizeBytes: Number(r.size), slowQueries: Number(r.slow), waitingLocks: Number(r.waiting) };
}

export interface InfraDeps { db: Db; send: SendMail; env?: NodeJS.ProcessEnv; now?: () => Date }

async function lastCheck(db: Db, kind: "fast" | "slow"): Promise<Date | null> {
  const e = await db.adsEvent.findFirst({ where: { name: "infra_check", props: { path: ["kind"], equals: kind } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return e?.createdAt ?? null;
}

export async function infraTick(d: InfraDeps): Promise<{ fast: boolean; slow: boolean }> {
  const env = d.env ?? process.env;
  const now = (d.now ?? (() => new Date()))();
  const out = { fast: false, slow: false };
  if (!(await systemEnabled(d.db, "infra_watch"))) return out;
  const errors: string[] = [];
  const site = (env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");

  const lf = await lastCheck(d.db, "fast");
  if (!lf || now.getTime() - lf.getTime() >= FAST_EVERY_MS) {
    out.fast = true;
    try {
      const targets: [string, string][] = [["site", `${site}/`]];
      if (env.INFRA_KLY_URL) targets.push(["kly", `${env.INFRA_KLY_URL.replace(/\/$/, "")}/healthz`]);
      if (env.INFRA_ENGINE_URL) targets.push(["engine", `${env.INFRA_ENGINE_URL.replace(/\/$/, "")}/healthz`]);
      const facts = await Promise.all(targets.map(([n, u]) => http(n, u)));
      const signals: Signal[] = httpSignals(facts);
      let db: Record<string, number> | null = null;
      try {
        const f = await dbFacts(d.db);
        db = f;
        signals.push(...dbSignals(f, Number(env.INFRA_DB_WARN_GB || 8) * 1e9));
      } catch (e) { signals.push({ key: "infra:db:connect", type: "infra", severity: "P1", title: "Database check failed", detail: errMsg(e).slice(0, 200) }); }
      const jobs24h = await d.db.adJob.count({ where: { createdAt: { gte: new Date(now.getTime() - 86_400_000) } } }).catch(() => null);
      await d.db.adsEvent.create({ data: { name: "infra_check", props: json({ kind: "fast", ok: signals.length === 0, http: facts, db, costInputs: { dbBytes: db?.sizeBytes ?? null, jobs24h }, signals }) } });
    } catch (e) { errors.push(`fast: ${errMsg(e)}`); }
  }

  const ls = await lastCheck(d.db, "slow");
  if (!ls || now.getTime() - ls.getTime() >= SLOW_EVERY_MS) {
    out.slow = true;
    try {
      const items: ExpiryItem[] = [];
      const host = new URL(site).hostname;
      items.push({ name: `SSL certificate ${host}`, kind: "ssl", expiresAt: await tlsExpiry(host), action: "Vercel renews automatically; check the domain's DNS/CAA in Vercel." });
      const sending = (await d.db.outboundDomain.findMany({ select: { domain: true } })).map((x) => x.domain);
      for (const dom of new Set<string>([...OWNED_DOMAINS, ...sending])) items.push({ name: `Domain ${dom}`, kind: "domain", expiresAt: await rdapExpiry(dom), action: "Renew at the registrar (turn on auto-renew)." });
      const conns = await d.db.metaConnection.findMany({ where: { tokenExpiresAt: { not: null } }, select: { workspaceId: true, viaPartner: true, tokenExpiresAt: true }, orderBy: { tokenExpiresAt: "asc" }, take: 200 });
      const partner = conns.find((c) => c.viaPartner), customer = conns.find((c) => !c.viaPartner);
      if (partner) items.push({ name: "Meta token (founder partner login)", kind: "meta_token", expiresAt: partner.tokenExpiresAt, action: "Reconnect Meta from the admin partner page before it lapses; partner ads stop otherwise." });
      if (customer) items.push({ name: "Meta token (earliest customer connection)", kind: "meta_token", expiresAt: customer.tokenExpiresAt, action: "Customer reconnect prompt; their ads stop publishing otherwise." });
      items.push(codexLoginItem(await d.db.codexCredential.findUnique({ where: { id: "codex" }, select: { updatedAt: true } }).catch(() => null), now));
      const evals: ExpiryEval[] = items.map((i) => evalExpiry(i, now));
      const signals = expirySignals(evals);
      await d.db.adsEvent.create({ data: { name: "infra_check", props: json({ kind: "slow", ok: signals.length === 0, expiry: evals, signals }) } });
      await weeklyDigest(d, evals, now);
    } catch (e) { errors.push(`slow: ${errMsg(e)}`); }
  }
  if (out.fast || out.slow) await recordSystemRun(d.db, "infra_watch", { ok: errors.length === 0, outputs: 1, error: errors.join("; ") || null }, now);
  return out;
}

/** Mondays (UTC), once per ISO week: the owner's "expiring soon" list. Skipped when nothing expires within 45 days. */
async function weeklyDigest(d: InfraDeps, evals: ExpiryEval[], now: Date): Promise<void> {
  if (now.getUTCDay() !== 1) return;
  const week = `${now.getUTCFullYear()}-${Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * 86_400_000))}`;
  if (await d.db.adsEvent.findFirst({ where: { name: "infra_expiring_digest", props: { path: ["week"], equals: week } }, select: { id: true } })) return;
  const mail = weeklyExpiryEmail(expiringSoon(evals));
  await d.db.adsEvent.create({ data: { name: "infra_expiring_digest", props: { week, items: expiringSoon(evals).length } } });
  if (mail) await d.send({ to: OWNER, subject: mail.subject, text: mail.text, html: `<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">${mail.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`, headers: {} }).catch((e) => log("warn", "infra digest send failed", { error: errMsg(e) }));
}
