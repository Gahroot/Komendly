// Outbound sender: paced, warmed-up, plain-text cold email through the owner's Google Workspace mailboxes (SMTP),
// never Resend. Off unless OUTBOUND_ENABLED=1 AND AdsFeatureFlag "outbound" is on (the admin kill switch).
// OUTBOUND_DRY_RUN=1 writes each would-be email to OUTBOUND_DRY_RUN_DIR instead of sending and changes no lead.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { z } from "zod";
import { buildOutboundEmail, checkOutboundEmail, OPENER_SYSTEM, openerPrompt, unsubscribeHeaders, type OutboundCopyContext } from "../../../src/lib/ads/outbound/copy";
import { autoPauseReason, canSendNow, DEFAULT_DAILY_CAP, HEALTH_WINDOW, inBusinessHours, nextStep, parseMailboxes, sendGapMs, type MailboxEnv } from "../../../src/lib/ads/outbound/policy";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { structured } from "../providers/structured";
import type { AIProvider } from "../providers/types";
import { adImageUrl } from "./hook";

export const OUTBOUND_FLAG = "outbound";
export const DEFAULT_SENDER_NAME = "Nolan Grout";

export interface OutboundEnv {
  enabled: boolean;
  dryRun: boolean;
  dryRunDir: string;
  postalAddress: string;
  base: string;
  senderName: string;
  mailboxes: MailboxEnv[];
  mailboxError: string | null;
}

export function outboundEnv(env: NodeJS.ProcessEnv = process.env): OutboundEnv {
  const mb = parseMailboxes(env.OUTBOUND_MAILBOXES);
  return {
    enabled: env.OUTBOUND_ENABLED === "1",
    dryRun: env.OUTBOUND_DRY_RUN === "1",
    dryRunDir: env.OUTBOUND_DRY_RUN_DIR || path.resolve("outbound-dry-run"),
    postalAddress: (env.OUTBOUND_POSTAL_ADDRESS ?? "").trim(),
    base: (env.OUTBOUND_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, ""),
    senderName: env.OUTBOUND_FROM?.trim() || DEFAULT_SENDER_NAME,
    mailboxes: mb.ok ? mb.mailboxes : [],
    mailboxError: mb.ok ? null : mb.error,
  };
}

/** Upsert OutboundMailbox state rows for the env mailboxes (password stays in env). */
export async function syncMailboxes(db: Db, mailboxes: MailboxEnv[]): Promise<void> {
  for (const m of mailboxes) {
    await db.outboundMailbox.upsert({
      where: { address: m.address },
      create: { address: m.address, displayName: m.name, smtpHost: m.smtpHost, smtpPort: m.smtpPort, smtpUser: m.user, imapHost: m.imapHost, imapPort: m.imapPort, dailyCap: m.dailyCap ?? DEFAULT_DAILY_CAP },
      update: { displayName: m.name, smtpHost: m.smtpHost, smtpPort: m.smtpPort, smtpUser: m.user, imapHost: m.imapHost, imapPort: m.imapPort, ...(m.dailyCap ? { dailyCap: m.dailyCap } : {}) },
    });
  }
}

/** Deterministic [0,1) from a string (the gap after a send comes from its id, so no state is kept in memory). */
export function fraction(seed: string): number {
  return createHash("sha256").update(seed).digest().readUInt32BE(0) / 2 ** 32;
}

function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const OpenerSchema = z.object({ opener: z.string().min(10).max(200) });

export async function writeOpener(provider: AIProvider | null, lead: { businessName: string; city: string; niche: string }, siteSummary: string, signal?: AbortSignal): Promise<{ opener: string | null; source: "ai" | "fallback" }> {
  if (!provider) return { opener: null, source: "fallback" };
  try {
    const out = await structured(provider, OpenerSchema, { system: OPENER_SYSTEM, prompt: openerPrompt({ ...lead, siteSummary }), reasoning: "low", signal }, []);
    return { opener: out.opener, source: "ai" };
  } catch (e) {
    log("warn", "outbound opener failed", { error: errMsg(e) });
    return { opener: null, source: "fallback" };
  }
}

type LeadRow = NonNullable<Awaited<ReturnType<Db["outboundLead"]["findFirst"]>>>;

/** Compose one email (opener by AI, validated; template + compliance gate). */
export async function composeFor(db: Db, provider: AIProvider | null, cfg: OutboundEnv, lead: LeadRow, step: 1 | 2, senderName: string): Promise<{ ctx: OutboundCopyContext; subject: string; text: string; source: "ai" | "fallback"; error: string | null }> {
  const img = (await adImageUrl(db, cfg.base, lead)) ?? "";
  let summary = "";
  if (lead.giftId) {
    const gift = await db.adsGift.findUnique({ where: { id: lead.giftId }, select: { runId: true } });
    const run = gift?.runId ? await db.adRun.findUnique({ where: { id: gift.runId }, select: { extraction: true } }) : null;
    const ex = (run?.extraction ?? {}) as { mainOffer?: unknown; audience?: unknown };
    summary = [ex.mainOffer, ex.audience].filter((v): v is string => typeof v === "string").join(" ");
  }
  const op = step === 1 ? await writeOpener(provider, lead, summary) : { opener: null, source: "fallback" as const };
  const ctx: OutboundCopyContext = {
    step,
    businessName: lead.businessName,
    city: lead.city,
    niche: lead.niche,
    senderName,
    adImageUrl: img,
    claimUrl: `${cfg.base}/api/outbound/c/${lead.claimToken}`,
    unsubscribeUrl: `${cfg.base}/api/outbound/unsubscribe?t=${lead.unsubToken}`,
    postalAddress: cfg.postalAddress,
    opener: op.opener,
  };
  let mail = buildOutboundEmail(ctx);
  let source = op.source;
  let error = checkOutboundEmail(mail, ctx);
  if (error && ctx.opener) {
    mail = buildOutboundEmail({ ...ctx, opener: null });
    source = "fallback";
    error = checkOutboundEmail(mail, ctx);
  }
  if (!img && step === 1) error = "no hosted ad image";
  return { ctx, subject: mail.subject, text: mail.text, source, error };
}

/** Dry run: every ad_made lead -> one .txt with headers + body. No DB writes, no SMTP. */
export async function writeDryRun(db: Db, provider: AIProvider | null, cfg: OutboundEnv, opts: { leadIds?: string[] } = {}): Promise<string[]> {
  await mkdir(cfg.dryRunDir, { recursive: true });
  const leads = await db.outboundLead.findMany({ where: { status: "ad_made", ...(opts.leadIds ? { id: { in: opts.leadIds } } : {}) }, orderBy: { createdAt: "asc" } });
  const mbox = cfg.mailboxes[0];
  const from = mbox ? `"${mbox.name}" <${mbox.address}>` : `"${cfg.senderName}" <nolan@getkomendly.com>`;
  const files: string[] = [];
  for (const lead of leads) {
    const c = await composeFor(db, provider, { ...cfg, postalAddress: cfg.postalAddress || "[OUTBOUND_POSTAL_ADDRESS]" }, lead, 1, mbox?.name ?? cfg.senderName);
    const refuse = !cfg.postalAddress ? "WOULD REFUSE TO SEND: OUTBOUND_POSTAL_ADDRESS is not set." : c.error ? `WOULD REFUSE TO SEND: ${c.error}` : "would send";
    const headers = unsubscribeHeaders(c.ctx.unsubscribeUrl, mbox?.address ?? "nolan@getkomendly.com");
    const file = path.join(cfg.dryRunDir, `${lead.domain.replace(/[^a-z0-9.-]/gi, "_")}.txt`);
    const doc = [
      `# DRY RUN (${refuse}); copy: ${c.source}`,
      `# Lead: ${lead.businessName} | ${lead.website} | ${lead.city}${lead.region ? `, ${lead.region}` : ""} | tz ${lead.timezone}`,
      `# Email found on: ${lead.emailFoundOn}`,
      `# Claim page: ${cfg.base}/gift/${lead.giftToken ?? "?"} (via ${c.ctx.claimUrl})`,
      `From: ${from}`,
      `To: ${lead.email}`,
      `Subject: ${c.subject}`,
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      "",
      c.text,
      "",
      "# Follow-up (step 2, only if no reply/click after 4 days):",
      buildOutboundEmail({ ...c.ctx, step: 2, opener: null }).text,
      "",
    ].join("\n");
    await writeFile(file, doc);
    files.push(file);
  }
  return files;
}

export type Transport = (m: { from: string; to: string; subject: string; text: string; messageId: string; headers: Record<string, string> }) => Promise<void>;

export function smtpTransport(m: MailboxEnv): Transport {
  const t = nodemailer.createTransport({ host: m.smtpHost, port: m.smtpPort, secure: m.smtpPort === 465, auth: { user: m.user, pass: m.appPassword } });
  return async (mail) => {
    await t.sendMail({ from: mail.from, to: mail.to, subject: mail.subject, text: mail.text, messageId: mail.messageId, headers: mail.headers });
  };
}

export interface SenderDeps {
  db: Db;
  provider: AIProvider | null;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  transport?: (m: MailboxEnv) => Transport;
}

/** One sender tick: at most one email per mailbox. Returns what happened per mailbox. */
export async function senderTick(deps: SenderDeps): Promise<Array<{ mailbox: string; result: string }>> {
  const cfg = outboundEnv(deps.env);
  const now = deps.now?.() ?? new Date();
  if (!cfg.enabled || cfg.dryRun) return [];
  const flag = await deps.db.adsFeatureFlag.findUnique({ where: { key: OUTBOUND_FLAG } });
  if (!flag?.enabled) return [];
  if (!cfg.postalAddress) {
    log("warn", "outbound: OUTBOUND_POSTAL_ADDRESS unset, refusing to send");
    return [];
  }
  if (cfg.mailboxError) log("warn", "outbound mailboxes", { error: cfg.mailboxError });
  await syncMailboxes(deps.db, cfg.mailboxes);
  const out: Array<{ mailbox: string; result: string }> = [];
  for (const m of cfg.mailboxes) {
    const row = await deps.db.outboundMailbox.findUnique({ where: { address: m.address } });
    if (!row) continue;
    const recent = await deps.db.outboundSend.findMany({ where: { mailboxId: row.id, dryRun: false }, orderBy: { sentAt: "desc" }, take: HEALTH_WINDOW, select: { id: true, bounced: true, complained: true } });
    const pause = row.paused ? null : autoPauseReason(recent);
    if (pause) {
      await deps.db.outboundMailbox.update({ where: { id: row.id }, data: { paused: true, pausedReason: `auto: ${pause}` } });
      log("warn", "outbound mailbox auto-paused", { mailbox: m.address, reason: pause });
      out.push({ mailbox: m.address, result: `auto-paused: ${pause}` });
      continue;
    }
    const sentToday = await deps.db.outboundSend.count({ where: { mailboxId: row.id, dryRun: false, sentAt: { gte: dayStart(now) } } });
    const last = recent[0];
    const pace = canSendNow({ paused: row.paused, dailyCap: row.dailyCap, warmupStartedAt: row.warmupStartedAt, lastSentAt: row.lastSentAt, sentToday, gapMs: last ? sendGapMs(fraction(last.id)) : 0 }, now);
    if (!pace.ok) { out.push({ mailbox: m.address, result: pace.reason }); continue; }
    const lead = await pickLead(deps.db, row.id, now);
    if (!lead) { out.push({ mailbox: m.address, result: "no lead due" }); continue; }
    out.push({ mailbox: m.address, result: await sendOne(deps, cfg, m, row.id, lead.lead, lead.step, now) });
  }
  return out;
}

async function pickLead(db: Db, mailboxId: string, now: Date): Promise<{ lead: LeadRow; step: 1 | 2 } | null> {
  const candidates = await db.outboundLead.findMany({
    where: { OR: [{ status: { in: ["ad_made", "queued"] }, step: 0 }, { status: "sent", step: 1, mailboxId }], AND: [{ OR: [{ mailboxId: null }, { mailboxId }] }] },
    orderBy: [{ step: "desc" }, { createdAt: "asc" }],
    take: 200,
  });
  const sup = new Set((await db.outboundSuppression.findMany({ select: { value: true } })).map((s) => s.value));
  for (const l of candidates) {
    const step = nextStep(l, now);
    if (!step || !inBusinessHours(now, l.timezone)) continue;
    if (sup.has(l.email.toLowerCase()) || sup.has(l.domain)) {
      await db.outboundLead.update({ where: { id: l.id }, data: { status: "unsubscribed" } });
      continue;
    }
    return { lead: l, step };
  }
  return null;
}

async function sendOne(deps: SenderDeps, cfg: OutboundEnv, m: MailboxEnv, mailboxId: string, lead: LeadRow, step: 1 | 2, now: Date): Promise<string> {
  const { db } = deps;
  // Claim the lead for this mailbox (sticky: the follow-up comes from the same person).
  const claimed = await db.outboundLead.updateMany({ where: { id: lead.id, step: lead.step, OR: [{ mailboxId: null }, { mailboxId }] }, data: { mailboxId, status: step === 1 ? "queued" : lead.status } });
  if (claimed.count !== 1) return "lead taken";
  const c = await composeFor(db, deps.provider, cfg, lead, step, m.name);
  if (c.error) {
    await db.outboundLead.update({ where: { id: lead.id }, data: { error: `copy: ${c.error}` } });
    return `refused: ${c.error}`;
  }
  const messageId = `<${randomUUID()}@${m.address.split("@")[1] ?? "getkomendly.com"}>`;
  const prev = step === 2 ? await db.outboundSend.findFirst({ where: { leadId: lead.id, step: 1 }, select: { messageId: true } }) : null;
  const headers = { ...unsubscribeHeaders(c.ctx.unsubscribeUrl, m.address), ...(prev ? { "In-Reply-To": prev.messageId, References: prev.messageId } : {}) };
  try {
    await (deps.transport ?? smtpTransport)(m)({ from: `"${m.name}" <${m.address}>`, to: lead.email, subject: c.subject, text: c.text, messageId, headers });
  } catch (e) {
    await db.outboundLead.update({ where: { id: lead.id }, data: { error: `smtp: ${errMsg(e).slice(0, 300)}` } });
    return `smtp error: ${errMsg(e)}`;
  }
  await db.$transaction([
    db.outboundSend.create({ data: { leadId: lead.id, mailboxId, step, messageId, toEmail: lead.email, subject: c.subject, body: c.text, copySource: c.source, sentAt: now } }),
    db.outboundLead.update({ where: { id: lead.id }, data: { step, status: lead.status === "clicked" ? "clicked" : "sent", lastSentAt: now, error: null } }),
    db.outboundMailbox.update({ where: { id: mailboxId }, data: { lastSentAt: now, sentTotal: { increment: 1 } } }),
  ]);
  return `sent step ${step} to ${lead.domain}`;
}
