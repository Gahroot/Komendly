// Mailbox store: the env Gmail boxes (OUTBOUND_MAILBOXES) plus hundreds of rented mailboxes (Maildoso / SMTP) kept in
// OutboundMailbox with the password sealed by ADS_TOKEN_KEY (AES-256-GCM, crypto.ts). Also: fair rotation across
// mailboxes and domains, a pooled SMTP transport cache and a small concurrency helper (all state lives in the caller).
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { decryptToken, encryptToken, tokenKey } from "../../src/lib/ads/meta/core/crypto";
import { DEFAULT_DAILY_CAP, DEFAULT_DOMAIN_DAILY_CAP, MAILDOSO_DAILY_CAP, mailboxDayLimit, parseMailboxes, type MailboxEnv, type MailboxProvider } from "../../src/lib/ads/outbound/policy";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import type { Transport } from "./sender";

export const DB_SECRET_REF = "db";
export const ENV_SECRET_REF = "env:OUTBOUND_MAILBOXES";

type MailboxRow = NonNullable<Awaited<ReturnType<Db["outboundMailbox"]["findFirst"]>>>;

/** A sendable mailbox: SMTP/IMAP credentials (env or decrypted) + its DB state row. */
export type StoredMailbox = MailboxEnv & { id: string; provider: string; domain: string; row: MailboxRow };

export function mailDomain(address: string): string {
  return (address.split("@")[1] ?? "").trim().toLowerCase();
}

export function sealSecret(password: string, rawKey: string | undefined): string {
  return encryptToken(password, tokenKey(rawKey));
}

export function openSecret(sealed: string, rawKey: string | undefined): string {
  return decryptToken(sealed, tokenKey(rawKey));
}

/** Upsert OutboundMailbox state rows for the env mailboxes (password stays in env). */
export async function syncEnvMailboxes(db: Db, mailboxes: MailboxEnv[]): Promise<void> {
  for (const m of mailboxes) {
    const domain = mailDomain(m.address);
    await db.outboundMailbox.upsert({
      where: { address: m.address },
      create: { address: m.address, displayName: m.name, smtpHost: m.smtpHost, smtpPort: m.smtpPort, smtpUser: m.user, imapHost: m.imapHost, imapPort: m.imapPort, dailyCap: m.dailyCap ?? DEFAULT_DAILY_CAP, provider: "gmail", domain },
      update: { displayName: m.name, smtpHost: m.smtpHost, smtpPort: m.smtpPort, smtpUser: m.user, imapHost: m.imapHost, imapPort: m.imapPort, domain, ...(m.dailyCap ? { dailyCap: m.dailyCap } : {}) },
    });
  }
}

/**
 * Every usable mailbox: env ones (synced to rows first) + DB ones whose sealed password opens. Two queries for any count.
 * Paused rows are included (the sender needs them for auto-resume); rows without credentials are skipped.
 */
export async function loadMailboxes(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<StoredMailbox[]> {
  const parsed = parseMailboxes(env.OUTBOUND_MAILBOXES);
  const envBoxes = parsed.ok ? parsed.mailboxes : [];
  if (!parsed.ok) log("warn", "kly mailboxes", { error: parsed.error });
  if (envBoxes.length) await syncEnvMailboxes(db, envBoxes);
  const byAddress = new Map(envBoxes.map((m) => [m.address, m]));
  const rows = await db.outboundMailbox.findMany({ where: { OR: [{ address: { in: [...byAddress.keys()] } }, { secretEnc: { not: null } }] }, orderBy: { address: "asc" } });
  const out: StoredMailbox[] = [];
  let badKey = 0;
  for (const row of rows) {
    const e = byAddress.get(row.address);
    const domain = row.domain ?? mailDomain(row.address);
    if (e) {
      out.push({ ...e, id: row.id, provider: row.provider || "gmail", domain, row });
      continue;
    }
    if (!row.secretEnc) continue;
    try {
      const pass = openSecret(row.secretEnc, env.ADS_TOKEN_KEY);
      out.push({ address: row.address, name: row.displayName, user: row.smtpUser || row.address, appPassword: pass, smtpHost: row.smtpHost, smtpPort: row.smtpPort, imapHost: row.imapHost, imapPort: row.imapPort, dailyCap: row.dailyCap, id: row.id, provider: row.provider, domain, row });
    } catch {
      badKey++;
    }
  }
  if (badKey) log("warn", "kly mailboxes: sealed passwords did not open (ADS_TOKEN_KEY?)", { count: badKey });
  return out;
}

export interface StoreInput {
  address: string;
  displayName: string;
  password: string;
  provider: MailboxProvider;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  user?: string;
  dailyCap?: number;
  readyAt?: Date | null;
  vendorId?: string | null;
  vendorStatus?: string | null;
}

/**
 * Idempotent upsert of DB-stored mailboxes (one findMany + a write only for new/changed ones). readyAt, warm-up start,
 * dailyCap and pause state are only set on create, so a re-import never resets an admin's choices.
 */
export async function upsertStoredMailboxes(db: Db, rawKey: string | undefined, items: StoreInput[], now: Date): Promise<{ created: number; updated: number; unchanged: number }> {
  const key = tokenKey(rawKey);
  const addrs = items.map((i) => i.address.trim().toLowerCase());
  const existing = new Map((await db.outboundMailbox.findMany({ where: { address: { in: addrs } } })).map((r) => [r.address, r]));
  const r = { created: 0, updated: 0, unchanged: 0 };
  for (const i of items) {
    const address = i.address.trim().toLowerCase();
    const domain = mailDomain(address);
    const base = { displayName: i.displayName, smtpHost: i.smtpHost, smtpPort: i.smtpPort, smtpUser: i.user ?? address, imapHost: i.imapHost, imapPort: i.imapPort, provider: i.provider, domain, vendorId: i.vendorId ?? null, vendorStatus: i.vendorStatus ?? null };
    const row = existing.get(address);
    if (!row) {
      await db.outboundMailbox.create({ data: { address, ...base, secretRef: DB_SECRET_REF, secretEnc: encryptToken(i.password, key), dailyCap: i.dailyCap ?? (i.provider === "maildoso" ? MAILDOSO_DAILY_CAP : DEFAULT_DAILY_CAP), readyAt: i.readyAt ?? null, warmupStartedAt: now } });
      r.created++;
      continue;
    }
    let samePass = false;
    try {
      samePass = row.secretEnc !== null && decryptToken(row.secretEnc, key) === i.password;
    } catch {
      samePass = false;
    }
    const same = samePass && (Object.keys(base) as Array<keyof typeof base>).every((k) => row[k] === base[k]);
    if (same) {
      r.unchanged++;
      continue;
    }
    await db.outboundMailbox.update({ where: { id: row.id }, data: { ...base, secretRef: DB_SECRET_REF, ...(samePass ? {} : { secretEnc: encryptToken(i.password, key) }) } });
    r.updated++;
  }
  return r;
}

// ---------------------------------------------------------------------------
// Rotation (pure)

export interface RotationCandidate {
  id: string;
  domain: string;
  /** Today's limit for this mailbox (mailboxDayLimit) and how many it already sent. */
  limit: number;
  sentToday: number;
  lastSentAt: Date | null;
}

export interface DomainBudget {
  cap: number;
  sentToday: number;
}

/** Deterministic tie-break rank: adapted from warmbly/warmbly (Apache-2.0) scheduler tieRank (salted hash, no RNG state). */
export function tieRank(salt: string, id: string): number {
  return createHash("sha256").update(`${salt}:${id}`).digest().readUInt32BE(0);
}

/**
 * Pick up to `max` mailboxes (one send each) for this tick, spreading evenly across domains and mailboxes:
 * lowest domain fill first, then lowest mailbox fill, then least recently used (never-used first), then a salted tie rank.
 * A domain never exceeds its cap; mailboxes at their limit are skipped. Ordering adapted from warmbly/warmbly (Apache-2.0)
 * selectAccountLeastRecentlyUsed / weighted-by-remaining-capacity.
 */
export function planRotation(cands: readonly RotationCandidate[], domains: ReadonlyMap<string, DomainBudget>, max: number, salt: string, defaultDomainCap = DEFAULT_DOMAIN_DAILY_CAP): RotationCandidate[] {
  const used = new Map<string, number>();
  for (const [d, b] of domains) used.set(d, b.sentToday);
  const capOf = (d: string) => domains.get(d)?.cap ?? defaultDomainCap;
  const pool = cands.filter((c) => c.sentToday < c.limit);
  const rank = new Map(pool.map((c) => [c.id, tieRank(salt, c.id)]));
  const out: RotationCandidate[] = [];
  while (out.length < max && pool.length) {
    let best = -1;
    let bestKey: [number, number, number, number] | null = null;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i] as RotationCandidate;
      const cap = capOf(c.domain);
      const du = used.get(c.domain) ?? 0;
      if (du >= cap) continue;
      const key: [number, number, number, number] = [du / Math.max(1, cap), c.sentToday / Math.max(1, c.limit), c.lastSentAt?.getTime() ?? 0, rank.get(c.id) ?? 0];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && (key[2] < bestKey[2] || (key[2] === bestKey[2] && key[3] < bestKey[3])))))) {
        best = i;
        bestKey = key;
      }
    }
    if (best < 0) break;
    const [c] = pool.splice(best, 1) as [RotationCandidate];
    used.set(c.domain, (used.get(c.domain) ?? 0) + 1);
    out.push(c);
  }
  return out;
}

/** Today's combined send capacity: per mailbox limit (ready, unpaused, domain unpaused), clamped per domain by its cap. */
export function capacityOf(boxes: ReadonlyArray<{ domain: string; paused: boolean; provider?: string | null; dailyCap: number; warmupStartedAt: Date; readyAt?: Date | null }>, domains: ReadonlyMap<string, { cap: number; paused: boolean }>, now: Date): number {
  const per = new Map<string, number>();
  for (const b of boxes) {
    if (b.paused || domains.get(b.domain)?.paused) continue;
    per.set(b.domain, (per.get(b.domain) ?? 0) + mailboxDayLimit(b, now));
  }
  let n = 0;
  for (const [d, v] of per) n += Math.min(v, domains.get(d)?.cap ?? DEFAULT_DOMAIN_DAILY_CAP);
  return n;
}

// ---------------------------------------------------------------------------
// Pooled SMTP transports + bounded concurrency

export const TRANSPORT_IDLE_MS = 10 * 60_000;

export interface TransportPool {
  /** Same shape as smtpTransport: one pooled nodemailer transport per mailbox, reused across ticks. */
  transport: (m: MailboxEnv) => Transport;
  /** Close transports unused for TRANSPORT_IDLE_MS (so 300 mailboxes never hold 300 open connections). */
  closeIdle: (nowMs: number) => number;
  closeAll: () => void;
  size: () => number;
}

export function createTransportPool(clock: () => number = Date.now): TransportPool {
  const cache = new Map<string, { t: nodemailer.Transporter; key: string; usedAt: number }>();
  return {
    transport: (m) => async (mail) => {
      const key = `${m.smtpHost}:${m.smtpPort}:${m.user}:${createHash("sha256").update(m.appPassword).digest("hex").slice(0, 12)}`;
      let e = cache.get(m.address);
      if (!e || e.key !== key) {
        e?.t.close();
        e = { t: nodemailer.createTransport({ pool: true, maxConnections: 1, maxMessages: 50, host: m.smtpHost, port: m.smtpPort, secure: m.smtpPort === 465, auth: { user: m.user, pass: m.appPassword }, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 60_000 }), key, usedAt: clock() };
        cache.set(m.address, e);
      }
      e.usedAt = clock();
      await e.t.sendMail({ from: mail.from, to: mail.to, subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}), messageId: mail.messageId, headers: mail.headers });
    },
    closeIdle: (nowMs) => {
      let n = 0;
      for (const [a, e] of cache) {
        if (nowMs - e.usedAt < TRANSPORT_IDLE_MS) continue;
        e.t.close();
        cache.delete(a);
        n++;
      }
      return n;
    },
    closeAll: () => {
      for (const e of cache.values()) e.t.close();
      cache.clear();
    },
    size: () => cache.size,
  };
}

/** Run fn over items with at most `limit` in flight; results keep input order; a rejection becomes an Error result. */
export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (x: T) => Promise<R>): Promise<Array<R | Error>> {
  const out: Array<R | Error> = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i] as T);
      } catch (e) {
        out[i] = e instanceof Error ? e : new Error(errMsg(e));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// Per-process mail runtime (held by LoopState; nothing module-level)

export const MAILDOSO_SYNC_EVERY_MS = 6 * 3600_000;

export interface MailRuntime {
  pool: TransportPool;
  lastMaildosoAt: number;
  /** Peer warm-up health timing (warmup.ts). */
  warmup: { lastHealthAt: number };
}

export function createMailRuntime(): MailRuntime {
  return { pool: createTransportPool(), lastMaildosoAt: 0, warmup: { lastHealthAt: 0 } };
}
