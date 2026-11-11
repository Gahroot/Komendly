// Cold outbound ("I made you a free ad"): pure rules shared by the engine (sender, finder, IMAP) and the web
// (admin, claim/unsubscribe routes). No DB, no I/O, no clock reads: callers pass `now`.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Statuses

export const LEAD_STATUSES = ["found", "ad_made", "queued", "sent", "opened", "clicked", "replied", "signed_up", "paid", "bounced", "unsubscribed", "complained", "failed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
/** No more email to a lead in one of these. */
export const STOP_STATUSES: readonly LeadStatus[] = ["replied", "signed_up", "paid", "bounced", "unsubscribed", "complained", "failed"];

export function isStopped(status: string): boolean {
  return (STOP_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Mailboxes (env only: passwords never touch the DB)

export const MailboxEnvSchema = z.object({
  address: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(60),
  user: z.string().trim().min(1).optional(),
  appPassword: z.string().min(8),
  smtpHost: z.string().default("smtp.gmail.com"),
  smtpPort: z.number().int().default(465),
  imapHost: z.string().default("imap.gmail.com"),
  imapPort: z.number().int().default(993),
  dailyCap: z.number().int().min(1).max(200).optional(),
});
export type MailboxEnv = z.infer<typeof MailboxEnvSchema> & { user: string };

export type ParsedMailboxes = { ok: true; mailboxes: MailboxEnv[] } | { ok: false; error: string };

/** OUTBOUND_MAILBOXES='[{"address":"nolan@getkomendly.com","name":"Nolan Grout","appPassword":"xxxx xxxx xxxx xxxx"}]' */
export function parseMailboxes(raw: string | undefined): ParsedMailboxes {
  if (!raw?.trim()) return { ok: true, mailboxes: [] };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "OUTBOUND_MAILBOXES is not valid JSON" };
  }
  const parsed = z.array(MailboxEnvSchema).safeParse(json);
  if (!parsed.success) return { ok: false, error: `OUTBOUND_MAILBOXES: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  return { ok: true, mailboxes: parsed.data.map((m) => ({ ...m, user: m.user ?? m.address })) };
}

// ---------------------------------------------------------------------------
// Pacing / warm-up

export const DEFAULT_DAILY_CAP = 40;
export const WARMUP_FLAT_DAYS = 3;
export const WARMUP_START_PER_DAY = 5;
export const WARMUP_STEP_PER_DAY = 3;
export const MIN_GAP_MS = 3 * 60_000;
export const MAX_GAP_MS = 9 * 60_000;
export const FOLLOW_UP_AFTER_MS = 4 * 86_400_000;
export const MAX_STEPS = 2;

/** Today's send limit: 5/day on days 1-3 of warm-up, then +3/day up to the cap. */
export function warmupLimit(warmupStartedAt: Date, now: Date, cap: number = DEFAULT_DAILY_CAP): number {
  const day = Math.max(1, Math.floor((now.getTime() - warmupStartedAt.getTime()) / 86_400_000) + 1);
  const ramp = day <= WARMUP_FLAT_DAYS ? WARMUP_START_PER_DAY : WARMUP_START_PER_DAY + WARMUP_STEP_PER_DAY * (day - WARMUP_FLAT_DAYS);
  return Math.max(0, Math.min(cap, ramp));
}

/** Random gap between two sends from the same mailbox; `rand` in [0,1). */
export function sendGapMs(rand: number): number {
  const r = Math.min(Math.max(rand, 0), 0.999999);
  return Math.round(MIN_GAP_MS + r * (MAX_GAP_MS - MIN_GAP_MS));
}

/** Weekday 9:00-16:59 in the lead's time zone. */
export function inBusinessHours(now: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return !["Sat", "Sun"].includes(wd) && hour >= 9 && hour < 17;
}

export interface MailboxPace {
  paused: boolean;
  dailyCap: number;
  warmupStartedAt: Date;
  lastSentAt: Date | null;
  sentToday: number;
  /** Gap chosen after the last send (ms). */
  gapMs: number;
}

export type PaceDecision = { ok: true } | { ok: false; reason: "paused" | "daily_limit" | "gap" };

export function canSendNow(m: MailboxPace, now: Date): PaceDecision {
  if (m.paused) return { ok: false, reason: "paused" };
  if (m.sentToday >= warmupLimit(m.warmupStartedAt, now, m.dailyCap)) return { ok: false, reason: "daily_limit" };
  if (m.lastSentAt && now.getTime() - m.lastSentAt.getTime() < m.gapMs) return { ok: false, reason: "gap" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Health / auto-pause

export const HEALTH_WINDOW = 100;
export const MAX_BOUNCE_RATE = 0.03;

/** Over the last 100 sends: any complaint, or bounce rate > 3% -> pause reason; else null. */
export function autoPauseReason(recent: ReadonlyArray<{ bounced: boolean; complained: boolean }>): string | null {
  const w = recent.slice(0, HEALTH_WINDOW);
  if (w.length === 0) return null;
  const complaints = w.filter((s) => s.complained).length;
  if (complaints > 0) return `spam complaint (${complaints} in last ${w.length})`;
  const bounces = w.filter((s) => s.bounced).length;
  const rate = bounces / w.length;
  return rate > MAX_BOUNCE_RATE ? `bounce rate ${(rate * 100).toFixed(1)}% over last ${w.length} sends` : null;
}

// ---------------------------------------------------------------------------
// Sequence

export interface LeadSeq {
  status: string;
  step: number;
  lastSentAt: Date | null;
  clickedAt: Date | null;
  repliedAt: Date | null;
}

/** Which step to send next, or null: first email once the ad is made; one follow-up 4 days later if no reply/click; then stop. */
export function nextStep(l: LeadSeq, now: Date): 1 | 2 | null {
  if (isStopped(l.status) || l.repliedAt) return null;
  if (l.step === 0) return l.status === "ad_made" || l.status === "queued" ? 1 : null;
  if (l.step === 1) {
    if (l.clickedAt || l.status === "clicked") return null;
    if (!l.lastSentAt || now.getTime() - l.lastSentAt.getTime() < FOLLOW_UP_AFTER_MS) return null;
    return 2;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Domains, suppression, emails

const MULTI = new Set(["co.uk", "org.uk", "com.au", "net.au", "co.nz", "com.br", "co.za", "com.mx", "co.jp", "co.in"]);

export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().trim().replace(/\.$/, "").replace(/^www\./, "");
  const parts = host.split(".");
  return parts.slice(-(MULTI.has(parts.slice(-2).join(".")) ? 3 : 2)).join(".");
}

export function domainOfUrl(url: string): string | null {
  try {
    return registrableDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}

export function emailDomain(email: string): string {
  return registrableDomain(email.split("@")[1] ?? "");
}

/** Suppressed when the address itself or its registrable domain is on the list. */
export function isSuppressed(email: string, suppressed: ReadonlySet<string>): boolean {
  const e = email.trim().toLowerCase();
  return suppressed.has(e) || suppressed.has(emailDomain(e));
}

export const WEBMAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "aol.com", "icloud.com", "me.com", "msn.com", "proton.me", "protonmail.com", "comcast.net", "att.net", "ymail.com"]);

const ROLE = ["info", "contact", "office", "hello", "sales", "service", "estimates", "estimate", "admin", "team", "support", "help", "inquiries", "inquiry", "quotes", "quote", "roofing", "mail", "booking", "bookings", "customerservice", "frontdesk"];
const NEVER = /^(noreply|no-reply|donotreply|do-not-reply|postmaster|abuse|webmaster|hostmaster|privacy|legal|careers|jobs|hr|billing|accounting|ap|ar|invoices|press|media|marketing|unsubscribe|bounce|example|test|email|name|user|you|your|yourname|someone)$/;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

/**
 * Public business addresses on the business's OWN site: mailto links and plain text in the page HTML, kept only when
 * the address is on the site's own registrable domain (never guessed, never third-party / webmail / no-reply / file names).
 * Role addresses first (info@, office@...), then others; de-duplicated.
 */
export function extractOwnEmails(html: string, siteDomain: string): string[] {
  const own = registrableDomain(siteDomain);
  const decoded = html.replace(/&#64;|&#x40;|%40/gi, "@").replace(/&#46;|&#x2e;/gi, ".");
  const found = new Set<string>();
  for (const m of decoded.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/^mailto:/, "").replace(/\.+$/, "");
    const [local = "", dom = ""] = e.split("@");
    if (!local || !dom || /\.(png|jpe?g|gif|webp|svg|css|js)$/.test(dom)) continue;
    if (registrableDomain(dom) !== own || WEBMAIL.has(dom)) continue;
    if (NEVER.test(local) || /^[0-9a-f]{16,}$/.test(local)) continue;
    found.add(e);
  }
  const rank = (e: string) => {
    const i = ROLE.indexOf(e.split("@")[0] ?? "");
    return i === -1 ? ROLE.length : i;
  };
  return [...found].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Contact-ish links on the same site worth fetching for an email (contact, about, footer pages). */
export function contactLinks(html: string, base: string, max = 3): string[] {
  const own = domainOfUrl(base);
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1] ?? "";
    const text = (m[2] ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
    if (!/contact|about|get.?in.?touch|reach|quote|estimate/.test(`${href.toLowerCase()} ${text}`)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || registrableDomain(u.hostname) !== own) continue;
    u.hash = "";
    const s = u.toString();
    if (!out.includes(s) && s !== base) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Time zones (US): state first, longitude fallback.

const TZ_BY_STATE: Record<string, string> = {
  CA: "America/Los_Angeles", WA: "America/Los_Angeles", OR: "America/Los_Angeles", NV: "America/Los_Angeles",
  AZ: "America/Phoenix", CO: "America/Denver", UT: "America/Denver", NM: "America/Denver", MT: "America/Denver", WY: "America/Denver", ID: "America/Boise",
  TX: "America/Chicago", OK: "America/Chicago", KS: "America/Chicago", NE: "America/Chicago", MN: "America/Chicago", IA: "America/Chicago", MO: "America/Chicago",
  AR: "America/Chicago", LA: "America/Chicago", MS: "America/Chicago", AL: "America/Chicago", TN: "America/Chicago", WI: "America/Chicago", IL: "America/Chicago",
  ND: "America/Chicago", SD: "America/Chicago", HI: "Pacific/Honolulu", AK: "America/Anchorage",
};

export function timezoneFor(state: string | null | undefined, lon: number | null | undefined): string {
  const s = state?.trim().toUpperCase();
  if (s && TZ_BY_STATE[s]) return TZ_BY_STATE[s];
  if (s && s.length === 2) return "America/New_York";
  if (typeof lon === "number") {
    if (lon < -114.5) return "America/Los_Angeles";
    if (lon < -102) return "America/Denver";
    if (lon < -87) return "America/Chicago";
  }
  return "America/New_York";
}
