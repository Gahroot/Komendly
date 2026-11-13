// IMAP poll of each outbound mailbox (~5 min): DSN bounces -> suppress + mark bounced; ARF complaints -> suppress +
// mark complained; human replies -> replies.ts (intent, auto-answer or founder alert, suppression). Only messages after the stored UID are read; nothing is deleted or moved.
import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { mapPool } from "./mailboxes";
import { classifyInbound, type InboundClass } from "../../src/lib/ads/outbound/inbound";
import type { MailboxEnv } from "../../src/lib/ads/outbound/policy";
import { handleReply, suppress, type ReplyDeps } from "./replies";
import { bumpDaily } from "./settings";
import type { Db } from "./db";
import { isWarmupMessageId, warmupSecretOf } from "./warmup";

export type { AlertFn } from "./replies";

export interface InboundDeps extends Omit<ReplyDeps, "mailbox"> {
  now?: () => Date;
  /** Peer warm-up Message-ID secret (warmup.ts); default from env. Warm-up mail is never treated as a reply. */
  warmupSecret?: string;
}

export function messageIdOf(raw: string): string | null {
  const head = raw.slice(0, Math.max(0, raw.search(/\r?\n\r?\n/)) || raw.length);
  return head.match(/^Message-ID:\s*(<[^>\s]+>)/im)?.[1] ?? null;
}

/** Apply one classified inbound message. Returns what it did (for logs/tests). */
export async function applyInbound(d: InboundDeps, mailbox: MailboxEnv | null, mailboxId: string, c: InboundClass, inboundMessageId: string | null = null): Promise<string> {
  const { db } = d;
  const now = d.now?.() ?? new Date();
  if (c.kind === "other" || c.kind === "auto_reply") return c.kind;
  const send = c.refs.length ? await db.outboundSend.findFirst({ where: { messageId: { in: c.refs } }, include: { lead: true } }) : null;
  const leadEmail = c.kind === "bounce" ? c.failedRecipient : c.fromAddress;
  const lead = send?.lead ?? (leadEmail ? await db.outboundLead.findFirst({ where: { email: leadEmail } }) : null);
  if (!lead) return `${c.kind}: no matching lead`;
  const sendId = send?.id ?? (await db.outboundSend.findFirst({ where: { leadId: lead.id, kind: "sequence" }, orderBy: { sentAt: "desc" }, select: { id: true } }))?.id;
  if (c.kind === "bounce") {
    await suppress(db, lead.email, "email", "bounce");
    if (sendId) await db.outboundSend.update({ where: { id: sendId }, data: { bounced: true } });
    await db.outboundLead.update({ where: { id: lead.id }, data: { status: "bounced" } });
    await db.outboundMailbox.update({ where: { id: mailboxId }, data: { bouncedTotal: { increment: 1 } } });
    await bumpDaily(db, now, { bounces: 1 });
    return "bounce";
  }
  if (c.kind === "complaint") {
    await suppress(db, lead.domain, "domain", "complaint");
    if (sendId) await db.outboundSend.update({ where: { id: sendId }, data: { complained: true } });
    await db.outboundLead.update({ where: { id: lead.id }, data: { status: "complained" } });
    await db.outboundMailbox.update({ where: { id: mailboxId }, data: { complainedTotal: { increment: 1 } } });
    await bumpDaily(db, now, { complaints: 1 });
    return "complaint";
  }
  return handleReply({ ...d, mailbox }, { lead, sendId, mailboxId, c, inboundMessageId });
}

/** Poll one mailbox for new messages since imapLastUid. */
export async function pollMailbox(d: InboundDeps, m: MailboxEnv): Promise<{ seen: number; actions: string[] }> {
  const { db } = d;
  const row = await db.outboundMailbox.findUnique({ where: { address: m.address } });
  if (!row) return { seen: 0, actions: [] };
  const client = new ImapFlow({ host: m.imapHost, port: m.imapPort, secure: m.imapPort === 993, auth: { user: m.user, pass: m.appPassword }, logger: false, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 120_000 });
  const actions: string[] = [];
  let maxUid = row.imapLastUid;
  let seen = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // First run: start from now (don't process the whole history).
      if (row.imapLastUid === 0) {
        const status = await client.status("INBOX", { uidNext: true });
        maxUid = status ? Math.max(0, (status.uidNext ?? 1) - 1) : 0;
      } else {
        for await (const msg of client.fetch(`${row.imapLastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
          if (msg.uid <= row.imapLastUid) continue;
          maxUid = Math.max(maxUid, msg.uid);
          seen++;
          const raw = msg.source?.toString("utf8") ?? "";
          if (isWarmupMessageId(messageIdOf(raw), d.warmupSecret ?? warmupSecretOf())) {
            actions.push("warmup");
            continue;
          }
          actions.push(await applyInbound(d, m, row.id, classifyInbound(raw.slice(0, 200_000)), messageIdOf(raw)));
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  await db.outboundMailbox.update({ where: { id: row.id }, data: { imapLastUid: maxUid, lastPolledAt: new Date() } });
  return { seen, actions };
}

// ---------------------------------------------------------------------------
// Staggered polling for hundreds of mailboxes

export const IMAP_BASE_MS = 10 * 60_000;
export const IMAP_JITTER_MS = 5 * 60_000;
export const IMAP_PER_TICK = 30;
export const IMAP_CONCURRENCY = 6;

/** Each mailbox's own poll interval: 10-15 min, fixed per address, so polls spread out instead of firing together. */
export function pollIntervalMs(address: string): number {
  return IMAP_BASE_MS + (createHash("sha256").update(address).digest().readUInt32BE(0) / 2 ** 32) * IMAP_JITTER_MS;
}

/** Mailboxes due for a poll, most overdue first, at most `max`. Never polled = due now. */
export function duePolls<T extends { address: string; lastPolledAt: Date | null }>(boxes: readonly T[], now: Date, max = IMAP_PER_TICK): T[] {
  return boxes
    .map((b) => ({ b, due: (b.lastPolledAt?.getTime() ?? 0) + pollIntervalMs(b.address) }))
    .filter((x) => x.due <= now.getTime())
    .sort((a, z) => a.due - z.due || a.b.address.localeCompare(z.b.address))
    .slice(0, max)
    .map((x) => x.b);
}

/** Poll the due mailboxes with a concurrency pool; a failing mailbox is stamped too so it waits its interval before a retry. */
export async function pollDue(d: InboundDeps, boxes: ReadonlyArray<MailboxEnv & { id: string; row: { lastPolledAt: Date | null } }>, now: Date): Promise<Array<{ mailbox: string; seen: number; error?: string }>> {
  const due = duePolls(boxes.map((b) => ({ ...b, lastPolledAt: b.row.lastPolledAt })), now);
  const res = await mapPool(due, IMAP_CONCURRENCY, (m) => pollMailbox(d, m));
  const out: Array<{ mailbox: string; seen: number; error?: string }> = [];
  for (let i = 0; i < due.length; i++) {
    const m = due[i] as (typeof due)[number];
    const r = res[i];
    if (r instanceof Error) {
      await d.db.outboundMailbox.update({ where: { id: m.id }, data: { lastPolledAt: now } }).catch(() => undefined);
      out.push({ mailbox: m.address, seen: 0, error: r.message.slice(0, 200) });
    } else if (r) out.push({ mailbox: m.address, seen: r.seen });
  }
  return out;
}
