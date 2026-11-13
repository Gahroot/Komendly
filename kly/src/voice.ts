// Voice bridge to The Tribunal (CONTRACT v1, Kly is the only caller): each tick after sending,
//  a) push: hand gifted, unanswered leads with a US phone to Tribunal for an AI call (daily cap, kill switches);
//  b) pull: ingest call events after KlySettings.voiceCursor (OutboundVoiceEvent = audit trail, unique per event id),
//     act on outcomes (gift_yes/info_requested -> one "as promised" gift email, opt_out -> suppress, not_interested -> stop);
//  c) suppress sync: unsubscribed/complained/bounced/customer leads with a phone -> POST /suppress (voiceSyncedAt marks done).
// Bridge failures are logged (+ one KlyDecision "error" per hour) and never thrown out of the tick.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { claimLink, cleanBusinessName, unsubscribeHeaders, unsubscribeLink } from "../../src/lib/ads/outbound/copy";
import { isSuppressed, type MailboxEnv } from "../../src/lib/ads/outbound/policy";
import type { Db } from "./db";
import { komendlyCustomers, extractSitePhone } from "./finder";
import { isLegalLead } from "./legal";
import { errMsg, log } from "./log";
import { replyEmail, suppress, type AlertFn } from "./replies";
import { isOnClickLead } from "./sender";
import { WEAK_SENT_NOTE } from "./hook";
import { outboundEnv, smtpTransport, type OutboundEnv, type Transport } from "./sender";
import { dayStart, decide, SETTINGS_ID, type KlySettingsRow } from "./settings";

export const PUSH_BATCH = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EVENTS_PAGE = 200;
export const MAX_EVENT_PAGES = 5;
export const PUSH_STATUSES = ["sent", "opened", "clicked"] as const;
export const VOICE_COPY_SOURCE = "voice";
export const GIFT_EVENTS = ["gift_yes", "info_requested"] as const;
const DAY_MS = 86_400_000;
const ERROR_EVERY_MS = 3_600_000;

export interface BridgeConfig {
  url: string;
  token: string;
}

/** TRIBUNAL_BRIDGE_URL (…/api/v1/komendly-bridge) + KOMENDLY_BRIDGE_TOKEN, read at call time. Null = bridge off. */
export function bridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig | null {
  const url = env.TRIBUNAL_BRIDGE_URL?.trim().replace(/\/+$/, "");
  const token = env.KOMENDLY_BRIDGE_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface VoiceDeps {
  db: Db;
  settings: KlySettingsRow;
  /** Kill switch reason (KlySettings.enabled / AdsFeatureFlag outbound), null = on. */
  killSwitch: string | null;
  /** Email sending is live (OUTBOUND_ENABLED, mailboxes, not a dry run, kill switch on). */
  sendingLive: boolean;
  env?: NodeJS.ProcessEnv;
  fetch?: FetchFn;
  transport?: (m: MailboxEnv) => Transport;
  alert?: AlertFn;
  /** Start gift runs for these leads (the existing hook-ad pipeline; caller applies the spend stops). */
  startGift?: (leadIds: string[]) => Promise<number>;
  now?: () => Date;
}

async function bridgeCall(d: VoiceDeps, b: BridgeConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const f: FetchFn = d.fetch ?? ((url, init) => fetch(url, init));
  const res = await f(`${b.url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${b.token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} -> HTTP ${res.status}`);
  return res.json();
}

/** Log a bridge failure; at most one KlyDecision "error" per hour. Never throws. */
export async function bridgeError(db: Db, what: string, e: unknown, now: Date): Promise<void> {
  const msg = errMsg(e).slice(0, 300);
  log("warn", `kly voice ${what} failed`, { error: msg });
  try {
    const recent = await db.klyDecision.count({ where: { kind: "error", summary: { startsWith: "Voice bridge" }, createdAt: { gte: new Date(now.getTime() - ERROR_EVERY_MS) } } });
    if (!recent) await decide(db, "error", `Voice bridge ${what} failed: ${msg}`, { what });
  } catch (x) {
    log("warn", "kly voice error decision failed", { error: errMsg(x) });
  }
}

// ---------------------------------------------------------------------------
// a) Push

const ResultsSchema = z.object({ results: z.array(z.object({ external_id: z.string(), accepted: z.boolean(), reason: z.string().default("") })) });

const CALL_ASK = /\b(call|phone|ring)\b/i;

/** A positive reply that asks for a call. */
export function wantsCall(intent: string | null, snippets: ReadonlyArray<string | null>): boolean {
  return (intent === "interested" || intent === "question") && snippets.some((s) => Boolean(s && CALL_ASK.test(s)));
}

/** How many leads may be pushed this tick: one batch, under the daily cap and ~1.5x the hourly cap queued ahead. */
export function pushRoom(o: { dailyCallCap: number; hourlyCallCap: number; pushedToday: number; queued: number }, batch = PUSH_BATCH): number {
  return Math.max(0, Math.min(batch, o.dailyCallCap - o.pushedToday, Math.ceil(o.hourlyCallCap * 1.5) - o.queued));
}

const STOPPED = ["unsubscribed", "complained", "bounced", "failed", "signed_up", "paid"];

/** Call-first: any qualified lead with a phone, not suppressed, not a customer, not legal, never pushed. No email or gift needed. */
export async function pushLeads(d: VoiceDeps, b: BridgeConfig, cfg: OutboundEnv, now: Date): Promise<{ pushed: number; accepted: number; rejected: number; skipped: number }> {
  const { db, settings: s } = d;
  const out = { pushed: 0, accepted: 0, rejected: 0, skipped: 0 };
  const [pushedToday, queued] = await Promise.all([
    db.outboundLead.count({ where: { voicePushedAt: { gte: dayStart(now) } } }),
    db.outboundLead.count({ where: { voiceStatus: "queued" } }),
  ]);
  const room = pushRoom({ dailyCallCap: s.dailyCallCap, hourlyCallCap: s.hourlyCallCap, pushedToday, queued });
  if (room === 0) return out;
  const fresh = { voiceStatus: null, purgedAt: null, userId: null, workspaceId: null, status: { notIn: STOPPED } };
  const callbacks = await db.outboundLead.findMany({
    where: { ...fresh, repliedAt: { not: null }, replyIntent: { in: ["interested", "question"] } },
    include: { sends: { where: { replied: true }, select: { replySnippet: true } } },
    orderBy: { repliedAt: "asc" },
    take: 50,
  });
  const cold = await db.outboundLead.findMany({
    where: { ...fresh, phone: { not: null }, repliedAt: null, OR: [{ score: null }, { score: { gte: s.minLeadScore } }] },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    take: room * 3,
  });
  const sup = new Set((await db.outboundSuppression.findMany({ select: { value: true } })).map((x) => x.value.toLowerCase()));
  const customers = await komendlyCustomers(db);
  type Lead = (typeof cold)[number];
  const batch: Array<{ lead: Lead; phone: string; reason: "cold" | "callback_requested" }> = [];
  const candidates: Array<{ lead: Lead; phone: string | null; reason: "cold" | "callback_requested" }> = [
    ...callbacks.filter((l) => wantsCall(l.replyIntent, l.sends.map((x) => x.replySnippet))).map((l) => ({ lead: l as Lead, phone: l.phone ?? l.sends.map((x) => (x.replySnippet ? extractSitePhone(x.replySnippet) : null)).find(Boolean) ?? null, reason: "callback_requested" as const })),
    ...cold.map((l) => ({ lead: l, phone: l.phone, reason: "cold" as const })),
  ];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (batch.length >= room) break;
    const l = c.lead;
    if (seen.has(l.id) || !c.phone) continue;
    seen.add(l.id);
    const email = l.email.toLowerCase();
    // Never call legal businesses (niche, AI qualification flag, or name/domain keywords); cold email is unaffected.
    const why = isLegalLead(l) ? "legal" : (email && isSuppressed(email, sup)) || sup.has(l.domain) ? "suppressed" : (email && customers.emails.has(email)) || customers.domains.has(l.domain) ? "existing_user" : null;
    if (why) {
      await db.outboundLead.update({ where: { id: l.id }, data: { voiceStatus: "rejected", voiceReason: why } });
      out.skipped++;
      continue;
    }
    batch.push({ lead: l, phone: c.phone, reason: c.reason });
  }
  if (!batch.length) return out;
  const leads = batch.map(({ lead: l, phone, reason }) => ({
    external_id: l.id,
    business_name: cleanBusinessName(l.businessName),
    phone,
    email: l.email || null,
    website: l.website,
    niche: l.niche,
    city: l.region ? `${l.city}, ${l.region}` : l.city,
    timezone: l.timezone,
    // Same claim link as the emails (carries the gift token + attribution cookie); null until a gift exists.
    gift_url: l.giftToken ? claimLink(cfg.base, l.claimToken) : null,
    reason,
  }));
  const parsed = ResultsSchema.parse(await bridgeCall(d, b, "POST", "/leads", { leads }));
  const byId = new Map(parsed.results.map((r) => [r.external_id, r]));
  for (const { lead: l, phone } of batch) {
    const r = byId.get(l.id);
    if (!r) continue; // no decision: retried next tick
    await db.outboundLead.update({ where: { id: l.id }, data: { voiceStatus: r.accepted ? "queued" : "rejected", voiceReason: r.reason.slice(0, 200) || null, voicePushedAt: now, ...(l.phone ? {} : { phone, phoneSource: "reply" }) } });
    out.pushed++;
    if (r.accepted) out.accepted++;
    else out.rejected++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// b) Pull

const EventSchema = z.object({
  id: z.number().int(),
  external_id: z.string().nullish(),
  type: z.string(),
  email: z.string().nullish(),
  detail: z.string().nullish(),
  call_id: z.string().nullish(),
  delivery: z.string().nullish(),
  sms_phone: z.string().nullish(),
  at: z.string(),
});
const EventsSchema = z.object({ events: z.array(EventSchema), next: z.number().int().optional() });
export type BridgeEvent = z.infer<typeof EventSchema>;

const STATUS_OF: Record<string, string> = { accepted: "queued", call_started: "called", completed: "called", busy: "no_answer" };
const SETTLED = new Set(["gift_yes", "info_requested", "not_interested"]);

/** Lead voiceStatus after an event: opt_out is final; a settled outcome isn't overwritten by later call noise. */
export function nextVoiceStatus(current: string | null, type: string): string {
  if (current === "opt_out" || type === "opt_out") return "opt_out";
  const s = STATUS_OF[type] ?? type;
  if (current && SETTLED.has(current) && !SETTLED.has(s)) return current;
  return s;
}

/** Apply one event once: duplicates (already in OutboundVoiceEvent) are skipped. Returns what happened. */
export async function ingestEvent(db: Db, e: BridgeEvent, now: Date, alert?: AlertFn): Promise<string> {
  if (await db.outboundVoiceEvent.findUnique({ where: { tribunalEventId: e.id } })) return "duplicate";
  const at = new Date(e.at);
  const when = Number.isNaN(at.getTime()) ? now : at;
  if (e.type === "paused") {
    const why = e.detail?.slice(0, 300) || "no reason given";
    await decide(db, "pause", `The Tribunal paused Komendly voice calls (circuit breaker): ${why}.`, { tribunalEventId: e.id });
    await alert?.("[Kly] Tribunal paused voice calls", `The Tribunal's circuit breaker paused the Komendly voice campaign.\n\nReason: ${why}\nAt: ${when.toISOString()}\n\nCheck the campaign in The Tribunal UI.`).catch((x: unknown) => log("warn", "kly voice pause alert failed", { error: errMsg(x) }));
  }
  const lead = e.external_id ? await db.outboundLead.findUnique({ where: { id: e.external_id } }) : null;
  if (lead) {
    const status = nextVoiceStatus(lead.voiceStatus, e.type);
    const data: Record<string, unknown> = { voiceStatus: status };
    if (e.detail) data.voiceReason = e.detail.slice(0, 200);
    if (e.type === "call_started" && !lead.calledAt) data.calledAt = when;
    if (status === "gift_yes" || status === "info_requested" || status === "not_interested" || status === "opt_out") data.nextSendAt = null;
    const evEmail = e.email?.trim().toLowerCase();
    if (!lead.email && evEmail && EMAIL_RE.test(evEmail) && (e.type === "gift_yes" || e.type === "info_requested")) {
      data.email = evEmail; // phone-only lead: the agent collected an address
      data.emailFoundOn = "voice";
    }
    if ((e.type === "gift_yes" || e.type === "info_requested") && (e.delivery === "sms" || e.delivery === "email")) {
      data.voiceDelivery = e.delivery;
      data.voiceSmsPhone = e.sms_phone?.trim() || null;
    }
    if (e.type === "opt_out") {
      if (lead.email) await suppress(db, lead.email, "email", "reply_stop");
      if (e.email) await suppress(db, e.email, "email", "reply_stop");
      await suppress(db, lead.domain, "domain", "reply_stop");
      data.status = lead.status === "signed_up" || lead.status === "paid" ? lead.status : "unsubscribed";
      data.voiceSyncedAt = now; // Tribunal already opted the phone out
    }
    await db.outboundLead.update({ where: { id: lead.id }, data });
  }
  try {
    await db.outboundVoiceEvent.create({ data: { leadId: e.external_id ?? null, tribunalEventId: e.id, type: e.type, email: e.email?.trim().toLowerCase() || null, detail: e.detail?.slice(0, 1000) ?? null, callId: e.call_id ?? null, delivery: e.delivery ?? null, smsPhone: e.sms_phone?.trim() || null, at: when } });
  } catch (x) {
    if ((x as { code?: string }).code !== "P2002") throw x;
  }
  return lead || e.type === "paused" ? e.type : "unknown lead";
}

/** Fetch and apply events after the cursor; the cursor moves only past events that were fully processed. */
export async function pullEvents(d: VoiceDeps, b: BridgeConfig, now: Date): Promise<{ events: number; cursor: number }> {
  const { db } = d;
  const start = d.settings.voiceCursor;
  let cursor = start;
  let n = 0;
  try {
    for (let page = 0; page < MAX_EVENT_PAGES; page++) {
      const r = EventsSchema.parse(await bridgeCall(d, b, "GET", `/events?after=${cursor}&limit=${EVENTS_PAGE}`));
      const events = [...r.events].sort((a, c) => a.id - c.id);
      for (const e of events) {
        if (e.id <= cursor) continue;
        await ingestEvent(db, e, now, d.alert);
        cursor = e.id;
        n++;
      }
      if (events.length < EVENTS_PAGE) break;
    }
  } finally {
    if (cursor !== start) {
      await db.klySettings.update({ where: { id: SETTINGS_ID }, data: { voiceCursor: cursor } });
      d.settings.voiceCursor = cursor;
    }
  }
  return { events: n, cursor };
}

export const SMS_RETRY_MS = DAY_MS;

/** The gift text (<= 320 chars; Tribunal appends the STOP line). */
export function giftSmsBody(businessName: string, claimUrl: string): string {
  const pre = "Hi from Komendly! Here are the free ads we made for ";
  const name = cleanBusinessName(businessName).slice(0, Math.max(0, 320 - pre.length - 2 - claimUrl.length));
  return `${pre}${name}: ${claimUrl}`;
}

/** POST /sms; returns the HTTP status (0 = network error). Never throws. */
async function postSms(d: VoiceDeps, b: BridgeConfig, body: { external_id: string; to: string; body: string }): Promise<number> {
  const f: FetchFn = d.fetch ?? ((url, init) => fetch(url, init));
  try {
    const res = await f(`${b.url}/sms`, { method: "POST", headers: { Authorization: `Bearer ${b.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    return res.status;
  } catch (e) {
    log("warn", "kly voice sms failed", { error: errMsg(e) });
    return 0;
  }
}

/** At most one "Voice SMS" KlyDecision per hour. */
async function smsAlert(db: Db, summary: string, leadId: string, now: Date): Promise<void> {
  const recent = await db.klyDecision.count({ where: { kind: "error", summary: { startsWith: "Voice SMS" }, createdAt: { gte: new Date(now.getTime() - ERROR_EVERY_MS) } } });
  if (!recent) await decide(db, "error", summary, { leadId });
}

/** The "as promised on the phone" gift: a text when asked for (v1.1), else / on SMS failure the email.
 * Exactly one successful delivery per lead (voiceDeliveredAt; the email also keeps its OutboundSend marker). */
export async function sendVoiceGifts(d: VoiceDeps, cfg: OutboundEnv, now: Date): Promise<number> {
  const { db } = d;
  const leads = await db.outboundLead.findMany({
    where: { voiceStatus: { in: [...GIFT_EVENTS] }, purgedAt: null, status: { notIn: ["unsubscribed", "complained", "bounced"] } },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
  if (!leads.length) return 0;
  // No gift yet (call-first leads): start one now; it is emailed on a later tick once judged.
  const giftless = leads.filter((l) => !l.giftId && l.status === "found").map((l) => l.id);
  if (giftless.length && d.startGift) await d.startGift(giftless);
  const sup = new Set((await db.outboundSuppression.findMany({ select: { value: true } })).map((x) => x.value.toLowerCase()));
  const b = bridgeConfig(d.env ?? process.env);
  let sent = 0;
  for (const lead of leads) {
    if (!isOnClickLead(lead) && !lead.adId) continue; // gift still being made / judged
    if (lead.voiceDeliveredAt) continue;
    if (lead.voiceDelivery === "sms" && lead.voiceSmsPhone && b) {
      const firstFail = lead.voiceSmsFailedAt;
      if (!firstFail || now.getTime() - firstFail.getTime() < SMS_RETRY_MS) {
        const status = await postSms(d, b, { external_id: lead.id, to: lead.voiceSmsPhone, body: giftSmsBody(lead.businessName, claimLink(cfg.base, lead.claimToken)) });
        if (status === 200) {
          await db.outboundLead.update({ where: { id: lead.id }, data: { voiceDeliveredAt: now, voiceDeliveredVia: "sms", nextSendAt: null } });
          sent++;
          continue;
        }
        if (!firstFail) await db.outboundLead.update({ where: { id: lead.id }, data: { voiceSmsFailedAt: now } });
      }
      const hasEmail = Boolean(lead.email) || Boolean(await db.outboundVoiceEvent.findFirst({ where: { leadId: lead.id, type: { in: [...GIFT_EVENTS] }, email: { not: null } } }));
      if (!hasEmail) {
        await smsAlert(db, `Voice SMS gift delivery failed for lead ${lead.id} with no email to fall back to; retrying for 24 h.`, lead.id, now);
        continue;
      }
    }
    if (await db.outboundSend.count({ where: { leadId: lead.id, kind: "reply", copySource: VOICE_COPY_SOURCE } })) continue;
    if (!d.sendingLive || cfg.mailboxes.length === 0) continue;
    const ev = await db.outboundVoiceEvent.findFirst({ where: { leadId: lead.id, type: { in: [...GIFT_EVENTS] }, email: { not: null } }, orderBy: { tribunalEventId: "desc" } });
    const to = (ev?.email ?? lead.email).trim().toLowerCase();
    if (!EMAIL_RE.test(to) || isSuppressed(to, sup) || sup.has(lead.domain)) continue;
    const row = lead.mailboxId ? await db.outboundMailbox.findUnique({ where: { id: lead.mailboxId } }) : null;
    const m = cfg.mailboxes.find((x) => x.address === row?.address) ?? cfg.mailboxes[0];
    if (!m) continue;
    const mailboxId = row && row.address === m.address ? row.id : (await db.outboundMailbox.findUnique({ where: { address: m.address } }))?.id;
    if (!mailboxId) continue;
    const unsubscribeUrl = unsubscribeLink(cfg.base, lead.unsubToken);
    const text = replyEmail({
      answer: `As promised on the phone, here's the free ad Ozzy made for ${cleanBusinessName(lead.businessName)}. It's yours to keep and use, no strings attached.${lead.qualityNotes?.startsWith(WEAK_SENT_NOTE) ? " It's a first draft, so if it isn't quite right, the link lets you make a few more." : ""}`,
      senderName: m.name,
      claimUrl: claimLink(cfg.base, lead.claimToken), // same gift token -> signup/revenue attribution keeps working
      postalAddress: cfg.postalAddress,
      unsubscribeUrl,
    });
    const subject = "Your free ad, as promised";
    const messageId = `<${randomUUID()}@${m.address.split("@")[1] ?? "getkomendly.com"}>`;
    // Record first (the idempotency marker), then send; a failed send removes the marker so it is retried.
    const rec = await db.outboundSend.create({ data: { leadId: lead.id, mailboxId, step: 0, messageId, toEmail: to, subject, body: text, copySource: VOICE_COPY_SOURCE, sentAt: now, kind: "reply", armIds: lead.armIds } });
    try {
      await (d.transport ?? smtpTransport)(m)({ from: `"${m.name}" <${m.address}>`, to, subject, text, messageId, headers: unsubscribeHeaders(unsubscribeUrl, m.address) });
    } catch (e) {
      await db.outboundSend.delete({ where: { id: rec.id } }).catch(() => undefined);
      throw e;
    }
    await db.outboundLead.update({ where: { id: lead.id }, data: { nextSendAt: null, voiceDeliveredAt: now, voiceDeliveredVia: "email" } });
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// c) Suppress sync

export const SUPPRESS_REASON: Record<string, "unsubscribe" | "complaint" | "bounce" | "customer"> = {
  unsubscribed: "unsubscribe",
  complained: "complaint",
  bounced: "bounce",
  signed_up: "customer",
  paid: "customer",
};

/** Leads Kly unsubscribed/bounced/got a complaint from or converted, not yet synced: POST /suppress, then mark synced.
 * Runs every tick, so a failed POST is simply retried (voiceSyncedAt stays null). */
export async function syncSuppressions(d: VoiceDeps, b: BridgeConfig, now: Date): Promise<number> {
  const { db } = d;
  const leads = await db.outboundLead.findMany({
    where: { phone: { not: null }, voiceSyncedAt: null, status: { in: Object.keys(SUPPRESS_REASON) } },
    select: { id: true, phone: true, email: true, status: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  let n = 0;
  for (const l of leads) {
    await bridgeCall(d, b, "POST", "/suppress", { phone: l.phone, email: l.email || null, external_id: l.id, reason: SUPPRESS_REASON[l.status] ?? "manual" });
    await db.outboundLead.update({ where: { id: l.id }, data: { voiceSyncedAt: now } });
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------

export interface VoiceTickResult {
  push: Awaited<ReturnType<typeof pushLeads>> | null;
  events: number;
  giftEmails: number;
  suppressed: number;
}

/** One voice tick. Never throws. */
export async function voiceTick(d: VoiceDeps): Promise<VoiceTickResult> {
  const now = d.now?.() ?? new Date();
  const env = d.env ?? process.env;
  const cfg = outboundEnv(env);
  const b = bridgeConfig(env);
  const r: VoiceTickResult = { push: null, events: 0, giftEmails: 0, suppressed: 0 };
  if (b) {
    try {
      r.suppressed = await syncSuppressions(d, b, now);
    } catch (e) {
      await bridgeError(d.db, "suppress sync", e, now);
    }
    try {
      r.events = (await pullEvents(d, b, now)).events;
    } catch (e) {
      await bridgeError(d.db, "event pull", e, now);
    }
    if (d.settings.enabled && d.settings.voiceEnabled && !d.killSwitch) {
      try {
        r.push = await pushLeads(d, b, cfg, now);
      } catch (e) {
        await bridgeError(d.db, "lead push", e, now);
      }
    }
  }
  // Pending promised gift emails are local work: sent whenever email sending is live (retried until it is).
  try {
    r.giftEmails = await sendVoiceGifts(d, cfg, now);
  } catch (e) {
    await bridgeError(d.db, "gift email", e, now);
  }
  return r;
}
