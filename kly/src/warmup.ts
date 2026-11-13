// Self-run peer warm-up for the rented (Maildoso) mailboxes: each one sends ~40 short business-chat emails/day to other
// mailboxes in the pool (other domain first, never the same pair twice a day), the receivers' IMAP pass rescues them
// from spam, reads/stars/files them into "Warmup" and answers ~35% in-thread. Placement (inbox | spam | missing) feeds a
// 7-day spam rate that gates cold sending (policy.ts warmupReadiness) and auto-pauses cold sending above 25%.
// The two Gmail boxes only RECEIVE a capped amount (warmupGmailCap/day) and engage; they never send warm-up mail.
// Ideas adapted from warmbly/warmbly (Apache-2.0): internal/app/worker/event_warmup_action.go (file / mark read / star /
// rescue from spam), internal/client/smtpimap/imap/gmail_engagement.go (FindSpecialUse junk folder),
// internal/app/warmup/service.go (loadMetrics: 7-day placement rate over judged placements).
import { createHmac, randomBytes } from "node:crypto";
import { ImapFlow } from "imapflow";
import type { Prisma } from "@prisma/client";
import { sendDayStart, spamPlacementRate, WARMUP_PAUSE_PREFIX, type MailboxEnv, type WarmupGate } from "../../src/lib/ads/outbound/policy";
import type { Rng } from "./arms";
import type { Db } from "./db";
import { duePolls } from "./imap";
import { errMsg, log } from "./log";
import { mapPool, tieRank, type StoredMailbox } from "./mailboxes";
import type { Transport } from "./sender";
import type { KlySettingsRow } from "./settings";

export const WARMUP_MAX_PER_DAY = 80;
export const WARMUP_FOLDER = "Warmup";
/** Sends per tick across the pool / per mailbox, and SMTP sends in flight. 12k/day over the 12h window is ~17/min. */
export const WARMUP_MAX_PER_TICK = 120;
export const WARMUP_PER_MAILBOX_PER_TICK = 3;
export const WARMUP_SEND_CONCURRENCY = 10;
/** Warm-up send window (US Eastern, every day): 07:00-19:00. */
export const WARMUP_WINDOW_TZ = "America/New_York";
export const WARMUP_WINDOW = [7, 19] as const;
/** IMAP engagement: per tick, concurrency, how far back to look. */
export const ENGAGE_PER_TICK = 30;
export const ENGAGE_CONCURRENCY = 6;
export const ENGAGE_LOOKBACK_MS = 3 * 86_400_000;
export const STAR_PCT = 20;
/** Not seen by the receiver after this = "missing". */
export const MISSING_AFTER_MS = 48 * 3600_000;
export const WARMUP_RETENTION_MS = 30 * 86_400_000;
export const WARMUP_HEALTH_EVERY_MS = 30 * 60_000;
const DAY_MS = 86_400_000;

export type WarmupSettings = Pick<KlySettingsRow, "warmupEnabled" | "warmupPerDay" | "warmupGmailCap" | "warmupReplyPct" | "warmupMinDays" | "warmupReadySpamPct" | "warmupPauseSpamPct">;

// ---------------------------------------------------------------------------
// Recognition: a Message-ID whose local part carries an HMAC tag only Kly can make (looks like any client's id).

export function warmupSecretOf(env: NodeJS.ProcessEnv = process.env): string {
  return (env.KLY_WARMUP_SECRET || env.ADS_TOKEN_KEY || "").trim();
}

function tagOf(token: string, secret: string): string {
  return BigInt(`0x${createHmac("sha256", `kly-warmup:${secret}`).update(token).digest("hex").slice(0, 12)}`).toString(36).padStart(9, "0").slice(-9);
}

/** `<token.tag@domain>`; token defaults to 16 random base36 chars. */
export function warmupMessageId(domain: string, secret: string, token = BigInt(`0x${randomBytes(10).toString("hex")}`).toString(36).padStart(16, "0").slice(-16)): string {
  return `<${token}.${tagOf(token, secret)}@${domain}>`;
}

export function isWarmupMessageId(id: string | null | undefined, secret: string): boolean {
  if (!id || !secret) return false;
  const m = id.trim().match(/^<?([0-9a-z]{16})\.([0-9a-z]{9})@[^>\s]+>?$/);
  return Boolean(m?.[1] && m[2] === tagOf(m[1], secret));
}

export function normalizeMessageId(id: string): string {
  const t = id.trim();
  return t.startsWith("<") ? t : `<${t}>`;
}

// ---------------------------------------------------------------------------
// Content: short, plain business chat from local fragments (no links, images, tracking or AI).

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length) % xs.length] as T;

const SUBJECTS = ["Quick question", "Notes from today", "Thursday works", "Follow-up on the plan", "Small update", "About next week", "Checking in", "Draft for review", "Re-scheduling", "Numbers for the month", "Idea for the launch", "Team lunch", "Feedback round", "Call later?", "Timeline", "The client deck", "Budget sheet", "Summary of the call", "One more thing", "Agenda for Monday"] as const;
const GREETINGS = ["Hi {to},", "Hey {to},", "Hello {to},", "{to},", "Morning {to},", "Hi there {to},"] as const;
const OPENERS = ["Hope your week is going well.", "Thanks again for the quick turnaround.", "Just catching up on my notes.", "Sorry for the slow reply on this.", "Following up on what we talked about.", "Had a minute to look at this today.", "Quick one before I forget.", "Thanks for sending that over."] as const;
const MIDDLES = ["Could we move the review to Thursday afternoon?", "I went through the draft and it reads well, only a couple of small edits.", "The numbers look a bit better than last month.", "Can you share the latest version when you get a chance?", "I think we should keep the timeline as it is for now.", "Let me know if the 2pm slot still works for you.", "I added my comments in the doc, nothing major.", "We are on track for the end of the month.", "Do you have the notes from the last call?", "The team liked the second option more.", "Happy to jump on a short call if that is easier.", "I will send the summary to everyone tomorrow morning."] as const;
const CLOSERS = ["Thanks!", "Talk soon.", "Cheers,", "Best,", "Thanks a lot,", "Speak tomorrow,", "Have a good one,"] as const;
const REPLIES = ["Sounds good, thanks for the update.", "That works for me.", "Perfect, I will take a look this afternoon.", "Thanks, that is really helpful.", "Agreed, let's go with that.", "Got it, I will let the team know.", "Great, Thursday is fine.", "Thanks! I will get back to you by tomorrow.", "Makes sense to me.", "Good catch, I will fix that today."] as const;
const REPLY_EXTRA = ["", "", "Let me know if anything changes.", "I will send my notes after lunch.", "Can we also add a quick check-in next week?", "One small question on the timeline, but it can wait."] as const;

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") || "there";
}

export function composeWarmup(rng: Rng, fromName: string, toName: string): { subject: string; text: string } {
  const to = firstName(toName);
  const lines = [pick(rng, GREETINGS).replace("{to}", to), "", `${pick(rng, OPENERS)} ${pick(rng, MIDDLES)}`];
  if (rng() < 0.5) lines.push(pick(rng, MIDDLES));
  lines.push("", pick(rng, CLOSERS), firstName(fromName));
  return { subject: pick(rng, SUBJECTS), text: lines.join("\n") };
}

export function composeWarmupReply(rng: Rng, fromName: string, toName: string, subject: string): { subject: string; text: string } {
  const extra = pick(rng, REPLY_EXTRA);
  const body = `${pick(rng, REPLIES)}${extra ? ` ${extra}` : ""}`;
  const text = rng() < 0.5 ? `${body}\n\n${firstName(fromName)}` : `${firstName(toName)}, ${body.charAt(0).toLowerCase()}${body.slice(1)}\n\n${firstName(fromName)}`;
  return { subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`, text };
}

// ---------------------------------------------------------------------------
// Scheduling + pairing (pure)

export function dailyTarget(perDay: number): number {
  return Math.max(0, Math.min(WARMUP_MAX_PER_DAY, Math.round(perDay)));
}

/** Share of today's ET send window elapsed, in [0,1]. */
export function windowElapsed(now: Date, window: readonly [number, number] = WARMUP_WINDOW): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: WARMUP_WINDOW_TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? "0") + Number(p.find((x) => x.type === "minute")?.value ?? "0") / 60;
  return Math.max(0, Math.min(1, (h - window[0]) / (window[1] - window[0])));
}

/** How many sends should be done by now: spread through the window with a per-mailbox per-day phase jitter. */
export function dueByNow(target: number, now: Date, jitter: number): number {
  const f = windowElapsed(now);
  if (f <= 0) return 0;
  return Math.min(target, Math.floor(target * f + jitter));
}

export interface PairSender {
  id: string;
  domain: string;
  /** New threads still to start this tick. */
  want: number;
}

export interface PairReceiver {
  id: string;
  domain: string;
  /** Daily receive cap (Gmail: warmupGmailCap) and how many it already got today. */
  cap: number;
  receivedToday: number;
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Round-robin over senders, one receiver each per round: never itself, never a pair already used today (either
 * direction), never over a receiver's cap; another domain first, then the least-filled receiver, then a salted rank.
 */
export function planWarmupPairs(senders: readonly PairSender[], receivers: readonly PairReceiver[], pairsToday: ReadonlySet<string>, salt: string, max = WARMUP_MAX_PER_TICK): Array<{ senderId: string; recipientId: string }> {
  const used = new Set(pairsToday);
  const got = new Map(receivers.map((r) => [r.id, r.receivedToday]));
  const left = new Map(senders.map((s) => [s.id, Math.max(0, s.want)]));
  const out: Array<{ senderId: string; recipientId: string }> = [];
  const order = [...senders].sort((a, b) => tieRank(salt, a.id) - tieRank(salt, b.id));
  let progress = true;
  while (progress && out.length < max) {
    progress = false;
    for (const s of order) {
      if (out.length >= max || (left.get(s.id) ?? 0) <= 0) continue;
      const ok = receivers.filter((r) => r.id !== s.id && !used.has(pairKey(s.id, r.id)) && (got.get(r.id) ?? 0) < r.cap);
      const other = ok.filter((r) => r.domain !== s.domain);
      const pool = other.length ? other : ok;
      let best: PairReceiver | null = null;
      let bestKey: [number, number] = [Infinity, Infinity];
      for (const r of pool) {
        const key: [number, number] = [(got.get(r.id) ?? 0) / Math.max(1, r.cap), tieRank(`${salt}:${s.id}`, r.id)];
        if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
          best = r;
          bestKey = key;
        }
      }
      if (!best) {
        left.set(s.id, 0);
        continue;
      }
      used.add(pairKey(s.id, best.id));
      got.set(best.id, (got.get(best.id) ?? 0) + 1);
      left.set(s.id, (left.get(s.id) ?? 0) - 1);
      out.push({ senderId: s.id, recipientId: best.id });
      progress = true;
    }
  }
  return out;
}

/** Thread length chosen at the start: ~replyPct of threads get a reply (2 deep), half of those a third message. */
export function threadDepth(rng: Rng, replyPct: number): number {
  if (rng() * 100 >= replyPct) return 1;
  return rng() < 0.5 ? 2 : 3;
}

/** Who may send warm-up mail: rented mailboxes in warm-up, not admin-paused (auto-paused ones keep warming). Never Gmail. */
export function isWarmupSender(b: Pick<StoredMailbox, "provider"> & { row: { warmupEnabled: boolean; paused: boolean; pausedReason: string | null } }): boolean {
  if (b.provider === "gmail" || !b.row.warmupEnabled) return false;
  return !b.row.paused || Boolean(b.row.pausedReason?.startsWith("auto:"));
}

/** Daily receive cap: Gmail boxes get warmupGmailCap (never overloaded); rented ones ~1.5x the send target. */
export function receiveCap(provider: string, s: Pick<WarmupSettings, "warmupPerDay" | "warmupGmailCap">): number {
  return provider === "gmail" ? Math.max(0, s.warmupGmailCap) : Math.ceil(dailyTarget(s.warmupPerDay) * 1.5);
}

// ---------------------------------------------------------------------------
// Engagement (pure decisions)

export interface EngageInput {
  folder: "inbox" | "spam";
  seen: boolean;
  flagged: boolean;
  depth: number;
  maxDepth: number;
  /** Gmail boxes never reply (they never send warm-up). */
  canReply: boolean;
  alreadyEngaged: boolean;
}

export interface EngagePlan {
  placement: "inbox" | "spam" | null;
  rescue: boolean;
  markRead: boolean;
  star: boolean;
  file: boolean;
  reply: boolean;
}

/** Spam: rescue to the inbox first (filed next pass, a natural dwell). Inbox: read, star ~20%, file into Warmup. */
export function engagementPlan(i: EngageInput, rng: Rng): EngagePlan {
  const first = !i.alreadyEngaged;
  const reply = first && i.canReply && i.depth < i.maxDepth;
  if (i.folder === "spam") return { placement: first ? "spam" : null, rescue: true, markRead: !i.seen, star: false, file: false, reply };
  return { placement: first ? "inbox" : null, rescue: false, markRead: !i.seen, star: first && !i.flagged && rng() * 100 < STAR_PCT, file: true, reply };
}

/** Junk folder: RFC 6154 \Junk first, then common names (Maildoso's exact name is unverified). */
export function junkFolder(list: ReadonlyArray<{ path: string; specialUse?: string; flags?: Set<string> }>): string | null {
  const special = list.find((l) => l.specialUse === "\\Junk" || l.flags?.has("\\Junk"));
  if (special) return special.path;
  const byName = list.find((l) => /^(junk|spam|junk e-?mail|bulk( mail)?|junk mail)$/i.test(l.path.split(/[/.]/).pop() ?? ""));
  return byName?.path ?? null;
}

// ---------------------------------------------------------------------------
// Health (pure)

export interface PlacementCounts {
  inbox: number;
  spam: number;
  missing: number;
}

export function warmupVerdict(c: PlacementCounts, s: Pick<WarmupSettings, "warmupPauseSpamPct" | "warmupReadySpamPct">, pausedForWarmup: boolean): "pause" | "resume" | null {
  const rate = spamPlacementRate(c.inbox, c.spam);
  if (rate === null) return null;
  if (!pausedForWarmup && rate > s.warmupPauseSpamPct / 100) return "pause";
  if (pausedForWarmup && rate < s.warmupReadySpamPct / 100) return "resume";
  return null;
}

// ---------------------------------------------------------------------------
// I/O

export interface WarmupRuntime {
  lastHealthAt: number;
}

export interface WarmupDeps {
  db: Db;
  settings: WarmupSettings;
  boxes: readonly StoredMailbox[];
  transport: (m: MailboxEnv) => Transport;
  now: Date;
  rng: Rng;
  secret: string;
  rt: WarmupRuntime;
}

type Placements = Map<string, PlacementCounts>;

async function placementsBy(db: Db, field: "senderId" | "senderDomain", where: Prisma.KlyWarmupMessageWhereInput): Promise<Placements> {
  const g = await db.klyWarmupMessage.groupBy({ by: [field, "placement"], where, _count: { _all: true } });
  const out: Placements = new Map();
  for (const r of g) {
    const k = String(r[field as keyof typeof r]);
    const c = out.get(k) ?? { inbox: 0, spam: 0, missing: 0 };
    if (r.placement === "inbox" || r.placement === "spam" || r.placement === "missing") c[r.placement] += r._count._all;
    out.set(k, c);
  }
  return out;
}

/** Warm-up gates for the cold sender (one groupBy): only rented mailboxes in warm-up while warm-up is switched on. */
export async function warmupGates(db: Db, s: WarmupSettings, boxes: readonly StoredMailbox[], now: Date): Promise<Map<string, WarmupGate>> {
  const inWarmup = boxes.filter((b) => s.warmupEnabled && b.provider !== "gmail" && b.row.warmupEnabled);
  if (!inWarmup.length) return new Map();
  const p = await placementsBy(db, "senderId", { senderId: { in: inWarmup.map((b) => b.id) }, sentAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } });
  return new Map(inWarmup.map((b) => {
    const c = p.get(b.id) ?? { inbox: 0, spam: 0, missing: 0 };
    return [b.id, { since: b.row.warmupSince, spamRate: spamPlacementRate(c.inbox, c.spam), coldStartedAt: b.row.coldStartedAt, minDays: s.warmupMinDays, maxSpamRate: s.warmupReadySpamPct / 100 }];
  }));
}

interface Outgoing {
  from: StoredMailbox;
  to: StoredMailbox;
  subject: string;
  text: string;
  threadId: string | null;
  parent: { id: string; messageId: string } | null;
  depth: number;
  maxDepth: number;
}

/** Send what is due: queued replies first, then new threads from the pairing plan. One createMany for the records. */
export async function warmupSendTick(d: WarmupDeps): Promise<{ sent: number; replies: number; failed: number }> {
  const { db, settings: s, now, rng } = d;
  const res = { sent: 0, replies: 0, failed: 0 };
  if (!s.warmupEnabled || !d.secret) return res;
  const senders = d.boxes.filter(isWarmupSender);
  if (!senders.length) return res;
  const receivers = [...senders, ...d.boxes.filter((b) => b.provider === "gmail" && b.row.warmupEnabled && s.warmupGmailCap > 0)];
  const byId = new Map(d.boxes.map((b) => [b.id, b]));
  const day = sendDayStart(now);
  const ids = receivers.map((b) => b.id);
  const [sentG, recvG, pairs] = await Promise.all([
    db.klyWarmupMessage.groupBy({ by: ["senderId"], where: { senderId: { in: ids }, sentAt: { gte: day } }, _count: { _all: true } }),
    db.klyWarmupMessage.groupBy({ by: ["recipientId"], where: { recipientId: { in: ids }, sentAt: { gte: day } }, _count: { _all: true } }),
    db.klyWarmupMessage.findMany({ where: { sentAt: { gte: day }, depth: 1 }, select: { senderId: true, recipientId: true } }),
  ]);
  const sentToday = new Map(sentG.map((g) => [g.senderId, g._count._all]));
  const recvToday = new Map(recvG.map((g) => [g.recipientId, g._count._all]));
  const target = dailyTarget(s.warmupPerDay);
  const quota = new Map(senders.map((b) => [b.id, Math.min(WARMUP_PER_MAILBOX_PER_TICK, dueByNow(target, now, tieRank(day.toISOString(), b.id) / 2 ** 32) - (sentToday.get(b.id) ?? 0))]));

  const out: Outgoing[] = [];
  // Replies the receivers decided on (engagement pass), oldest first, within each replier's quota.
  const pending = await db.klyWarmupMessage.findMany({ where: { recipientId: { in: senders.map((b) => b.id) }, replyWanted: true, repliedAt: null, seenAt: { not: null }, sentAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } }, orderBy: { sentAt: "asc" }, take: WARMUP_MAX_PER_TICK });
  for (const p of pending) {
    const from = byId.get(p.recipientId);
    const to = byId.get(p.senderId);
    if (!from || !to || (quota.get(from.id) ?? 0) <= 0 || out.length >= WARMUP_MAX_PER_TICK) continue;
    quota.set(from.id, (quota.get(from.id) ?? 0) - 1);
    out.push({ from, to, ...composeWarmupReply(rng, from.name, to.name, p.subject), threadId: p.threadId, parent: { id: p.id, messageId: p.messageId }, depth: p.depth + 1, maxDepth: p.maxDepth });
  }
  const used = new Set(pairs.map((p) => pairKey(p.senderId, p.recipientId)));
  const plan = planWarmupPairs(
    senders.map((b) => ({ id: b.id, domain: b.domain, want: quota.get(b.id) ?? 0 })),
    receivers.map((b) => ({ id: b.id, domain: b.domain, cap: receiveCap(b.provider, s), receivedToday: recvToday.get(b.id) ?? 0 })),
    used,
    day.toISOString(),
    WARMUP_MAX_PER_TICK - out.length,
  );
  for (const p of plan) {
    const from = byId.get(p.senderId);
    const to = byId.get(p.recipientId);
    if (!from || !to) continue;
    // Gmail receivers never answer, so their threads stay 1 deep.
    out.push({ from, to, ...composeWarmup(rng, from.name, to.name), threadId: null, parent: null, depth: 1, maxDepth: to.provider === "gmail" ? 1 : threadDepth(rng, s.warmupReplyPct) });
  }
  if (!out.length) return res;

  const rows: Prisma.KlyWarmupMessageCreateManyInput[] = [];
  const replied: string[] = [];
  const results = await mapPool(out, WARMUP_SEND_CONCURRENCY, async (o) => {
    const messageId = warmupMessageId(o.from.domain, d.secret);
    const headers: Record<string, string> = o.parent ? { "In-Reply-To": o.parent.messageId, References: [...new Set([o.threadId ?? o.parent.messageId, o.parent.messageId])].join(" ") } : {};
    await d.transport(o.from)({ from: `"${o.from.name}" <${o.from.address}>`, to: o.to.address, subject: o.subject, text: o.text, html: null, messageId, headers });
    rows.push({ messageId, threadId: o.threadId ?? messageId, depth: o.depth, maxDepth: o.maxDepth, senderId: o.from.id, recipientId: o.to.id, senderDomain: o.from.domain, recipientDomain: o.to.domain, subject: o.subject.slice(0, 200), sentAt: now });
    if (o.parent) replied.push(o.parent.id);
  });
  for (const r of results) if (r instanceof Error) res.failed++;
  if (rows.length) {
    await db.klyWarmupMessage.createMany({ data: rows, skipDuplicates: true });
    if (replied.length) await db.klyWarmupMessage.updateMany({ where: { id: { in: replied } }, data: { repliedAt: now } });
    const first = [...new Set(rows.map((r) => r.senderId))].filter((id) => !byId.get(id)?.row.warmupSince);
    if (first.length) await db.outboundMailbox.updateMany({ where: { id: { in: first }, warmupSince: null }, data: { warmupSince: now } });
  }
  res.replies = replied.length;
  res.sent = rows.length;
  if (res.failed) log("warn", "kly warm-up sends failed", { failed: res.failed, first: errMsg(results.find((r) => r instanceof Error)).slice(0, 200) });
  return res;
}

// --- IMAP engagement

/** The subset of ImapFlow the engagement pass uses (tests pass a fake). */
export interface ImapLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  list(): Promise<Array<{ path: string; specialUse?: string; flags?: Set<string> }>>;
  mailboxCreate(path: string): Promise<unknown>;
  getMailboxLock(path: string): Promise<{ release: () => void }>;
  search(q: { since: Date }, o: { uid: true }): Promise<number[] | false | undefined>;
  fetchAll(range: number[], q: { uid: true; envelope: true; flags: true }, o: { uid: true }): Promise<Array<{ uid: number; envelope?: { messageId?: string }; flags?: Set<string> }>>;
  messageFlagsAdd(range: number[], flags: string[], o: { uid: true }): Promise<boolean>;
  messageMove(range: number[], to: string, o: { uid: true }): Promise<unknown>;
}

export function openImap(m: MailboxEnv): ImapLike {
  return new ImapFlow({ host: m.imapHost, port: m.imapPort, secure: m.imapPort === 993, auth: { user: m.user, pass: m.appPassword }, logger: false, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 120_000 }) as unknown as ImapLike;
}

export interface EngageResult {
  inbox: number;
  spam: number;
  filed: number;
  replies: number;
}

/** One receiver's pass over INBOX + junk: only messages whose Message-ID is a Kly warm-up id AND a DB row for this receiver. */
export async function engageMailbox(db: Db, m: StoredMailbox, s: WarmupSettings, secret: string, now: Date, rng: Rng, open: (m: MailboxEnv) => ImapLike = openImap): Promise<EngageResult> {
  const r: EngageResult = { inbox: 0, spam: 0, filed: 0, replies: 0 };
  const client = open(m);
  await client.connect();
  try {
    const list = await client.list();
    const junk = junkFolder(list);
    if (!list.some((l) => l.path === WARMUP_FOLDER)) await client.mailboxCreate(WARMUP_FOLDER).catch(() => undefined);
    for (const [path, folder] of [["INBOX", "inbox"], ...(junk ? [[junk, "spam"]] : [])] as Array<[string, "inbox" | "spam"]>) {
      const lock = await client.getMailboxLock(path);
      try {
        const uids = (await client.search({ since: new Date(now.getTime() - ENGAGE_LOOKBACK_MS) }, { uid: true })) || [];
        if (!uids.length) continue;
        const msgs = (await client.fetchAll(uids, { uid: true, envelope: true, flags: true }, { uid: true })).filter((x) => isWarmupMessageId(x.envelope?.messageId, secret));
        if (!msgs.length) continue;
        const rows = await db.klyWarmupMessage.findMany({ where: { recipientId: m.id, messageId: { in: msgs.map((x) => normalizeMessageId(x.envelope?.messageId ?? "")) } } });
        const rowOf = new Map(rows.map((x) => [x.messageId, x]));
        const act = { read: [] as number[], star: [] as number[], file: [] as number[], rescue: [] as number[] };
        const upd = { inbox: [] as string[], spam: [] as string[], seen: [] as string[], star: [] as string[], file: [] as string[], rescue: [] as string[], reply: [] as string[] };
        for (const x of msgs) {
          const row = rowOf.get(normalizeMessageId(x.envelope?.messageId ?? ""));
          if (!row) continue;
          const p = engagementPlan({ folder, seen: Boolean(x.flags?.has("\\Seen")), flagged: Boolean(x.flags?.has("\\Flagged")), depth: row.depth, maxDepth: row.maxDepth, canReply: m.provider !== "gmail", alreadyEngaged: Boolean(row.seenAt) }, rng);
          if (p.placement) upd[p.placement].push(row.id);
          if (!row.seenAt) upd.seen.push(row.id);
          if (p.markRead) act.read.push(x.uid);
          if (p.star) (act.star.push(x.uid), upd.star.push(row.id));
          if (p.rescue) (act.rescue.push(x.uid), upd.rescue.push(row.id));
          if (p.file) (act.file.push(x.uid), upd.file.push(row.id));
          if (p.reply) upd.reply.push(row.id);
        }
        if (act.read.length) await client.messageFlagsAdd(act.read, ["\\Seen"], { uid: true });
        if (act.star.length) await client.messageFlagsAdd(act.star, ["\\Flagged"], { uid: true });
        if (act.rescue.length) await client.messageMove(act.rescue, "INBOX", { uid: true });
        if (act.file.length) await client.messageMove(act.file, WARMUP_FOLDER, { uid: true });
        // Batched writes; placement only on first sighting (a rescued mail found in INBOX later stays "spam").
        const w = (idsIn: string[], data: Prisma.KlyWarmupMessageUpdateManyMutationInput) => (idsIn.length ? db.klyWarmupMessage.updateMany({ where: { id: { in: idsIn } }, data }) : null);
        await Promise.all([w(upd.inbox, { placement: "inbox" }), w(upd.spam, { placement: "spam" }), w(upd.seen, { seenAt: now }), w(upd.star, { flaggedAt: now }), w(upd.rescue, { rescuedAt: now }), w(upd.file, { filedAt: now }), w(upd.reply, { replyWanted: true })]);
        r.inbox += upd.inbox.length;
        r.spam += upd.spam.length;
        r.filed += upd.file.length;
        r.replies += upd.reply.length;
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return r;
}

/** Staggered engagement (same 10-15 min per-address slots as the inbound poll, on its own warmupPolledAt stamp). */
export async function warmupEngageTick(d: WarmupDeps, open: (m: MailboxEnv) => ImapLike = openImap): Promise<Array<{ mailbox: string; error?: string } & Partial<EngageResult>>> {
  const { db, settings: s, now } = d;
  if (!s.warmupEnabled || !d.secret) return [];
  const boxes = d.boxes.filter((b) => isWarmupSender(b) || (b.provider === "gmail" && b.row.warmupEnabled && s.warmupGmailCap > 0));
  const due = duePolls(boxes.map((b) => ({ b, address: b.address, lastPolledAt: b.row.warmupPolledAt })), now, ENGAGE_PER_TICK);
  const res = await mapPool(due, ENGAGE_CONCURRENCY, ({ b }) => engageMailbox(db, b, s, d.secret, now, d.rng, open));
  if (due.length) await db.outboundMailbox.updateMany({ where: { id: { in: due.map((x) => x.b.id) } }, data: { warmupPolledAt: now } });
  return due.map((x, i) => {
    const r = res[i];
    return r instanceof Error ? { mailbox: x.address, error: r.message.slice(0, 200) } : { mailbox: x.address, ...r };
  });
}

/** Every ~30 min: stamp missing placements, prune old rows, auto-pause / resume cold sending on the 7-day spam rate. */
export async function warmupHealthTick(d: Pick<WarmupDeps, "db" | "settings" | "boxes" | "now" | "rt">): Promise<string[]> {
  const { db, settings: s, now } = d;
  if (Date.now() - d.rt.lastHealthAt < WARMUP_HEALTH_EVERY_MS) return [];
  d.rt.lastHealthAt = Date.now();
  await db.klyWarmupMessage.updateMany({ where: { placement: null, sentAt: { lt: new Date(now.getTime() - MISSING_AFTER_MS) } }, data: { placement: "missing" } });
  await db.klyWarmupMessage.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - WARMUP_RETENTION_MS) } } });
  const inWarmup = d.boxes.filter((b) => b.provider !== "gmail" && b.row.warmupEnabled);
  if (!inWarmup.length) return [];
  const p = await placementsBy(db, "senderId", { senderId: { in: inWarmup.map((b) => b.id) }, sentAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } });
  const out: string[] = [];
  for (const b of inWarmup) {
    const c = p.get(b.id) ?? { inbox: 0, spam: 0, missing: 0 };
    const forWarmup = Boolean(b.row.paused && b.row.pausedReason?.startsWith(WARMUP_PAUSE_PREFIX));
    const v = warmupVerdict(c, s, forWarmup);
    const pct = `${(((spamPlacementRate(c.inbox, c.spam) ?? 0) * 100)).toFixed(0)}%`;
    if (v === "pause" && !b.row.paused) {
      const reason = `${WARMUP_PAUSE_PREFIX} ${pct} over 7 days`;
      await db.outboundMailbox.update({ where: { id: b.id }, data: { paused: true, pausedReason: reason } });
      await db.klyDecision.create({ data: { kind: "pause", summary: `Paused cold sending from ${b.address}: ${pct} of its warm-up emails landed in spam over the last 7 days (limit ${s.warmupPauseSpamPct}%, ${c.inbox + c.spam} placements). Warm-up keeps running so it can recover.`, data: { mailbox: b.address, ...c } } });
      b.row.paused = true;
      b.row.pausedReason = reason;
      out.push(`${b.address}: paused (${pct} spam)`);
    } else if (v === "resume") {
      await db.outboundMailbox.update({ where: { id: b.id }, data: { paused: false, pausedReason: null } });
      await db.klyDecision.create({ data: { kind: "resume", summary: `Resumed cold sending from ${b.address}: warm-up spam placement is back to ${pct} (under ${s.warmupReadySpamPct}%).`, data: { mailbox: b.address, ...c } } });
      b.row.paused = false;
      b.row.pausedReason = null;
      out.push(`${b.address}: resumed (${pct} spam)`);
    }
  }
  return out;
}

/** The loop's warm-up step: health, sends, then the staggered IMAP engagement. */
export async function warmupTick(d: WarmupDeps): Promise<{ sent: number; replies: number; failed: number; engaged: number; changed: string[] }> {
  if (!d.settings.warmupEnabled) return { sent: 0, replies: 0, failed: 0, engaged: 0, changed: [] };
  if (!d.secret) {
    log("warn", "kly warm-up off: no KLY_WARMUP_SECRET / ADS_TOKEN_KEY");
    return { sent: 0, replies: 0, failed: 0, engaged: 0, changed: [] };
  }
  const changed = await warmupHealthTick(d);
  const s = await warmupSendTick(d);
  const e = await warmupEngageTick(d);
  const bad = e.filter((x) => x.error);
  if (bad.length) log("warn", "kly warm-up imap errors", { failed: bad.length, sample: bad.slice(0, 3) });
  return { ...s, engaged: e.length, changed };
}

