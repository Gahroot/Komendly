// Competitor ad watch (growth system ad_watch): opt-in weekly email "N new ads your competitors launched this week",
// each with "Make my version" -> /remix prefilled with that ad (utm_source=ad_watch). Double opt-in, one-click
// unsubscribe, no email in a week with nothing new. Pure logic shared by web (routes) and engine (Monday loop).
// node:crypto only (signed links); no Next/Prisma imports. Engine runner: engine/src/growth/ad-watch.ts.
//
// Data model (no schema change): everything is an AdsEvent row, props JSON:
//   ad_watch_subscribed   {email, trade, city, pages[], source}          id = subscription id (subId)
//   ad_watch_confirmed    {subId, email}                                  double opt-in link clicked
//   ad_watch_unsubscribed {subId?, email, via}                            kills every sub of that email created before it
//   ad_watch_sent         {subId, email, week, adIds[], pageIds[]}       claimed before sending (one per sub per ISO week)
//   ad_watch_skipped      {subId, email, week, reason}                    week closed without email (nothing new / gate)
import { DEFAULT_POSTAL_ADDRESS } from "../ads/outbound/copy";
import crypto from "node:crypto";
import { withSystemUtm } from "./systems";
import type { LifecycleEmailInput } from "../ads/lifecycle/template";

export const AD_WATCH_SYSTEM = "ad_watch" as const;
export const AD_WATCH_EVENTS = {
  subscribed: "ad_watch_subscribed",
  confirmed: "ad_watch_confirmed",
  unsubscribed: "ad_watch_unsubscribed",
  sent: "ad_watch_sent",
  skipped: "ad_watch_skipped",
} as const;
export const AD_WATCH_EVENT_NAMES = Object.values(AD_WATCH_EVENTS);
export const AD_WATCH_MAX_PAGES = 5;
export const AD_WATCH_MAX_ADS = 3;
/** Monday send time (UTC): 13:00 UTC = 8-9am US Eastern. Later in the same ISO week = catch-up after downtime. */
export const AD_WATCH_SEND_HOUR_UTC = 13;
export const AD_WATCH_CONFIRM_TTL_DAYS = 7;
/** Komendly's CAN-SPAM postal identity: same default as Kly (OUTBOUND_POSTAL_ADDRESS overrides). */
export const AD_WATCH_POSTAL_DEFAULT = DEFAULT_POSTAL_ADDRESS;

/** The true public offer (review-gate HARD_RULES). Shown in every weekly email footer. */
export const AD_WATCH_OFFER =
  "Komendly's Ozzy Ad Department makes ads for your business, puts them live in your own Meta account and replaces the losers every week: $97 the first month, then $197/month, cancel anytime. Or start with a free pack of 10 ads.";

// Scanner contract lives in ./adlib-scan (type-only import: erased at runtime).
import type { AdlibAd, AdlibPageScan } from "./adlib-scan";
export type { AdlibAd, AdlibPageScan };

// ---------------------------------------------------------------------------------------------------------------
// Input

export interface AdWatchInput { email: string; trade: string; city: string; pages: string[] }

/** One rival Facebook Page: a facebook.com/fb.com page URL (incl. profile.php?id=) or a numeric page id. Null = invalid. */
export function normalizeFbPage(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 300 || /\s/.test(t)) return null;
  if (/^\d{5,20}$/.test(t)) return t;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const host = u.hostname.toLowerCase().replace(/^(www|m|web|business)\./, "");
    if (host !== "facebook.com" && host !== "fb.com") return null;
    const id = u.searchParams.get("id");
    if (/^\/profile\.php$/i.test(u.pathname)) return id && /^\d{5,20}$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null;
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg[0]?.toLowerCase() === "pages") seg.splice(0, seg.length >= 3 ? 2 : 1); // /pages/<name>/<id>
    const slug = seg[0];
    if (!slug || !/^[A-Za-z0-9.\-_]{2,100}$/.test(slug) || ["ads", "groups", "events", "watch", "marketplace", "login", "share", "sharer.php", "home.php"].includes(slug.toLowerCase())) return null;
    return `https://www.facebook.com/${slug}`;
  } catch {
    return null;
  }
}

export function parseAdWatchInput(raw: unknown): { ok: true; input: AdWatchInput } | { ok: false; error: string } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const email = str(o.email, 254).toLowerCase();
  if (!/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(email)) return { ok: false, error: "Enter a valid email address." };
  const trade = str(o.trade, 60);
  if (trade.length < 2) return { ok: false, error: "Tell us your trade (e.g. plumber, roofer, dentist)." };
  const city = str(o.city, 80);
  if (city.length < 2) return { ok: false, error: "Tell us your city." };
  const list = Array.isArray(o.pages) ? o.pages : typeof o.pages === "string" ? o.pages.split(/[\n,]+/) : [];
  const raws = list.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  if (!raws.length) return { ok: false, error: "Add at least one competitor's Facebook Page." };
  if (raws.length > AD_WATCH_MAX_PAGES) return { ok: false, error: `Up to ${AD_WATCH_MAX_PAGES} competitor Pages.` };
  const pages: string[] = [];
  for (const p of raws) {
    const n = normalizeFbPage(p);
    if (!n) return { ok: false, error: `"${p.trim().slice(0, 60)}" isn't a Facebook Page link. Use e.g. facebook.com/theirbusiness.` };
    if (!pages.includes(n)) pages.push(n);
  }
  return { ok: true, input: { email, trade, city, pages } };
}

// ---------------------------------------------------------------------------------------------------------------
// Signed links (confirm / unsubscribe). HMAC with LIFECYCLE_EMAIL_SECRET (shared by web + engine).

export type AdWatchToken = { a: "confirm"; s: string; e: number } | { a: "unsub"; s: string };

const mac = (secret: string, body: string) => crypto.createHmac("sha256", `ad_watch:${secret}`).update(body).digest("base64url");

export function signAdWatchToken(t: AdWatchToken, secret: string): string {
  if (!secret) throw new Error("LIFECYCLE_EMAIL_SECRET unset");
  const body = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

export function verifyAdWatchToken(token: string, secret: string, now: Date = new Date()): AdWatchToken | null {
  const [body, sig, extra] = (token ?? "").split(".");
  if (!body || !sig || extra !== undefined || !secret) return null;
  const a = Buffer.from(mac(secret, body));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof p.s !== "string" || !p.s) return null;
    if (p.a === "unsub") return { a: "unsub", s: p.s };
    if (p.a === "confirm" && typeof p.e === "number") return p.e * 1000 > now.getTime() ? { a: "confirm", s: p.s, e: p.e } : null;
  } catch {
    return null;
  }
  return null;
}

export const confirmToken = (subId: string, secret: string, now = new Date()) =>
  signAdWatchToken({ a: "confirm", s: subId, e: Math.floor(now.getTime() / 1000) + AD_WATCH_CONFIRM_TTL_DAYS * 86_400 }, secret);
export const adWatchConfirmUrl = (base: string, subId: string, secret: string, now = new Date()) => `${base}/api/ad-watch/confirm?t=${confirmToken(subId, secret, now)}`;
export const adWatchUnsubscribeUrl = (base: string, subId: string, secret: string) => `${base}/api/ad-watch/unsubscribe?t=${signAdWatchToken({ a: "unsub", s: subId }, secret)}`;

// ---------------------------------------------------------------------------------------------------------------
// Week keys (ISO 8601, UTC)

export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); // Thursday of this week decides the year
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday 00:00 UTC of d's ISO week. */
export function weekStart(d: Date): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() || 7) - 1));
  return t;
}

/** This week's send moment (Monday 13:00 UTC). */
export const weekSendAt = (d: Date) => new Date(weekStart(d).getTime() + AD_WATCH_SEND_HOUR_UTC * 3_600_000);

// ---------------------------------------------------------------------------------------------------------------
// Subscription state from AdsEvent rows

export interface AdWatchEventRow { id: string; name: string; createdAt: Date | string; userId?: string | null; props: unknown }

export interface AdWatchSub {
  subId: string;
  email: string;
  trade: string;
  city: string;
  pages: string[];
  userId: string | null;
  subscribedAt: Date;
  confirmedAt: Date;
  /** Ads already emailed to this subscription (never repeated). */
  seen: Set<string>;
  /** ISO weeks already done (sent or skipped). */
  weeksDone: Set<string>;
  lastSentAt: Date | null;
}

const P = (e: AdWatchEventRow) => (e.props && typeof e.props === "object" ? e.props : {}) as Record<string, unknown>;
const T = (e: AdWatchEventRow) => new Date(e.createdAt);
const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/** Latest unsubscribe per email. */
function unsubs(events: AdWatchEventRow[]): Map<string, Date> {
  const m = new Map<string, Date>();
  for (const e of events) {
    if (e.name !== AD_WATCH_EVENTS.unsubscribed) continue;
    const em = lower(P(e).email);
    if (em && (!m.has(em) || m.get(em)! < T(e))) m.set(em, T(e));
  }
  return m;
}

/** True when an unsubscribe for this email came after the subscription was requested (opt-out wins). */
export function optedOut(events: AdWatchEventRow[], email: string, since: Date): boolean {
  const u = unsubs(events).get(email.trim().toLowerCase());
  return Boolean(u && u >= since);
}

/**
 * Active subscriptions: confirmed (double opt-in), not opted out after they were requested, and only the newest
 * confirmed subscription per email (a re-subscribe replaces the old competitor list).
 */
export function activeSubscriptions(events: AdWatchEventRow[]): AdWatchSub[] {
  const out = unsubs(events);
  const confirmed = new Map<string, Date>();
  for (const e of events) {
    if (e.name !== AD_WATCH_EVENTS.confirmed) continue;
    const s = P(e).subId;
    if (typeof s === "string" && !confirmed.has(s)) confirmed.set(s, T(e));
  }
  const byEmail = new Map<string, AdWatchSub>();
  for (const e of events) {
    if (e.name !== AD_WATCH_EVENTS.subscribed) continue;
    const p = P(e);
    const email = lower(p.email);
    const confirmedAt = confirmed.get(e.id);
    const pages = Array.isArray(p.pages) ? p.pages.filter((x): x is string => typeof x === "string" && x !== "").slice(0, AD_WATCH_MAX_PAGES) : [];
    if (!email || !confirmedAt || !pages.length) continue;
    const u = out.get(email);
    if (u && u >= T(e)) continue;
    const prev = byEmail.get(email);
    if (prev && prev.subscribedAt >= T(e)) continue;
    byEmail.set(email, { subId: e.id, email, trade: String(p.trade ?? ""), city: String(p.city ?? ""), pages, userId: e.userId ?? null, subscribedAt: T(e), confirmedAt, seen: new Set(), weeksDone: new Set(), lastSentAt: null });
  }
  const subs = new Map([...byEmail.values()].map((s) => [s.subId, s]));
  for (const e of events) {
    if (e.name !== AD_WATCH_EVENTS.sent && e.name !== AD_WATCH_EVENTS.skipped) continue;
    const p = P(e);
    const s = typeof p.subId === "string" ? subs.get(p.subId) : undefined;
    if (!s) continue;
    if (typeof p.week === "string") s.weeksDone.add(p.week);
    if (e.name === AD_WATCH_EVENTS.sent) {
      for (const id of Array.isArray(p.adIds) ? p.adIds : []) if (typeof id === "string") s.seen.add(id);
      if (!s.lastSentAt || s.lastSentAt < T(e)) s.lastSentAt = T(e);
    }
  }
  return [...subs.values()];
}

/** The ISO week this subscription should get its email for now, or null (not Monday 13:00 UTC yet / already done). */
export function adWatchDueWeek(sub: Pick<AdWatchSub, "weeksDone" | "confirmedAt">, now: Date): string | null {
  const week = isoWeekKey(now);
  if (sub.weeksDone.has(week)) return null;
  if (now < weekSendAt(now) || sub.confirmedAt > now) return null;
  return week;
}

// ---------------------------------------------------------------------------------------------------------------
// New since last send

export interface PickedAd extends AdlibAd { pageId: string; pageName: string }

/** Ads to show: started in the last 8 days, never emailed to this sub before, newest first, spread across rivals. */
export function pickNewAds(scans: AdlibPageScan[], seen: ReadonlySet<string>, now: Date, max = AD_WATCH_MAX_ADS): PickedAd[] {
  const since = now.getTime() - 8 * 86_400_000;
  const perPage = scans.map((s) => {
    const ids = new Set<string>();
    return s.liveAds
      .filter((a) => {
        const t = Date.parse(a.startedAt);
        if (!a.adArchiveId || seen.has(a.adArchiveId) || ids.has(a.adArchiveId) || !Number.isFinite(t) || t < since || t > now.getTime() + 86_400_000 || !a.snapshotUrl) return false;
        ids.add(a.adArchiveId);
        return true;
      })
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .map((a) => ({ ...a, pageId: s.pageId, pageName: s.pageName }));
  });
  const out: PickedAd[] = [];
  const taken = new Set<string>();
  for (let round = 0; out.length < max; round++) {
    const batch = perPage.map((l) => l[round]).filter((a): a is PickedAd => Boolean(a));
    if (!batch.length) break;
    for (const a of batch.sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt))) {
      if (out.length >= max) break;
      if (taken.has(a.adArchiveId)) continue;
      taken.add(a.adArchiveId);
      out.push(a);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Email copy

export function remixLink(base: string, snapshotUrl: string, week: string): string {
  return withSystemUtm(`${base}/remix?ad=${encodeURIComponent(snapshotUrl)}`, AD_WATCH_SYSTEM, { medium: "email", campaign: week, content: "make_my_version" });
}

function clip(s: string | undefined, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

const FORMAT: Record<AdlibAd["format"], string> = { image: "Image ad", video: "Video ad", carousel: "Carousel ad", unknown: "Ad" };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function adWatchSubject(n: number): string {
  return n === 1 ? "1 new ad your competitors launched this week" : `${n} new ads your competitors launched this week`;
}

export interface WeeklyEmail { subject: string; input: LifecycleEmailInput; /** Our own words only (competitor quotes masked) for the deterministic precheck. */ ownText: string; facts: string }

/**
 * detail "full": format, start date, days live and a short quote per ad. "minimal" (the one revision after a review
 * rejection): only the rival's name, the format and the link, so there is nothing left to be inaccurate about.
 */
export function buildWeeklyEmail(o: { base: string; sub: Pick<AdWatchSub, "subId" | "trade" | "city">; ads: PickedAd[]; week: string; unsubscribeUrl: string; postalAddress?: string; detail?: "full" | "minimal" }): WeeklyEmail {
  const minimal = o.detail === "minimal";
  const { base, ads, week, sub } = o;
  const subject = adWatchSubject(ads.length);
  const rivals = [...new Set(ads.map((a) => a.pageName))];
  const offerHref = withSystemUtm(`${base}/ads/pricing`, AD_WATCH_SYSTEM, { medium: "email", campaign: week, content: "offer" });
  const quote = (a: PickedAd) => clip(a.headline || a.body, 140);
  const item = (a: PickedAd, masked: boolean) => {
    if (minimal) return { text: `${a.pageName} · ${FORMAT[a.format]}`, linkLabel: "Make my version", href: remixLink(base, a.snapshotUrl, week) };
    const q = quote(a);
    const days = a.runDays >= 1 ? `, live ${a.runDays} day${a.runDays === 1 ? "" : "s"}` : "";
    return { text: `${a.pageName} · ${FORMAT[a.format]} started ${fmtDate(a.startedAt)}${days}${q ? `: "${masked ? "[competitor ad text]" : q}"` : ""}`, linkLabel: "Make my version", href: remixLink(base, a.snapshotUrl, week) };
  };
  const intro = `Here ${ads.length === 1 ? "is the new ad" : `are ${ads.length} new ads`} from ${rivals.join(", ")} that started running on Facebook and Instagram in the last week.`;
  const paragraphs = [
    intro,
    `Like one? Tap "Make my version" and Ozzy rebuilds its hook and style for your ${sub.trade || "business"}${sub.city ? ` in ${sub.city}` : ""}, with your own brand. Nothing is copied word for word.`,
  ];
  const postal = o.postalAddress || AD_WATCH_POSTAL_DEFAULT;
  const footer = `Competitor ad watch by Komendly. You get this because you confirmed it at komendly.com. Komendly, ${postal}.`;
  const make = (masked: boolean): LifecycleEmailInput => ({
    appUrl: base,
    subject,
    preheader: clip(`New from ${rivals.join(", ")}`, 100),
    paragraphs: [...paragraphs, footer],
    cta: { label: "Make my version", href: remixLink(base, ads[0]!.snapshotUrl, week) },
    blocks: [{ title: "New this week", items: ads.map((a) => item(a, masked)) }],
    ps: { text: AD_WATCH_OFFER, linkLabel: "See the Ad Department", href: offerHref },
    unsubscribeUrl: o.unsubscribeUrl,
  });
  const input = make(false);
  const masked = make(true);
  const ownText = [subject, ...masked.paragraphs, ...masked.blocks![0]!.items.map((i) => `${i.text} ${i.linkLabel}: ${i.href}`), `${masked.ps!.text}`, "--", "Ozzy from Komendly", `Unsubscribe: ${o.unsubscribeUrl}`].join("\n\n");
  const facts = [
    `Subscriber trade: ${sub.trade}; city: ${sub.city}. They double-opted-in to this weekly email.`,
    ...ads.map((a) => `Ad ${a.adArchiveId} from Page "${a.pageName}" (${a.pageId}): format ${a.format}, startedAt ${a.startedAt}, runDays ${a.runDays}, headline ${JSON.stringify(a.headline ?? "")}, body ${JSON.stringify(clip(a.body, 300))}, snapshot ${a.snapshotUrl}`),
    `Offer: ${AD_WATCH_OFFER}`,
    `Sender footer postal address: Komendly, ${postal}.`,
  ].join("\n");
  return { subject, input, ownText, facts };
}

export const AD_WATCH_EXTRA_RULES = [
  'Every "Make my version" link must go to komendly.com/remix and carry utm_source=ad_watch.',
  "Competitor ad text is quoted as data, not as Komendly's claims; do not reject an email for what a competitor's ad says.",
  "The email must not suggest Komendly copies a competitor's ad word for word or uses their brand.",
] as const;

// Confirmation (double opt-in) email
export function buildConfirmEmail(o: { base: string; confirmUrl: string; trade: string; city: string; pages: string[] }): { subject: string; text: string; html: string } {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const subject = "Confirm your weekly Competitor ad watch";
  const lines = [
    `You (or someone using this address) asked Komendly to email you every Monday with the new Facebook and Instagram ads these competitors launched:`,
    ...o.pages.map((p) => `- ${p}`),
    `For: ${o.trade} in ${o.city}.`,
    `Confirm here (link valid ${AD_WATCH_CONFIRM_TTL_DAYS} days): ${o.confirmUrl}`,
    "If you didn't ask for this, ignore this email and you won't hear from us. Every weekly email has a one-click unsubscribe.",
    "--\nOzzy from Komendly (komendly.com)",
  ];
  const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:24px;background:#0c0820;color:#fff1d6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#150d2e;border:1px solid #2b1556;border-radius:16px;padding:28px">
<h1 style="font-size:22px;margin:0 0 14px">${esc(subject)}</h1>
<p style="line-height:1.6">You (or someone using this address) asked Komendly to email you every Monday with the new Facebook and Instagram ads these competitors launched:</p>
<ul>${o.pages.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
<p style="line-height:1.6">For: ${esc(o.trade)} in ${esc(o.city)}.</p>
<p><a href="${esc(o.confirmUrl)}" style="display:inline-block;padding:12px 22px;background:#ffcf4a;color:#2a0f10;font-weight:700;border-radius:12px;text-decoration:none">Yes, send me the weekly ad watch</a></p>
<p style="font-size:13px;color:#c9b8e8;line-height:1.6">Link valid ${AD_WATCH_CONFIRM_TTL_DAYS} days. If you didn't ask for this, ignore this email and you won't hear from us. Every weekly email has a one-click unsubscribe.</p>
<p style="font-size:13px;color:#c9b8e8">Ozzy from Komendly · <a href="${esc(o.base)}" style="color:#ffcf4a">komendly.com</a></p>
</div></body></html>`;
  return { subject, text: lines.join("\n\n"), html };
}
