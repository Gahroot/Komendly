// IMAP poll of each outbound mailbox (~5 min): DSN bounces -> suppress + mark bounced; ARF complaints -> suppress +
// mark complained; replies -> lead replied (sequence stops) + founder alert via our normal mailer; "stop/unsubscribe"
// replies -> suppress. Only messages after the stored UID are read; nothing is deleted or moved.
import { ImapFlow } from "imapflow";
import { classifyInbound, type InboundClass } from "../../../src/lib/ads/outbound/inbound";
import { emailDomain, type MailboxEnv } from "../../../src/lib/ads/outbound/policy";
import type { Db } from "../db";
import { errMsg, log } from "../log";

export type AlertFn = (subject: string, text: string) => Promise<void>;

export async function suppress(db: Db, value: string, kind: "email" | "domain", reason: string): Promise<void> {
  const v = value.trim().toLowerCase();
  if (!v) return;
  await db.outboundSuppression.upsert({ where: { value: v }, create: { value: v, kind, reason }, update: {} });
}

/** Apply one classified inbound message. Returns what it did (for logs/tests). */
export async function applyInbound(db: Db, mailboxId: string, c: InboundClass, alert: AlertFn): Promise<string> {
  if (c.kind === "other" || c.kind === "auto_reply") return c.kind;
  const send = c.refs.length ? await db.outboundSend.findFirst({ where: { messageId: { in: c.refs } }, include: { lead: true } }) : null;
  const leadEmail = c.kind === "bounce" ? c.failedRecipient : c.fromAddress;
  const lead = send?.lead ?? (leadEmail ? await db.outboundLead.findFirst({ where: { email: leadEmail } }) : null);
  if (!lead) return `${c.kind}: no matching lead`;
  const sendId = send?.id ?? (await db.outboundSend.findFirst({ where: { leadId: lead.id }, orderBy: { sentAt: "desc" }, select: { id: true } }))?.id;
  if (c.kind === "bounce") {
    await suppress(db, lead.email, "email", "bounce");
    if (sendId) await db.outboundSend.update({ where: { id: sendId }, data: { bounced: true } });
    await db.outboundLead.update({ where: { id: lead.id }, data: { status: "bounced" } });
    await db.outboundMailbox.update({ where: { id: mailboxId }, data: { bouncedTotal: { increment: 1 } } });
    return "bounce";
  }
  if (c.kind === "complaint") {
    await suppress(db, lead.domain, "domain", "complaint");
    if (sendId) await db.outboundSend.update({ where: { id: sendId }, data: { complained: true } });
    await db.outboundLead.update({ where: { id: lead.id }, data: { status: "complained" } });
    await db.outboundMailbox.update({ where: { id: mailboxId }, data: { complainedTotal: { increment: 1 } } });
    return "complaint";
  }
  // Reply (or stop-reply): the sequence ends either way.
  const now = new Date();
  if (sendId) await db.outboundSend.update({ where: { id: sendId }, data: { replied: true, replySnippet: c.snippet.slice(0, 500) } });
  await db.outboundMailbox.update({ where: { id: mailboxId }, data: { repliedTotal: { increment: 1 } } });
  if (c.kind === "unsubscribe") {
    await suppress(db, lead.email, "email", "reply_stop");
    if (c.fromAddress && emailDomain(c.fromAddress) === lead.domain) await suppress(db, lead.domain, "domain", "reply_stop");
    await db.outboundLead.update({ where: { id: lead.id }, data: { status: "unsubscribed", repliedAt: now } });
    return "unsubscribe";
  }
  await db.outboundLead.update({ where: { id: lead.id }, data: { status: "replied", repliedAt: now } });
  await alert(
    `[Komendly outbound] Reply from ${lead.businessName}`.slice(0, 120),
    [`${lead.businessName} (${lead.website}) replied to the cold email.`, "", `From: ${c.fromAddress ?? lead.email}`, `Subject: ${c.subject}`, "", c.snippet || "(no text)", "", "Answer them from the outbound mailbox (Gmail). Their sequence is stopped."].join("\n"),
  ).catch((e: unknown) => log("warn", "outbound reply alert failed", { error: errMsg(e) }));
  return "reply";
}

/** Poll one mailbox for new messages since imapLastUid. */
export async function pollMailbox(db: Db, m: MailboxEnv, alert: AlertFn): Promise<{ seen: number; actions: string[] }> {
  const row = await db.outboundMailbox.findUnique({ where: { address: m.address } });
  if (!row) return { seen: 0, actions: [] };
  const client = new ImapFlow({ host: m.imapHost, port: m.imapPort, secure: true, auth: { user: m.user, pass: m.appPassword }, logger: false });
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
          actions.push(await applyInbound(db, row.id, classifyInbound(raw.slice(0, 200_000)), alert));
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
