// Hot follow-up: what the founder would do by hand. A lead who REALLY looked at their gift ad (the gift page's beacon
// reported a person: pointer/scroll/key/touch or 5 s on a visible, focused page; see src/lib/growth/human-signal.ts)
// gets ONE short, personal note from the mailbox that sent them step 1, in the same thread, during their business hours.
//
// OFF by default. KLY_HOT_FOLLOWUP=1 sends; KLY_HOT_FOLLOWUP_DRY=1 only logs who it WOULD email (also works alone).
// Hard limits (all enforced here, none relaxed): one hot follow-up per lead ever, 25 a day in total, the original mailbox
// only, inside that mailbox's daily cap + pacing and its domain's cap (hot sends count in both, see send-kinds.ts), never
// to suppressed / replied / unsubscribed / bounced / complained / signed-up / paying leads, never while the governor is
// tripped (the loop only calls this while cold sending is live, and passes the governor's verdict), plain text with the
// standard footer.
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { checkOutboundEmail, cleanBusinessName, hasBannedClaim, NOLAN_SIGNOFF, renderTemplate, unsubscribeHeaders, unsubscribeLink, claimLink, type OutboundCopyContext, type OutboundEmail } from "../../src/lib/ads/outbound/copy";
import { canSendNow, DEFAULT_DOMAIN_DAILY_CAP, inBusinessHours, isStopped, isSuppressed, sendDayStart, sendGapMs, type MailboxEnv } from "../../src/lib/ads/outbound/policy";
import { AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, PUBLIC_OFFER } from "../../src/lib/ads/public-offer";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import type { StoredMailbox } from "./mailboxes";
import { CAPPED_KINDS, HOT_FOLLOWUP_KIND, SEQUENCE_KIND } from "./send-kinds";
import { fraction, isSendableCheck, outboundEnv, VOICE_STOP_STATUSES, type Transport } from "./sender";
import { warmupGates, type WarmupSettings } from "./warmup";

type LeadRow = NonNullable<Awaited<ReturnType<Db["outboundLead"]["findFirst"]>>>;

export const HOT_EVENT = "hot_followup_sent";
/** Not before this long after the person looked (let them finish; it reads less like a bot), not after this (stale). */
export const HOT_MIN_WAIT_MS = 20 * 60_000;
export const HOT_MAX_AGE_MS = 72 * 3_600_000;
/** All mailboxes together, per ET send day. */
export const HOT_DAILY_CAP = 25;
export const HOT_MAX_PER_TICK = 5;
/** A "view" this soon after the send is a mail scanner opening the link, not the owner reading the email. */
export const MIN_VIEW_AFTER_SEND_MS = 120_000;
/** Recipient-local hours [from, to) in which a "view" is treated as a sandbox, not a business owner (scanner streams peak 2-3am). */
export const QUIET_VIEW_HOURS = { from: 0, to: 5 } as const;
/** After an SMTP failure or a rejected draft the lead waits this long before the next try (in memory). */
export const HOT_RETRY_BACKOFF_MS = 30 * 60_000;
export const HOT_MAX_WORDS = 110;
const MAX_HUMAN_EVENTS = 2000;
const MAX_LEADS = 500;

// ---------------------------------------------------------------------------
// Env

export function hotFollowupEnv(env: NodeJS.ProcessEnv = process.env): { enabled: boolean; dry: boolean } {
  const live = env.KLY_HOT_FOLLOWUP === "1";
  const dry = env.KLY_HOT_FOLLOWUP_DRY === "1";
  // Dry run wins: KLY_HOT_FOLLOWUP_DRY=1 never sends, even with KLY_HOT_FOLLOWUP=1.
  return { enabled: live || dry, dry };
}

// ---------------------------------------------------------------------------
// Copy: one fixed template, only the facts public-offer.ts exports.

/** The offer prices as the public file states them (so the copy guard can exempt exactly these). */
export const OFFER_PRICES: string[] = AUTOPILOT_FIRST_MONTH_LINE.match(/\$\d[\d,]*(?:\.\d+)?/g) ?? [];

export const HOT_FOLLOWUP_TEMPLATE = [
  "Thanks for taking a look at the ad I made for {business}.",
  "",
  `If you'd like us to run the ads for you, our done-for-you option is ${AUTOPILOT_FIRST_MONTH_LINE} (founding price, ${PUBLIC_OFFER.foundingSpots} spots). ${AUTOPILOT_GUARANTEE_LINE}`,
  "",
  `Or keep it free: your gift link has ${PUBLIC_OFFER.freeAds} free ads, no card needed. {link}`,
  "",
  "Reply yes and I'll set it up.",
  "",
  NOLAN_SIGNOFF,
].join("\n");

export interface HotCopyContext {
  businessName: string;
  claimUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
  /** The subject step 1 went out with; the reply is "Re: <that>". */
  firstSubject: string;
  senderName: string;
}

export function hotSubject(firstSubject: string): string {
  const s = firstSubject.trim();
  return (/^re:/i.test(s) ? s : `Re: ${s}`).slice(0, 70);
}

/** The whole plain-text email: the template + the standard footer (postal address, one-line opt-out). */
export function buildHotFollowup(c: HotCopyContext): OutboundEmail {
  const body = renderTemplate(HOT_FOLLOWUP_TEMPLATE, { business: cleanBusinessName(c.businessName), link: c.claimUrl });
  const text = [body, "", "--", `Komendly, ${c.postalAddress}`, `Not for you? Reply "stop" or unsubscribe: ${c.unsubscribeUrl}`].join("\n");
  return { subject: hotSubject(c.firstSubject), text };
}

/** Same guard as the other Kly copy (claim words, price rule, compliance footer, one link, no placeholders), with the offer's own
 * public prices allowed and a word limit that fits the offer. Returns an error or null. */
export function checkHotFollowup(mail: OutboundEmail, c: HotCopyContext): string | null {
  const body = mail.text.split("\n--\n")[0] ?? mail.text;
  if (hasBannedClaim(HOT_FOLLOWUP_TEMPLATE.replace(/\{\w+\}/g, "X"), OFFER_PRICES)) return "banned phrase in template";
  if (hasBannedClaim(body.replace(c.claimUrl, "X"), OFFER_PRICES)) return "banned phrase in body";
  if (/one[- ]?click/i.test(body)) return "one-click claim";
  const ctx: OutboundCopyContext = { step: 2, businessName: c.businessName, city: "", niche: "", senderName: c.senderName, claimUrl: c.claimUrl, unsubscribeUrl: c.unsubscribeUrl, postalAddress: c.postalAddress, firstSubject: c.firstSubject };
  return checkOutboundEmail(mail, ctx, { maxFollowUpWords: HOT_MAX_WORDS });
}

// ---------------------------------------------------------------------------
// Eligibility (pure)

export interface HotFacts {
  lead: Pick<LeadRow, "status" | "clickedAt" | "repliedAt" | "signedUpAt" | "paidAt" | "userId" | "workspaceId" | "purgedAt" | "email" | "emailCheck" | "timezone" | "system" | "voiceStatus">;
  /** First human-verified view of the gift page (AdsEvent gift_viewed, props.human = true). */
  humanAt: Date | null;
  /** The step-1 cold email (kind sequence). */
  firstSend: { mailboxId: string; sentAt: Date; messageId: string; subject: string } | null;
  /** A hot_followup send already exists for the lead. */
  hotSent: boolean;
  suppressed: boolean;
}

function localHour(d: Date, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")?.value ?? "0");
}

/** Why this lead may not get a hot follow-up right now, or null when it may. */
export function hotSkipReason(f: HotFacts, now: Date): string | null {
  const { lead } = f;
  if (lead.system) return "growth-system lead";
  if (lead.purgedAt) return "purged";
  if (!lead.email.trim()) return "no email";
  if (!isSendableCheck(lead.emailCheck)) return "email not verified";
  if (!lead.clickedAt) return "not clicked";
  if (isStopped(lead.status)) return `status ${lead.status}`;
  if (lead.repliedAt) return "replied";
  if (lead.signedUpAt || lead.userId || lead.workspaceId) return "signed up";
  if (lead.paidAt) return "paid";
  if (lead.voiceStatus && (VOICE_STOP_STATUSES as readonly string[]).includes(lead.voiceStatus)) return `voice ${lead.voiceStatus}`;
  if (f.suppressed) return "suppressed";
  if (f.hotSent) return "already sent";
  if (!f.firstSend) return "no original send";
  if (!f.humanAt) return "no human-verified view";
  try {
    if (f.humanAt.getTime() - f.firstSend.sentAt.getTime() < MIN_VIEW_AFTER_SEND_MS) return "view too soon after send (scanner)";
    const h = localHour(f.humanAt, lead.timezone);
    if (h >= QUIET_VIEW_HOURS.from && h < QUIET_VIEW_HOURS.to) return "view in the middle of the night (sandbox)";
    const age = now.getTime() - f.humanAt.getTime();
    if (age < HOT_MIN_WAIT_MS) return "too soon (under 20 min)";
    if (age > HOT_MAX_AGE_MS) return "too old (over 72 h)";
    if (!inBusinessHours(now, lead.timezone)) return "outside recipient business hours";
  } catch {
    return "bad timezone";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tick

export interface HotRuntime {
  /** Dry run: leads already logged, so a 72 h window is not logged every minute. */
  logged: Set<string>;
  /** leadId -> retry not before (ms). */
  backoff: Map<string, number>;
}

export function createHotRuntime(): HotRuntime {
  return { logged: new Set(), backoff: new Map() };
}

export interface HotDeps {
  db: Db;
  env?: NodeJS.ProcessEnv;
  now: Date;
  /** The tick's loaded mailboxes (same objects the sender uses: lastSentAt is updated so its pacing sees our send). */
  boxes: readonly StoredMailbox[];
  transport: (m: MailboxEnv) => Transport;
  warmup?: WarmupSettings;
  rt?: HotRuntime;
  /** The governor's stop reason this tick (governor.ts): while set, nothing is sent. */
  governed?: string | null;
}

export interface HotResult {
  dry: boolean;
  /** Human-verified leads looked at this tick. */
  candidates: number;
  /** Passed every rule except mailbox room (the "would email" set before caps). */
  eligible: number;
  sent: number;
  /** Dry run: who it would email (new since the last log). */
  would: Array<{ leadId: string; business: string; to: string; mailbox: string; viewedAt: string }>;
  /** Eligible but held back by a cap, pacing or a paused mailbox/domain. */
  held: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
}

function bump(m: Record<string, number>, k: string): void {
  m[k] = (m[k] ?? 0) + 1;
}

/** One hot follow-up pass. Returns null when the feature is off. Never sends in dry run; never throws on a single bad lead. */
export async function hotFollowupTick(d: HotDeps): Promise<HotResult | null> {
  const cfg = hotFollowupEnv(d.env);
  if (!cfg.enabled) return null;
  const { db, now } = d;
  const rt = d.rt ?? createHotRuntime();
  const res: HotResult = { dry: cfg.dry, candidates: 0, eligible: 0, sent: 0, would: [], held: {}, skipped: {}, errors: [] };
  if (d.governed) {
    res.held.governor = 1;
    return res;
  }
  const dayStart = sendDayStart(now);
  const doneToday = await db.outboundSend.count({ where: { kind: HOT_FOLLOWUP_KIND, dryRun: false, sentAt: { gte: dayStart } } });
  const budget = Math.min(HOT_MAX_PER_TICK, HOT_DAILY_CAP - doneToday);
  if (budget <= 0) return res;

  // 1. Human-verified views in the window: AdsEvent gift_viewed with props.human = true (earliest per gift).
  const since = new Date(now.getTime() - HOT_MAX_AGE_MS - 3_600_000);
  const events = await db.adsEvent.findMany({ where: { name: "gift_viewed", createdAt: { gte: since }, props: { path: ["human"], equals: true } }, orderBy: { createdAt: "asc" }, take: MAX_HUMAN_EVENTS, select: { createdAt: true, props: true } });
  const humanAt = new Map<string, Date>();
  for (const e of events) {
    const g = (e.props as { giftId?: unknown } | null)?.giftId;
    if (typeof g === "string" && !humanAt.has(g)) humanAt.set(g, e.createdAt);
  }
  if (!humanAt.size) return res;

  // 2. The leads behind those gifts (the DB narrows; hotSkipReason re-checks every rule).
  const leads = await db.outboundLead.findMany({
    where: { giftId: { in: [...humanAt.keys()] }, clickedAt: { not: null }, purgedAt: null, repliedAt: null, signedUpAt: null, paidAt: null, userId: null, system: null, email: { not: "" }, status: { notIn: ["replied", "signed_up", "paid", "bounced", "unsubscribed", "complained", "failed"] } },
    take: MAX_LEADS,
  });
  res.candidates = leads.length;
  if (!leads.length) return res;
  const leadIds = leads.map((l) => l.id);
  const sends = await db.outboundSend.findMany({ where: { leadId: { in: leadIds }, dryRun: false, kind: { in: [SEQUENCE_KIND, HOT_FOLLOWUP_KIND] } }, orderBy: { sentAt: "asc" }, select: { leadId: true, kind: true, step: true, messageId: true, subject: true, mailboxId: true, sentAt: true } });
  const firstSend = new Map<string, NonNullable<HotFacts["firstSend"]>>();
  const hotSent = new Set<string>();
  for (const s of sends) {
    if (s.kind === HOT_FOLLOWUP_KIND) hotSent.add(s.leadId);
    else if (s.step === 1 && !firstSend.has(s.leadId)) firstSend.set(s.leadId, s);
  }
  const sup = new Set((await db.outboundSuppression.findMany({ where: { value: { in: [...new Set(leads.flatMap((l) => [l.email.toLowerCase(), l.domain]))] } }, select: { value: true } })).map((s) => s.value));

  const ready: Array<{ lead: LeadRow; at: Date; first: NonNullable<HotFacts["firstSend"]> }> = [];
  for (const lead of leads) {
    const at = lead.giftId ? humanAt.get(lead.giftId) ?? null : null;
    const first = firstSend.get(lead.id) ?? null;
    const why = hotSkipReason({ lead, humanAt: at, firstSend: first, hotSent: hotSent.has(lead.id), suppressed: isSuppressed(lead.email, sup) }, now);
    if (why || !at || !first) {
      bump(res.skipped, why ?? "incomplete");
      continue;
    }
    if ((rt.backoff.get(lead.id) ?? 0) > now.getTime()) {
      bump(res.held, "retry backoff");
      continue;
    }
    ready.push({ lead, at, first });
  }
  res.eligible = ready.length;
  if (!ready.length) return res;
  ready.sort((a, b) => a.at.getTime() - b.at.getTime() || a.lead.id.localeCompare(b.lead.id)); // closest to expiring first

  // 3. Mailbox room: the same pacing, daily cap, warm-up gate and domain cap the cold sender uses.
  const boxById = new Map(d.boxes.map((b) => [b.id, b]));
  const wanted = [...new Set(ready.map((r) => boxById.get(r.first.mailboxId)).filter((b): b is StoredMailbox => Boolean(b)))];
  const domains = [...new Set(wanted.map((b) => b.domain))];
  const sameDomain = d.boxes.filter((b) => domains.includes(b.domain));
  const ids = sameDomain.map((b) => b.id);
  const today = { mailboxId: { in: ids }, dryRun: false, kind: { in: CAPPED_KINDS }, sentAt: { gte: dayStart } };
  const [counts, lastIds, domainRows, gates] = ids.length
    ? await Promise.all([
        db.outboundSend.groupBy({ by: ["mailboxId"], where: today, _count: { _all: true } }),
        db.outboundSend.findMany({ where: today, orderBy: { sentAt: "desc" }, distinct: ["mailboxId"], select: { id: true, mailboxId: true } }),
        db.outboundDomain.findMany({ where: { domain: { in: domains } } }),
        d.warmup ? warmupGates(db, d.warmup, sameDomain, now) : Promise.resolve(new Map()),
      ])
    : [[], [], [], new Map()];
  const sentBy = new Map(counts.map((c) => [c.mailboxId, c._count._all]));
  const lastId = new Map(lastIds.map((s) => [s.mailboxId, s.id]));
  const domainOf = new Map(domainRows.map((r) => [r.domain, r]));
  const domainSent = new Map<string, number>();
  for (const b of sameDomain) domainSent.set(b.domain, (domainSent.get(b.domain) ?? 0) + (sentBy.get(b.id) ?? 0));
  const usedThisTick = new Set<string>();

  let left = budget;
  for (const { lead, at, first } of ready) {
    if (left <= 0) {
      bump(res.held, "daily/tick cap");
      continue;
    }
    const m = boxById.get(first.mailboxId);
    if (!m) {
      bump(res.held, "original mailbox not loaded");
      continue;
    }
    const dom = domainOf.get(m.domain);
    if (dom?.paused) {
      bump(res.held, "domain paused");
      continue;
    }
    if (usedThisTick.has(m.id)) {
      bump(res.held, "mailbox gap");
      continue;
    }
    const warmup = gates.get(m.id) ?? null;
    const pace = canSendNow({ warmup, paused: m.row.paused, dailyCap: m.row.dailyCap, warmupStartedAt: m.row.warmupStartedAt, provider: m.provider, readyAt: warmup ? null : m.row.readyAt, lastSentAt: m.row.lastSentAt, sentToday: sentBy.get(m.id) ?? 0, gapMs: lastId.get(m.id) ? sendGapMs(fraction(lastId.get(m.id)!)) : 0 }, now);
    if (!pace.ok) {
      bump(res.held, `mailbox ${pace.reason}`);
      continue;
    }
    if ((domainSent.get(m.domain) ?? 0) >= (dom?.dailyCap ?? DEFAULT_DOMAIN_DAILY_CAP)) {
      bump(res.held, "domain daily cap");
      continue;
    }
    const cfgEnv = outboundEnv(d.env);
    const copy: HotCopyContext = { businessName: lead.businessName, claimUrl: claimLink(cfgEnv.base, lead.claimToken), unsubscribeUrl: unsubscribeLink(cfgEnv.base, lead.unsubToken), postalAddress: cfgEnv.postalAddress, firstSubject: first.subject, senderName: m.name };
    const mail = buildHotFollowup(copy);
    const bad = checkHotFollowup(mail, copy);
    if (bad) {
      rt.backoff.set(lead.id, now.getTime() + 6 * 3_600_000);
      res.errors.push(`${lead.id}: copy guard: ${bad}`);
      bump(res.held, "copy guard");
      continue;
    }
    if (cfg.dry) {
      if (!rt.logged.has(lead.id)) {
        rt.logged.add(lead.id);
        res.would.push({ leadId: lead.id, business: lead.businessName, to: lead.email, mailbox: m.address, viewedAt: at.toISOString() });
      }
      usedThisTick.add(m.id);
      sentBy.set(m.id, (sentBy.get(m.id) ?? 0) + 1);
      domainSent.set(m.domain, (domainSent.get(m.domain) ?? 0) + 1);
      left--;
      continue;
    }
    const messageId = `<${randomUUID()}@${m.address.split("@")[1] ?? "getkomendly.com"}>`;
    // Claim first (at most one hot follow-up per lead, even across a crash); undone below if SMTP refuses.
    let claim: { id: string } | null = null;
    try {
      claim = await db.outboundSend.create({ data: { leadId: lead.id, mailboxId: m.id, step: 2, messageId, toEmail: lead.email, subject: mail.subject, body: mail.text, copySource: "fallback", sentAt: now, kind: HOT_FOLLOWUP_KIND, armIds: [] }, select: { id: true } });
      await d.transport(m)({ from: `"${m.name}" <${m.address}>`, to: lead.email, subject: mail.subject, text: mail.text, html: null, messageId, headers: { ...unsubscribeHeaders(copy.unsubscribeUrl, m.address), "In-Reply-To": first.messageId, References: first.messageId } });
    } catch (e) {
      if (claim) await db.outboundSend.delete({ where: { id: claim.id } }).catch(() => undefined);
      rt.backoff.set(lead.id, now.getTime() + HOT_RETRY_BACKOFF_MS);
      res.errors.push(`${lead.id}: ${errMsg(e).slice(0, 200)}`);
      continue;
    }
    await db.$transaction([
      db.outboundMailbox.update({ where: { id: m.id }, data: { lastSentAt: now, sentTotal: { increment: 1 } } }),
      db.adsEvent.create({ data: { name: HOT_EVENT, props: { leadId: lead.id, mailbox: m.address } as Prisma.InputJsonValue } }),
    ]).catch((e: unknown) => res.errors.push(`${lead.id}: bookkeeping: ${errMsg(e).slice(0, 200)}`));
    m.row.lastSentAt = now;
    usedThisTick.add(m.id);
    sentBy.set(m.id, (sentBy.get(m.id) ?? 0) + 1);
    domainSent.set(m.domain, (domainSent.get(m.domain) ?? 0) + 1);
    left--;
    res.sent++;
  }
  return res;
}

/** Loop wrapper: runs the tick and logs what matters (dry run: each new would-email; live: sends and errors). */
export async function hotFollowupStep(d: HotDeps): Promise<HotResult | null> {
  const r = await hotFollowupTick(d);
  if (!r) return null;
  for (const w of r.would) log("info", "kly hot follow-up (dry run): would email", { ...w });
  if (r.sent || r.errors.length) log(r.errors.length ? "warn" : "info", "kly hot follow-up", { sent: r.sent, eligible: r.eligible, held: r.held, errors: r.errors });
  return r;
}
