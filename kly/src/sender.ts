// Kly sender: paced, warmed-up, plain-text cold email through the owner's Google Workspace mailboxes (SMTP),
// never Resend. Sends only with OUTBOUND_ENABLED=1 and the kill switch on (checked by the loop) and mailboxes set.
// Dry run (OUTBOUND_DRY_RUN=1 or the dry-run script) writes each would-be email to a folder and changes no lead.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { z } from "zod";
import { buildOutboundEmail, buildOutboundHtml, checkOutboundEmail, claimLink, DEFAULT_POSTAL_ADDRESS, emailImageUrl, unsubscribeHeaders, unsubscribeLink, type CopyVariant, type EmailFormat, type OutboundCopyContext } from "../../src/lib/ads/outbound/copy";
import { autoPauseReason, autoResumeDue, canSendNow, sendDayStart, DEFAULT_DOMAIN_DAILY_CAP, HEALTH_WINDOW, inBusinessHours, mailboxDayLimit, nextStep, parseMailboxes, sendGapMs, WARMUP_PAUSE_PREFIX, type MailboxEnv } from "../../src/lib/ads/outbound/policy";
import { loadMailboxes, mapPool, planRotation, syncEnvMailboxes, type RotationCandidate, type StoredMailbox } from "./mailboxes";
import { ask, type AIProvider } from "./ai";
import { chooseArm, type Dimension, type Rng } from "./arms";
import { audienceOf } from "./targets";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import { adImageUrl, extendAssets, ON_CLICK_NOTE } from "./hook";
import { addCost, type KlySettingsRow } from "./settings";
import { warmupGates, type WarmupSettings } from "./warmup";

/** Voice call outcomes that end the cold email sequence (no follow-up after the phone call settled it). */
export const VOICE_STOP_STATUSES = ["gift_yes", "info_requested", "not_interested", "opt_out"] as const;

export const DEFAULT_SENDER_NAME = "Ozzy at Komendly";
export const COPY_DIMENSIONS: Dimension[] = ["subject", "body", "followup", "format"];

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
    dryRunDir: env.OUTBOUND_DRY_RUN_DIR || path.resolve("kly-dry-run"),
    postalAddress: (env.OUTBOUND_POSTAL_ADDRESS ?? "").trim() || DEFAULT_POSTAL_ADDRESS,
    base: (env.OUTBOUND_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, ""),
    senderName: env.OUTBOUND_FROM?.trim() || DEFAULT_SENDER_NAME,
    mailboxes: mb.ok ? mb.mailboxes : [],
    mailboxError: mb.ok ? null : mb.error,
  };
}

/** Upsert OutboundMailbox state rows for the env mailboxes (password stays in env). */
export const syncMailboxes = syncEnvMailboxes;

/** Deterministic [0,1) from a string (the gap after a send comes from its id, so no state is kept in memory). */
export function fraction(seed: string): number {
  return createHash("sha256").update(seed).digest().readUInt32BE(0) / 2 ** 32;
}

type LeadRow = NonNullable<Awaited<ReturnType<Db["outboundLead"]["findFirst"]>>>;

/** The lead's copy arms (by dimension), choosing + returning missing ones. */
/** On-click lead: it has a gift page but no ad yet (Ozzy draws it when they open the link). */
export function isOnClickLead(lead: Pick<LeadRow, "adId" | "giftToken" | "qualityNotes">): boolean {
  return !lead.adId && Boolean(lead.giftToken) && lead.qualityNotes === ON_CLICK_NOTE;
}

export async function copyArms(db: Db, lead: Pick<LeadRow, "armIds" | "niche" | "adId" | "giftToken" | "qualityNotes">, rng: Rng, explorationPct: number): Promise<{ armIds: string[]; variant: CopyVariant; format: EmailFormat; used: Record<string, string> }> {
  const have = lead.armIds.length ? await db.klyArm.findMany({ where: { id: { in: lead.armIds }, status: { not: "retired" } } }) : [];
  const byDim = new Map(have.map((a) => [a.dimension, a]));
  for (const d of COPY_DIMENSIONS) {
    if (byDim.has(d)) continue;
    const a = await chooseArm(db, d, rng, explorationPct, audienceOf(lead.niche), isOnClickLead(lead) ? "on-click" : "prebuilt");
    if (a) byDim.set(d, a);
  }
  const tpl = (d: string) => {
    const c = byDim.get(d)?.content as { template?: unknown } | undefined;
    return typeof c?.template === "string" ? c.template : null;
  };
  const ids = new Set(lead.armIds);
  for (const a of byDim.values()) ids.add(a.id);
  const used: Record<string, string> = {};
  for (const [d, a] of byDim) used[d] = a.id;
  return { armIds: [...ids].sort(), variant: { subject: tpl("subject"), body: tpl("body"), followup: tpl("followup") }, format: (byDim.get("format")?.content as { format?: unknown } | undefined)?.format === "plain" ? "plain" : "html", used };
}

export interface Composed {
  ctx: OutboundCopyContext;
  subject: string;
  text: string;
  /** HTML alternative (format arm "html"), else null = plain text only. */
  html: string | null;
  source: "ai" | "fallback";
  error: string | null;
  costMicros: number;
}

/** Compose one email: template variant + compliance gate; an invalid variant falls back to the defaults. */
export async function composeFor(db: Db, _provider: AIProvider | null, cfg: OutboundEnv, lead: LeadRow, step: 1 | 2, senderName: string, arms: { variant: CopyVariant; format?: EmailFormat }): Promise<Composed> {
  const ad = lead.adId ? await db.ad.findUnique({ where: { id: lead.adId }, select: { headline: true } }) : null;
  const first = step === 2 ? await db.outboundSend.findFirst({ where: { leadId: lead.id, step: 1, kind: "sequence" }, select: { subject: true } }) : null;
  const ctx: OutboundCopyContext = {
    step,
    businessName: lead.businessName,
    city: lead.city,
    niche: lead.niche,
    senderName,
    headline: ad?.headline ?? null,
    claimUrl: claimLink(cfg.base, lead.claimToken),
    unsubscribeUrl: unsubscribeLink(cfg.base, lead.unsubToken),
    postalAddress: cfg.postalAddress,
    variant: arms.variant,
    firstSubject: first?.subject ?? null,
  };
  let used = ctx;
  let mail = buildOutboundEmail(ctx);
  let error = checkOutboundEmail(mail, ctx);
  if (error) {
    used = { ...ctx, variant: {} };
    mail = buildOutboundEmail(used);
    error = checkOutboundEmail(mail, used);
  }
  const onClick = isOnClickLead(lead);
  if (step === 1 && !lead.adId && !onClick) error = "no gift ad";
  let html: string | null = null;
  if ((arms.format ?? "html") === "html" && !error) {
    // On-click: a free preview card (no AI) that promises the drawing; otherwise the real hook ad.
    const full = onClick && lead.giftToken ? `${cfg.base}/api/ads/gift-public/${lead.giftToken}/preview` : await adImageUrl(db, cfg.base, lead);
    const img = full ? (onClick ? full : emailImageUrl(cfg.base, full.slice(cfg.base.length))) : null;
    html = buildOutboundHtml(used, { adImageUrl: img, businessName: lead.businessName, assetBase: cfg.base, onClick });
  }
  return { ctx: used, subject: mail.subject, text: mail.text, html, source: "fallback", error, costMicros: 0 };
}

/** Dry run: every ad_made lead -> one .txt with headers + body. No SMTP; leads unchanged (AI cost still counted). */
export async function writeDryRun(db: Db, provider: AIProvider | null, cfg: OutboundEnv, o: { leadIds?: string[]; rng: Rng; explorationPct: number }): Promise<string[]> {
  await mkdir(cfg.dryRunDir, { recursive: true });
  const leads = await db.outboundLead.findMany({ where: { status: "ad_made", ...(o.leadIds ? { id: { in: o.leadIds } } : {}) }, orderBy: { createdAt: "asc" } });
  const mbox = cfg.mailboxes[0];
  const fromAddr = mbox?.address ?? "ozzy@getkomendly.com";
  const fromName = mbox?.name ?? cfg.senderName;
  const files: string[] = [];
  for (const lead of leads) {
    const arms = await copyArms(db, lead, o.rng, o.explorationPct);
    const c = await composeFor(db, provider, cfg, lead, 1, fromName, arms);
    await addCost(db, lead.id, c.costMicros, new Date());
    const keys = await db.klyArm.findMany({ where: { id: { in: arms.armIds } }, select: { dimension: true, key: true } });
    const headers = unsubscribeHeaders(c.ctx.unsubscribeUrl, fromAddr);
    const file = path.join(cfg.dryRunDir, `${lead.domain.replace(/[^a-z0-9.-]/gi, "_")}.txt`);
    const doc = [
      `# DRY RUN (${c.error ? `WOULD REFUSE TO SEND: ${c.error}` : "would send"}); copy: ${c.source}`,
      `# Lead: ${lead.businessName} | ${lead.website} | ${lead.city}${lead.region ? `, ${lead.region}` : ""} | tz ${lead.timezone}`,
      `# Fit score: ${lead.score ?? "-"} | ad quality: ${lead.qualityScore ?? "-"}/10 (${lead.qualityNotes ?? ""})`,
      `# Arms: ${keys.map((k) => `${k.dimension}=${k.key}`).sort().join(", ")}`,
      `# Email found on: ${lead.emailFoundOn}`,
      `# Claim page: ${cfg.base}/gift/${lead.giftToken ?? "?"} (via ${c.ctx.claimUrl})`,
      `From: "${fromName}" <${fromAddr}>`,
      `To: ${lead.email}`,
      `Subject: ${c.subject}`,
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      "",
      c.text,
      "",
      `# Follow-up (step 2, only if no reply/click after the follow-up delay), threaded:`,
      `Subject: ${buildOutboundEmail({ ...c.ctx, step: 2, firstSubject: c.subject }).subject}`,
      buildOutboundEmail({ ...c.ctx, step: 2, firstSubject: c.subject }).text,
      "",
    ].join("\n");
    await writeFile(file, doc);
    if (c.html) await writeFile(file.replace(/\.txt$/, ".html"), c.html);
    files.push(file);
  }
  return files;
}

export type Transport = (m: { from: string; to: string; subject: string; text: string; html?: string | null; messageId: string; headers: Record<string, string> }) => Promise<void>;

export function smtpTransport(m: MailboxEnv): Transport {
  const t = nodemailer.createTransport({ host: m.smtpHost, port: m.smtpPort, secure: m.smtpPort === 465, auth: { user: m.user, pass: m.appPassword } });
  return async (mail) => {
    await t.sendMail({ from: mail.from, to: mail.to, subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}), messageId: mail.messageId, headers: mail.headers });
  };
}

export interface SenderDeps {
  db: Db;
  provider: AIProvider | null;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  transport?: (m: MailboxEnv) => Transport;
  rng: Rng;
  /** Effective daily volume across all mailboxes (autoscale). */
  dailyVolume: number;
  followUpDays: number;
  maxSteps: number;
  explorationPct: number;
  /** Preloaded mailboxes (env + DB store); loaded here when absent. */
  mailboxes?: StoredMailbox[];
  /** Kly warm-up knobs: rented mailboxes in warm-up send cold only once warmupReadiness passes (policy.ts). */
  warmup?: WarmupSettings | KlySettingsRow;
}

/** Sends started per tick (all mailboxes together) and how many SMTP sends run at once. */
export const MAX_SENDS_PER_TICK = 25;
export const SEND_CONCURRENCY = 5;
const DAY_MS = 86_400_000;

/**
 * One sender tick, bounded for hundreds of mailboxes: a handful of batched queries, health/auto-pause only for mailboxes
 * with recent bounces/complaints, a fair rotation across domains + mailboxes (per-domain daily cap), then at most
 * MAX_SENDS_PER_TICK sends with SEND_CONCURRENCY in flight. Follow-ups always go out from the lead's own mailbox.
 */
export async function senderTick(deps: SenderDeps): Promise<Array<{ mailbox: string; result: string }>> {
  const cfg = outboundEnv(deps.env);
  const now = deps.now?.() ?? new Date();
  if (!cfg.enabled || cfg.dryRun) return [];
  if (cfg.mailboxError) log("warn", "kly mailboxes", { error: cfg.mailboxError });
  const boxes = deps.mailboxes ?? (await loadMailboxes(deps.db, deps.env));
  if (boxes.length === 0) return [];
  const { db } = deps;
  const out: Array<{ mailbox: string; result: string }> = [];
  const ids = boxes.map((b) => b.id);
  const dayStart = sendDayStart(now);

  // Health: only mailboxes with a bounce/complaint in the last week can change state; paused-auto ones may resume.
  const flagged = new Set((await db.outboundSend.groupBy({ by: ["mailboxId"], where: { mailboxId: { in: ids }, dryRun: false, kind: "sequence", sentAt: { gte: new Date(now.getTime() - 7 * DAY_MS) }, OR: [{ bounced: true }, { complained: true }] } })).map((g) => g.mailboxId));
  for (const b of boxes) {
    const autoPaused = b.row.paused && Boolean(b.row.pausedReason?.startsWith("auto:"));
    if (!flagged.has(b.id) && !autoPaused) continue;
    const r = await mailboxHealth(db, b, now);
    if (r) out.push({ mailbox: b.address, result: r });
  }

  const domainRows = await db.outboundDomain.findMany({ where: { domain: { in: [...new Set(boxes.map((b) => b.domain))] } } });
  const domainOf = new Map(domainRows.map((d) => [d.domain, d]));
  const counts = await db.outboundSend.groupBy({ by: ["mailboxId"], where: { mailboxId: { in: ids }, dryRun: false, kind: "sequence", sentAt: { gte: dayStart } }, _count: { _all: true } });
  const sentBy = new Map(counts.map((c) => [c.mailboxId, c._count._all]));
  const totalToday = [...sentBy.values()].reduce((a, n) => a + n, 0);
  const left = Math.min(MAX_SENDS_PER_TICK, deps.dailyVolume - totalToday);
  if (left <= 0) return [...out, { mailbox: "*", result: "daily_volume" }];

  const lastIds = boxes.map((b) => b.row.lastSentAt).some(Boolean) ? await db.outboundSend.findMany({ where: { mailboxId: { in: ids }, dryRun: false, kind: "sequence", sentAt: { gte: dayStart } }, orderBy: { sentAt: "desc" }, distinct: ["mailboxId"], select: { id: true, mailboxId: true } }) : [];
  const lastSendId = new Map(lastIds.map((s) => [s.mailboxId, s.id]));
  const gates = deps.warmup ? await warmupGates(db, deps.warmup, boxes, now) : new Map();
  const cands: RotationCandidate[] = [];
  const byId = new Map(boxes.map((b) => [b.id, b]));
  for (const b of boxes) {
    if (domainOf.get(b.domain)?.paused) continue;
    const last = lastSendId.get(b.id);
    const warmup = gates.get(b.id) ?? null;
    const pace = canSendNow({ warmup, paused: b.row.paused, dailyCap: b.row.dailyCap, warmupStartedAt: b.row.warmupStartedAt, provider: b.provider, readyAt: b.row.readyAt, lastSentAt: b.row.lastSentAt, sentToday: sentBy.get(b.id) ?? 0, gapMs: last ? sendGapMs(fraction(last)) : 0 }, now);
    if (!pace.ok) continue;
    cands.push({ id: b.id, domain: b.domain, limit: mailboxDayLimit({ ...b.row, provider: b.provider, warmup }, now), sentToday: sentBy.get(b.id) ?? 0, lastSentAt: b.row.lastSentAt });
  }
  const domainSent = new Map<string, number>();
  for (const b of boxes) domainSent.set(b.domain, (domainSent.get(b.domain) ?? 0) + (sentBy.get(b.id) ?? 0));
  const budgets = new Map([...domainSent].map(([d, n]) => [d, { cap: domainOf.get(d)?.dailyCap ?? DEFAULT_DOMAIN_DAILY_CAP, sentToday: n }]));
  const chosen = planRotation(cands, budgets, left, dayStart.toISOString());
  if (!chosen.length) return out;

  const plan = await assignLeads(db, chosen.map((c) => c.id), now, deps.followUpDays, deps.maxSteps);
  const jobs = chosen.flatMap((c) => {
    const p = plan.get(c.id);
    const b = byId.get(c.id);
    return p && b ? [{ b, p }] : [];
  });
  const results = await mapPool(jobs, SEND_CONCURRENCY, ({ b, p }) => sendOne(deps, cfg, b, b.id, p.lead, p.step, now));
  jobs.forEach((j, i) => {
    const r = results[i];
    out.push({ mailbox: j.b.address, result: r instanceof Error ? `error: ${r.message}` : (r ?? "") });
  });
  for (const c of chosen) if (!plan.has(c.id)) out.push({ mailbox: byId.get(c.id)?.address ?? c.id, result: "no lead due" });
  return out;
}

/** Per-mailbox auto-resume / auto-pause (unchanged rules from policy.ts). Returns a result line when it paused. */
async function mailboxHealth(db: Db, b: StoredMailbox, now: Date): Promise<string | null> {
  const row = b.row;
  const m = b;
  // Warm-up spam pauses are lifted by warmup.ts on a clean placement rate, not by the bounce cool-down.
  if (row.paused && row.pausedReason?.startsWith("auto:") && !row.pausedReason.startsWith(WARMUP_PAUSE_PREFIX)) {
    const lastPause = await db.klyDecision.findFirst({ where: { kind: "pause", summary: { contains: m.address } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (autoResumeDue(row.pausedReason, lastPause?.createdAt ?? null, now)) {
      await db.outboundMailbox.update({ where: { id: row.id }, data: { paused: false, pausedReason: null } });
      await db.klyDecision.create({ data: { kind: "resume", summary: `Resumed ${m.address} after its cool-down (it was paused for: ${row.pausedReason.slice(6)}).`, data: { mailbox: m.address } } });
      log("info", "kly mailbox auto-resumed", { mailbox: m.address });
      row.paused = false;
      row.pausedReason = null;
    }
  }
  if (row.paused) return null;
  const recent = await db.outboundSend.findMany({ where: { mailboxId: row.id, dryRun: false, kind: "sequence" }, orderBy: { sentAt: "desc" }, take: HEALTH_WINDOW, select: { id: true, bounced: true, complained: true, sentAt: true } });
  // Sends from before a resume don't count again, or the same old bounces would re-pause it at once.
  const lastResume = await db.klyDecision.findFirst({ where: { kind: "resume", summary: { contains: m.address } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const pause = autoPauseReason(lastResume ? recent.filter((s) => s.sentAt > lastResume.createdAt) : recent);
  if (!pause) return null;
  await db.outboundMailbox.update({ where: { id: row.id }, data: { paused: true, pausedReason: `auto: ${pause}` } });
  await db.klyDecision.create({ data: { kind: "pause", summary: `Paused mailbox ${m.address}: ${pause}.`, data: { mailbox: m.address } } });
  log("warn", "kly mailbox auto-paused", { mailbox: m.address, reason: pause });
  row.paused = true;
  return `auto-paused: ${pause}`;
}

/**
 * One lead per chosen mailbox from one candidate query: its own due follow-up first (same mailbox), else the oldest
 * fresh lead nobody else has claimed. Business hours, suppression and the voice stop list still apply.
 */
export async function assignLeads(db: Db, mailboxIds: string[], now: Date, followUpDays: number, maxSteps: number): Promise<Map<string, { lead: LeadRow; step: 1 | 2 }>> {
  const candidates = await db.outboundLead.findMany({
    where: { purgedAt: null, email: { not: "" }, OR: [{ status: { in: ["ad_made", "queued"] }, step: 0, OR: [{ mailboxId: null }, { mailboxId: { in: mailboxIds } }] }, { status: "sent", step: 1, mailboxId: { in: mailboxIds } }], AND: [{ OR: [{ voiceStatus: null }, { voiceStatus: { notIn: [...VOICE_STOP_STATUSES] } }] }] },
    orderBy: [{ step: "desc" }, { createdAt: "asc" }],
    take: Math.max(200, mailboxIds.length * 20),
  });
  const sup = new Set((await db.outboundSuppression.findMany({ where: { value: { in: [...new Set(candidates.flatMap((l) => [l.email.toLowerCase(), l.domain]))] } }, select: { value: true } })).map((s) => s.value));
  const out = new Map<string, { lead: LeadRow; step: 1 | 2 }>();
  const taken = new Set<string>();
  const ready: Array<{ lead: LeadRow; step: 1 | 2 }> = [];
  for (const l of candidates) {
    const step = nextStep(l, now, followUpDays * 86_400_000);
    if (!step || step > maxSteps || !inBusinessHours(now, l.timezone)) continue;
    if (sup.has(l.email.toLowerCase()) || sup.has(l.domain)) {
      await db.outboundLead.update({ where: { id: l.id }, data: { status: "unsubscribed" } });
      continue;
    }
    ready.push({ lead: l, step });
  }
  // Pinned leads (follow-ups, or a step-0 lead already claimed by a mailbox) go to their own mailbox.
  for (const r of ready) {
    if (r.lead.mailboxId && mailboxIds.includes(r.lead.mailboxId) && !out.has(r.lead.mailboxId)) {
      out.set(r.lead.mailboxId, r);
      taken.add(r.lead.id);
    }
  }
  const fresh = ready.filter((r) => !r.lead.mailboxId && !taken.has(r.lead.id));
  for (const id of mailboxIds) {
    if (out.has(id)) continue;
    const r = fresh.shift();
    if (!r) break;
    out.set(id, r);
  }
  return out;
}

async function sendOne(deps: SenderDeps, cfg: OutboundEnv, m: MailboxEnv, mailboxId: string, lead: LeadRow, step: 1 | 2, now: Date): Promise<string> {
  const { db } = deps;
  const arms = await copyArms(db, lead, deps.rng, deps.explorationPct);
  // Claim the lead for this mailbox (sticky: the follow-up comes from the same person) and pin its arms.
  const claimed = await db.outboundLead.updateMany({ where: { id: lead.id, step: lead.step, OR: [{ mailboxId: null }, { mailboxId }] }, data: { mailboxId, armIds: arms.armIds, status: step === 1 ? "queued" : lead.status } });
  if (claimed.count !== 1) return "lead taken";
  const c = await composeFor(db, deps.provider, cfg, lead, step, m.name, arms);
  await addCost(db, lead.id, c.costMicros, now);
  if (c.error) {
    await db.outboundLead.update({ where: { id: lead.id }, data: { error: `copy: ${c.error}` } });
    return `refused: ${c.error}`;
  }
  const messageId = `<${randomUUID()}@${m.address.split("@")[1] ?? "getkomendly.com"}>`;
  const prev = step === 2 ? await db.outboundSend.findFirst({ where: { leadId: lead.id, step: 1, kind: "sequence" }, select: { messageId: true } }) : null;
  const headers = { ...unsubscribeHeaders(c.ctx.unsubscribeUrl, m.address), ...(prev ? { "In-Reply-To": prev.messageId, References: prev.messageId } : {}) };
  try {
    await (deps.transport ?? smtpTransport)(m)({ from: `"${m.name}" <${m.address}>`, to: lead.email, subject: c.subject, text: c.text, html: c.html, messageId, headers });
  } catch (e) {
    await db.outboundLead.update({ where: { id: lead.id }, data: { error: `smtp: ${errMsg(e).slice(0, 300)}` } });
    return `smtp error: ${errMsg(e)}`;
  }
  const sendArms = step === 1 ? [arms.used.subject, arms.used.body, arms.used.format] : [arms.used.followup, arms.used.format];
  await db.$transaction([
    db.outboundSend.create({ data: { leadId: lead.id, mailboxId, step, messageId, toEmail: lead.email, subject: c.subject, body: c.text, copySource: c.source, sentAt: now, kind: "sequence", armIds: sendArms.filter((x): x is string => Boolean(x)) } }),
    db.outboundLead.update({ where: { id: lead.id }, data: { step, status: lead.status === "clicked" ? "clicked" : "sent", lastSentAt: now, error: null } }),
    db.outboundMailbox.update({ where: { id: mailboxId }, data: { lastSentAt: now, sentTotal: { increment: 1 } } }),
    // First cold send starts the 5 -> 10 -> 15 cold ramp (policy.ts coldRampLimit).
    db.outboundMailbox.updateMany({ where: { id: mailboxId, coldStartedAt: null }, data: { coldStartedAt: now } }),
  ]);
  await extendAssets(db, lead.adId, now);
  return `sent step ${step} to ${lead.domain}`;
}
