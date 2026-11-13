// Sending-domain health: periodic MX / SPF / DKIM (known selector) / DMARC checks plus DBL-style domain blocklists.
// A listed domain or broken DNS pauses the whole domain (OutboundDomain.paused gates every mailbox on it) with a
// KlyDecision; an auto pause lifts itself on the next clean check. Transient resolver errors never count as failures.
// Record logic adapted from warmbly/warmbly (Apache-2.0) internal/pkg/dnsauth/dnsauth.go (authoritative vs transient).
import { promises as dnsp } from "node:dns";
import { DEFAULT_DOMAIN_DAILY_CAP } from "../../src/lib/ads/outbound/policy";
import type { Db } from "./db";
import { log } from "./log";

export const DOMAIN_CHECK_EVERY_MS = 6 * 3600_000;
export const DOMAINS_PER_TICK = 10;
/** Broken DNS must fail this many checks in a row before a pause (one odd answer is not a misconfiguration). */
export const DNS_FAIL_STREAK = 2;

export interface Resolver {
  resolveMx: (name: string) => Promise<Array<{ exchange: string }>>;
  resolveTxt: (name: string) => Promise<string[][]>;
  resolve4: (name: string) => Promise<string[]>;
}

export const systemResolver: Resolver = { resolveMx: (n) => dnsp.resolveMx(n), resolveTxt: (n) => dnsp.resolveTxt(n), resolve4: (n) => dnsp.resolve4(n) };

/** DBL-style domain lists. `refused` = the list answered "won't serve you" (e.g. Spamhaus via a public resolver): skip. */
export const BLOCKLISTS: ReadonlyArray<{ name: string; zone: string; refused: (ip: string) => boolean }> = [
  { name: "Spamhaus DBL", zone: "dbl.spamhaus.org", refused: (ip) => ip.startsWith("127.255.255.") },
  { name: "SURBL", zone: "multi.surbl.org", refused: (ip) => ip === "127.0.0.1" },
  { name: "URIBL", zone: "multi.uribl.com", refused: (ip) => ip === "127.0.0.1" },
];

type Lookup<T> = { ok: true; value: T } | { ok: false; notFound: boolean };

function notFound(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
}

async function look<T>(f: () => Promise<T>): Promise<Lookup<T>> {
  try {
    return { ok: true, value: await f() };
  } catch (e) {
    return { ok: false, notFound: notFound(e) };
  }
}

export interface DomainCheck {
  mx: boolean | null;
  spf: boolean | null;
  dmarc: boolean | null;
  /** null = no selector known or lookup failed (advisory only). */
  dkim: boolean | null;
  listedOn: string[];
  skippedLists: string[];
}

const joinTxt = (rows: string[][]) => rows.map((r) => r.join(""));

export async function checkDomain(domain: string, dkimSelector: string | null, r: Resolver = systemResolver): Promise<DomainCheck> {
  const val = <T>(l: Lookup<T>, ok: (v: T) => boolean): boolean | null => (l.ok ? ok(l.value) : l.notFound ? false : null);
  const [mx, spf, dmarc, dkim] = await Promise.all([
    look(() => r.resolveMx(domain)),
    look(() => r.resolveTxt(domain)),
    look(() => r.resolveTxt(`_dmarc.${domain}`)),
    dkimSelector ? look(() => r.resolveTxt(`${dkimSelector}._domainkey.${domain}`)) : Promise.resolve(null),
  ]);
  const listedOn: string[] = [];
  const skippedLists: string[] = [];
  await Promise.all(
    BLOCKLISTS.map(async (b) => {
      const a = await look(() => r.resolve4(`${domain}.${b.zone}`));
      if (!a.ok) {
        if (!a.notFound) skippedLists.push(b.name);
        return;
      }
      if (a.value.some(b.refused) || !a.value.some((ip) => ip.startsWith("127."))) skippedLists.push(b.name);
      else listedOn.push(b.name);
    }),
  );
  return {
    mx: val(mx, (v) => v.some((x) => x.exchange.length > 0)),
    spf: val(spf, (v) => joinTxt(v).some((t) => t.trim().toLowerCase().startsWith("v=spf1"))),
    dmarc: val(dmarc, (v) => joinTxt(v).some((t) => t.toLowerCase().includes("v=dmarc1"))),
    dkim: dkim ? val(dkim, (v) => joinTxt(v).some((t) => /(^|;)\s*p=[a-z0-9+/]/i.test(t))) : null,
    listedOn: listedOn.sort(),
    skippedLists: skippedLists.sort(),
  };
}

/** Why the domain must not send (blocklist at once; broken DNS after a streak), or null. DKIM only fails with a known selector. */
export function domainVerdict(c: DomainCheck, failStreak: number): { pause: string | null; dnsBroken: string[] } {
  const dnsBroken = [c.mx === false && "no MX record", c.spf === false && "no SPF record", c.dmarc === false && "no DMARC record", c.dkim === false && "DKIM key missing at its selector"].filter((x): x is string => Boolean(x));
  if (c.listedOn.length) return { pause: `listed on ${c.listedOn.join(", ")}`, dnsBroken };
  if (dnsBroken.length && failStreak + 1 >= DNS_FAIL_STREAK) return { pause: `broken DNS: ${dnsBroken.join(", ")}`, dnsBroken };
  return { pause: null, dnsBroken };
}

/** Make sure every mailbox domain has an OutboundDomain row (one createMany). */
export async function ensureDomains(db: Db, domains: readonly string[]): Promise<void> {
  const list = [...new Set(domains.filter(Boolean))].sort();
  if (list.length) await db.outboundDomain.createMany({ data: list.map((domain) => ({ domain, dailyCap: DEFAULT_DOMAIN_DAILY_CAP })), skipDuplicates: true });
}

/** Check the domains that are due (oldest first, at most DOMAINS_PER_TICK), pause/resume them. Returns what changed. */
export async function domainHealthTick(db: Db, domains: readonly string[], now: Date, r: Resolver = systemResolver, perTick = DOMAINS_PER_TICK): Promise<string[]> {
  await ensureDomains(db, domains);
  const due = await db.outboundDomain.findMany({ where: { domain: { in: [...domains] }, OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(now.getTime() - DOMAIN_CHECK_EVERY_MS) } }] }, orderBy: [{ checkedAt: { sort: "asc", nulls: "first" } }, { domain: "asc" }], take: perTick });
  const out: string[] = [];
  for (const d of due) {
    const c = await checkDomain(d.domain, d.dkimSelector, r);
    const v = domainVerdict(c, d.failStreak);
    const note = [v.dnsBroken.length ? v.dnsBroken.join(", ") : null, c.skippedLists.length ? `not checked: ${c.skippedLists.join(", ")}` : null].filter(Boolean).join("; ") || null;
    const base = { mxOk: c.mx, spfOk: c.spf, dkimOk: c.dkim, dmarcOk: c.dmarc, listedOn: c.listedOn, failStreak: v.dnsBroken.length ? d.failStreak + 1 : 0, checkNote: note, checkedAt: now };
    if (v.pause && !d.paused) {
      await db.outboundDomain.update({ where: { domain: d.domain }, data: { ...base, paused: true, pausedReason: `auto: ${v.pause}` } });
      await db.klyDecision.create({ data: { kind: "pause", summary: `Paused every mailbox on ${d.domain}: ${v.pause}.`, data: { domain: d.domain, ...c } } });
      log("warn", "kly domain auto-paused", { domain: d.domain, reason: v.pause });
      out.push(`${d.domain}: paused (${v.pause})`);
    } else if (!v.pause && d.paused && d.pausedReason?.startsWith("auto:") && !v.dnsBroken.length) {
      await db.outboundDomain.update({ where: { domain: d.domain }, data: { ...base, paused: false, pausedReason: null } });
      await db.klyDecision.create({ data: { kind: "resume", summary: `Resumed mailboxes on ${d.domain}: its DNS and blocklist checks are clean again (it was paused for: ${d.pausedReason.slice(6)}).`, data: { domain: d.domain } } });
      out.push(`${d.domain}: resumed`);
    } else {
      await db.outboundDomain.update({ where: { domain: d.domain }, data: base });
    }
  }
  return out;
}
