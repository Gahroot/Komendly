// Cold-email spam check ("seed probe"): about 1 in PROBE_EVERY real cold emails from a rented (Maildoso) mailbox is
// also sent, byte-for-byte the same, to one of our own inboxes - our Google Workspace boxes first (they tell us what
// Gmail does with our real cold copy), else a peer mailbox on another domain. The copy carries a warm-up tagged
// Message-ID, so Kly's reply reader ignores it and the warm-up engagement pass records inbox vs spam
// (KlyWarmupMessage kind "probe", never replied to). Placement by format shows if HTML or the wording trips filters.
import type { Prisma } from "@prisma/client";
import type { Db } from "./db";
import type { StoredMailbox } from "./mailboxes";
import { sendDayStart } from "../../src/lib/ads/outbound/policy";
import { warmupMessageId } from "./warmup";

export const PROBE_EVERY = 10;
export const PROBE_GMAIL_PER_DAY = 12;

export interface ProbeMail {
  subject: string;
  text: string;
  html: string | null;
  headers: Record<string, string>;
}
export type SendFn = (m: StoredMailbox) => (msg: { from: string; to: string; subject: string; text: string; html: string | null; messageId: string; headers: Record<string, string> }) => Promise<unknown>;

/** Pick the seed inbox for a probe from `from`: a Gmail box under today's cap, else a peer on another domain. */
export function pickSeed(from: StoredMailbox, boxes: readonly StoredMailbox[], gmailProbesToday: number, rnd: number): StoredMailbox | null {
  const gmail = boxes.filter((b) => b.provider === "gmail" && b.row.warmupEnabled);
  if (gmail.length && gmailProbesToday < PROBE_GMAIL_PER_DAY) return gmail[Math.floor(rnd * gmail.length) % gmail.length] ?? null;
  const peers = boxes.filter((b) => b.provider !== "gmail" && b.domain !== from.domain && b.id !== from.id);
  return peers.length ? (peers[Math.floor(rnd * peers.length) % peers.length] ?? null) : null;
}

export async function maybeProbe(db: Db, o: { from: StoredMailbox; boxes: readonly StoredMailbox[]; mail: ProbeMail; format: string; secret: string; send: SendFn; rng: () => number; now: Date }): Promise<string | null> {
  if (!o.secret || o.from.provider === "gmail" || o.rng() * PROBE_EVERY >= 1) return null;
  const gmailIds = o.boxes.filter((b) => b.provider === "gmail").map((b) => b.id);
  const gmailToday = gmailIds.length ? await db.klyWarmupMessage.count({ where: { kind: "probe", recipientId: { in: gmailIds }, sentAt: { gte: sendDayStart(o.now) } } }) : 0;
  const to = pickSeed(o.from, o.boxes, gmailToday, o.rng());
  if (!to) return null;
  const messageId = warmupMessageId(o.from.domain, o.secret);
  await o.send(o.from)({ from: `"${o.from.name}" <${o.from.address}>`, to: to.address, subject: o.mail.subject, text: o.mail.text, html: o.mail.html, messageId, headers: o.mail.headers });
  const row: Prisma.KlyWarmupMessageCreateManyInput = { messageId, threadId: messageId, depth: 1, maxDepth: 1, senderId: o.from.id, recipientId: to.id, senderDomain: o.from.domain, recipientDomain: to.domain, subject: o.mail.subject.slice(0, 200), sentAt: o.now, kind: "probe", format: o.format };
  await db.klyWarmupMessage.createMany({ data: [row], skipDuplicates: true });
  return to.address;
}
