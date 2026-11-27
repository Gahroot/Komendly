// Ozzy's Ad Report (growth system `newsletter`, flag sys_newsletter, default OFF): a weekly double-opt-in email with
// ONE real number from our own Ad Library snapshot, ONE ad idea (a labelled template) and ONE tip. Pure: no Next/Prisma.
// Data model (no schema change), all AdsEvent rows:
//   newsletter_subscribed   {email, source}      id = subscription id
//   newsletter_confirmed    {subId, email}       double opt-in link clicked
//   newsletter_unsubscribed {subId?, email, via} opt-out of the whole address
//   newsletter_sent         {subId, email, issue} claimed BEFORE sending (one per sub per ISO week)
import { SITE_URL } from "../site";
import { DEFAULT_POSTAL_ADDRESS } from "../ads/outbound/copy";
import type { LifecycleEmailInput } from "../ads/lifecycle/template";
import { buildContentQueue, isoWeek } from "./content-queue";
import { signAdWatchToken, verifyAdWatchToken, AD_WATCH_CONFIRM_TTL_DAYS } from "./ad-watch";
import { withSystemUtm } from "./systems";

export const NEWSLETTER_SYSTEM = "newsletter" as const;
export const NEWSLETTER_NAME = "Ozzy's Ad Report";
export const NEWSLETTER_EVENTS = { subscribed: "newsletter_subscribed", confirmed: "newsletter_confirmed", unsubscribed: "newsletter_unsubscribed", sent: "newsletter_sent" } as const;
export const NEWSLETTER_EVENT_NAMES = Object.values(NEWSLETTER_EVENTS);
export const NEWSLETTER_MAX_PER_RUN = 200;

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export function parseNewsletterInput(raw: unknown): { ok: true; email: string } | { ok: false; error: string } {
  const email = String((raw as { email?: unknown } | null)?.email ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? { ok: true, email } : { ok: false, error: "Please enter a valid email address." };
}

export const newsletterConfirmUrl = (base: string, subId: string, secret: string, now = new Date()) =>
  `${base}/api/newsletter/confirm?t=${signAdWatchToken({ a: "confirm", s: subId, e: Math.floor(now.getTime() / 1000) + AD_WATCH_CONFIRM_TTL_DAYS * 86_400 }, secret)}`;
export const newsletterUnsubscribeUrl = (base: string, subId: string, secret: string) => `${base}/api/newsletter/unsubscribe?t=${signAdWatchToken({ a: "unsub", s: subId }, secret)}`;
export const verifyNewsletterToken = verifyAdWatchToken;

export interface NewsletterEventRow { id: string; name: string; createdAt: Date | string; userId?: string | null; props: unknown }
const P = (e: NewsletterEventRow) => (e.props && typeof e.props === "object" ? (e.props as Record<string, unknown>) : {});
const T = (e: NewsletterEventRow) => new Date(e.createdAt);
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

export interface NewsletterSub { subId: string; email: string; userId: string | null; confirmedAt: Date; issuesDone: Set<string> }

/** Confirmed (double opt-in), not opted out after the request; one entry per email (newest confirmed request). */
export function activeNewsletterSubs(events: NewsletterEventRow[]): NewsletterSub[] {
  const out = new Map<string, Date>();
  for (const e of events) if (e.name === NEWSLETTER_EVENTS.unsubscribed) { const em = lower(P(e).email); if (em && (!out.get(em) || out.get(em)! < T(e))) out.set(em, T(e)); }
  const confirmed = new Map<string, Date>();
  for (const e of events) if (e.name === NEWSLETTER_EVENTS.confirmed && typeof P(e).subId === "string" && !confirmed.has(P(e).subId as string)) confirmed.set(P(e).subId as string, T(e));
  const byEmail = new Map<string, NewsletterSub>();
  for (const e of events) {
    if (e.name !== NEWSLETTER_EVENTS.subscribed) continue;
    const email = lower(P(e).email);
    const confirmedAt = confirmed.get(e.id);
    if (!email || !confirmedAt) continue;
    const u = out.get(email);
    if (u && u >= T(e)) continue;
    const prev = byEmail.get(email);
    if (prev && prev.confirmedAt >= confirmedAt) continue;
    byEmail.set(email, { subId: e.id, email, userId: e.userId ?? null, confirmedAt, issuesDone: new Set() });
  }
  const byId = new Map([...byEmail.values()].map((s) => [s.subId, s]));
  for (const e of events) {
    if (e.name !== NEWSLETTER_EVENTS.sent) continue;
    const sub = typeof P(e).subId === "string" ? byId.get(P(e).subId as string) : undefined;
    // A claim under any earlier subscription id of the same email also counts (re-subscribe must not double-send).
    const bySame = sub ?? byEmail.get(lower(P(e).email));
    if (bySame && typeof P(e).issue === "string") bySame.issuesDone.add(P(e).issue as string);
  }
  return [...byEmail.values()];
}

/** The minimal slice of AdlibReport used here (so tests need no full report). */
export interface ReportSlice {
  collectedOn: string;
  advertisers: number;
  indexable: boolean;
  liveAds: { multiAdShare: number };
  runDays: { median: number; over90Share: number };
  byTrade: Array<{ slug: string; label: string; advertisers: number; medianDays: number; multiAdShare: number }>;
}
export interface Issue { issue: string; subject: string; preheader: string; stat: { text: string; source: string }; idea: { text: string; href: string }; tip: { text: string; href: string }; cta: { label: string; href: string } }

const pct = (x: number) => `${Math.round(x * 100)}%`;
const MIN_TRADE_ADVERTISERS = 20;

/** Deterministic issue from our own data; never invents numbers (the stat string is built from the slice only). */
export function buildIssue(now: Date, report: ReportSlice): Issue {
  const issue = isoWeek(now);
  const q = buildContentQueue(now);
  const aotw = q.items.find((i) => i.kind === "ad_of_the_week");
  const tip = q.items.find((i) => i.channel === "short_video_script");
  const row = report.byTrade.find((t) => t.slug === (aotw?.trade ?? "") && t.advertisers >= MIN_TRADE_ADVERTISERS);
  const src = `Komendly's Ad Library snapshot of ${report.advertisers.toLocaleString("en-US")} local-service advertisers, collected ${report.collectedOn}`;
  const stat = row
    ? { text: `Among ${row.label.toLowerCase()} advertisers we checked (${row.advertisers.toLocaleString("en-US")}), the median ad had been running ${row.medianDays} days, and ${pct(row.multiAdShare)} had more than one live ad.`, source: src }
    : { text: `Across all the local-service advertisers we checked, the median ad had been running ${report.runDays.median} days, ${pct(report.runDays.over90Share)} had an ad live for 90+ days, and ${pct(report.liveAds.multiAdShare)} had more than one live ad.`, source: src };
  const own = (href: string, content: string) => { const u = new URL(href); return withSystemUtm(`${u.origin}${u.pathname}`, NEWSLETTER_SYSTEM, { medium: "email", campaign: issue, content }); };
  const link = (path: string, content: string) => withSystemUtm(`${SITE_URL}${path}`, NEWSLETTER_SYSTEM, { medium: "email", campaign: issue, content });
  const idea = aotw ? { text: aotw.text, href: own(aotw.link, "idea") } : { text: "Pick one offer, one photo and one clear next step, then test it for a week.", href: link("/free-ads", "idea") };
  const tp = tip ? { text: tip.text, href: own(tip.link, "tip") } : { text: "Replace your oldest ad this week; keep the one with the lowest cost per lead.", href: link("/free-ads", "tip") };
  return { issue, subject: `${NEWSLETTER_NAME}: one number, one ad idea, one tip`, preheader: "One real number, one ad idea and one tip, 2 minutes.", stat, idea, tip: tp, cta: { label: "Make my free ads", href: link("/free-ads", "cta") } };
}

/** Rules the issue must pass before any send (fails closed). Our own copy only: no promised results or invented claims. */
export function checkIssue(i: Issue): string | null {
  const all = [i.subject, i.stat.text, i.idea.text, i.tip.text].join("\n");
  if (/\b(guarantee[sd]?|get you \d+|\d+x\b|double your|triple your|make \$|revenue of|results? (are|is) guaranteed)\b/i.test(all)) return "promises results";
  if (!/collected \d{4}-\d{2}-\d{2}/.test(i.stat.source)) return "stat has no dated source";
  if (!/\d/.test(i.stat.text)) return "stat has no number";
  for (const h of [i.idea.href, i.tip.href, i.cta.href]) if (!h.startsWith(SITE_URL) || !h.includes("utm_source=ozzy_report")) return `link without utm_source=ozzy_report: ${h}`;
  if (i.subject.length > 90) return "subject too long";
  return null;
}

export function buildIssueEmail(o: { issue: Issue; unsubscribeUrl: string; postalAddress?: string }): { subject: string; input: LifecycleEmailInput; text: string } {
  const { issue: i } = o;
  const postal = o.postalAddress || DEFAULT_POSTAL_ADDRESS;
  const footer = `${NEWSLETTER_NAME} by Komendly. You get this because you confirmed it at komendly.com. Komendly, ${postal}.`;
  const input: LifecycleEmailInput = {
    appUrl: SITE_URL,
    subject: i.subject,
    preheader: i.preheader,
    paragraphs: [`The number: ${i.stat.text} (Source: ${i.stat.source}.)`, `The ad idea: ${i.idea.text}`, `The tip: ${i.tip.text}`, footer],
    cta: i.cta,
    blocks: [{ title: "Go deeper", items: [{ text: "This week's ad idea, as a free page", linkLabel: "Open", href: i.idea.href }, { text: "This week's tip, with the full playbook", linkLabel: "Open", href: i.tip.href }, { text: "The full data report", linkLabel: "Read", href: withSystemUtm(`${SITE_URL}/reports/local-service-meta-ads`, NEWSLETTER_SYSTEM, { medium: "email", campaign: i.issue, content: "report" }) }] }],
    unsubscribeUrl: o.unsubscribeUrl,
  };
  const text = [i.subject, ...input.paragraphs, `${i.cta.label}: ${i.cta.href}`, "--", "Ozzy from Komendly (an AI, made by Komendly)", `Unsubscribe: ${o.unsubscribeUrl}`].join("\n\n");
  return { subject: i.subject, input, text };
}

export function buildConfirmEmail(o: { base: string; confirmUrl: string }): { subject: string; text: string; html: string } {
  const subject = `Confirm your ${NEWSLETTER_NAME}`;
  const text = [`You (or someone using this address) asked for ${NEWSLETTER_NAME} from Komendly: once a week, one real number from our Ad Library data, one ad idea and one tip.`, `Confirm here (link valid ${AD_WATCH_CONFIRM_TTL_DAYS} days): ${o.confirmUrl}`, "If you didn't ask for this, ignore this email and you won't hear from us. Every issue has a one-click unsubscribe.", "--\nOzzy from Komendly (komendly.com)"].join("\n\n");
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:24px;background:#0c0820;color:#fff1d6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;background:#150d2e;border:1px solid #2b1556;border-radius:16px;padding:28px"><h1 style="font-size:22px;margin:0 0 14px">${esc(subject)}</h1><p style="line-height:1.6">Once a week: one real number from our Ad Library data, one ad idea and one tip.</p><p><a href="${esc(o.confirmUrl)}" style="display:inline-block;padding:12px 22px;background:#ffcf4a;color:#2a0f10;font-weight:700;border-radius:12px;text-decoration:none">Yes, send me the Ad Report</a></p><p style="font-size:13px;color:#c9b8e8;line-height:1.6">Link valid ${AD_WATCH_CONFIRM_TTL_DAYS} days. If you didn't ask for this, ignore this email. Every issue has a one-click unsubscribe.</p><p style="font-size:13px;color:#c9b8e8">Ozzy from Komendly · <a href="${esc(o.base)}" style="color:#ffcf4a">komendly.com</a></p></div></body></html>`;
  return { subject, text, html };
}
