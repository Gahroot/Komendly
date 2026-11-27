// Ozzy's Ad Report, web side: double opt-in subscribe / confirm / unsubscribe and the weekly send (cron /api/cron/newsletter).
// Flag sys_newsletter (missing = OFF). State = AdsEvent rows (see newsletter.ts). Sends are claimed before sending.
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { rateLimit } from "@/lib/ads/abuse";
import { unsubscribeHeaders, renderLifecycleHtml } from "@/lib/ads/lifecycle/template";
import { isoWeek } from "./content-queue";
import { loadAdlibReport } from "./adlib-report-server";
import { recordSystemRun, systemEnabled } from "./systems";
import { NEWSLETTER_EVENTS, NEWSLETTER_EVENT_NAMES, NEWSLETTER_MAX_PER_RUN, NEWSLETTER_SYSTEM, activeNewsletterSubs, buildConfirmEmail, buildIssue, buildIssueEmail, checkIssue, newsletterConfirmUrl, newsletterUnsubscribeUrl } from "./newsletter";

export const newsletterEnabled = () => systemEnabled(prisma, NEWSLETTER_SYSTEM);
const secret = () => process.env.LIFECYCLE_EMAIL_SECRET ?? "";
const BUSY = "The Ad Report is taking a short break. Please try again later.";

export async function subscribeNewsletter(email: string, o: { base: string; ip: string; source: string }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!(await newsletterEnabled()) || !secret()) return { ok: false, status: 503, error: BUSY };
  if (!(await rateLimit(`newsletter_sub_ip:${o.ip}`, 5, 3600)) || !(await rateLimit(`newsletter_sub_email:${email}`, 3, 86_400))) return { ok: false, status: 429, error: "Too many requests. Check your inbox for the confirmation email, or try again tomorrow." };
  const ev = await prisma.adsEvent.create({ data: { name: NEWSLETTER_EVENTS.subscribed, props: { system: NEWSLETTER_SYSTEM, email, source: o.source.slice(0, 40) } } });
  const mail = buildConfirmEmail({ base: o.base, confirmUrl: newsletterConfirmUrl(o.base, ev.id, secret()) });
  await sendAdsMail({ to: email, ...mail });
  return { ok: true };
}

async function subEvent(subId: string) {
  const ev = await prisma.adsEvent.findUnique({ where: { id: subId } });
  if (!ev || ev.name !== NEWSLETTER_EVENTS.subscribed) return null;
  const email = String((ev.props as { email?: unknown } | null)?.email ?? "").toLowerCase();
  return email ? { ev, email } : null;
}

export async function confirmNewsletter(subId: string): Promise<"confirmed" | "opted_out" | "invalid"> {
  const s = await subEvent(subId);
  if (!s) return "invalid";
  const unsub = await prisma.adsEvent.findFirst({ where: { name: NEWSLETTER_EVENTS.unsubscribed, props: { path: ["email"], equals: s.email }, createdAt: { gte: s.ev.createdAt } }, select: { id: true } });
  if (unsub) return "opted_out";
  const already = await prisma.adsEvent.findFirst({ where: { name: NEWSLETTER_EVENTS.confirmed, props: { path: ["subId"], equals: subId } }, select: { id: true } });
  if (!already) await prisma.adsEvent.create({ data: { name: NEWSLETTER_EVENTS.confirmed, props: { system: NEWSLETTER_SYSTEM, subId, email: s.email } } });
  return "confirmed";
}

export async function unsubscribeNewsletter(subId: string, via: "link" | "one_click"): Promise<boolean> {
  const s = await subEvent(subId);
  if (!s) return false;
  await prisma.adsEvent.create({ data: { name: NEWSLETTER_EVENTS.unsubscribed, props: { system: NEWSLETTER_SYSTEM, subId, email: s.email, via } } });
  return true;
}

export type NewsletterRun = { status: "off" | "no_secret" | "blocked" | "sent"; sent?: number; reason?: string };

/** Weekly send (cron Thu 14:00 UTC). Idempotent per subscriber per ISO week; fails closed when checkIssue rejects the issue. */
export async function runNewsletter(now = new Date()): Promise<NewsletterRun> {
  if (!(await newsletterEnabled())) return { status: "off" };
  if (!secret()) return { status: "no_secret" };
  try {
    const report = await loadAdlibReport();
    const issue = buildIssue(now, report);
    const problem = checkIssue(issue);
    if (problem) {
      await recordSystemRun(prisma, NEWSLETTER_SYSTEM, { ok: false, error: `issue blocked: ${problem}` }, now);
      return { status: "blocked", reason: problem };
    }
    const events = await prisma.adsEvent.findMany({ where: { name: { in: [...NEWSLETTER_EVENT_NAMES] } }, select: { id: true, name: true, createdAt: true, userId: true, props: true }, orderBy: { createdAt: "asc" }, take: 50_000 });
    const week = isoWeek(now);
    const due = activeNewsletterSubs(events).filter((s) => !s.issuesDone.has(week)).slice(0, NEWSLETTER_MAX_PER_RUN);
    const base = appBaseUrl("https://www.komendly.com");
    let sent = 0;
    for (const s of due) {
      await prisma.adsEvent.create({ data: { name: NEWSLETTER_EVENTS.sent, userId: s.userId, props: { system: NEWSLETTER_SYSTEM, subId: s.subId, email: s.email, issue: week } } });
      const unsub = newsletterUnsubscribeUrl(base, s.subId, secret());
      const mail = buildIssueEmail({ issue, unsubscribeUrl: unsub, postalAddress: process.env.OUTBOUND_POSTAL_ADDRESS });
      try {
        await sendAdsMail({ to: s.email, subject: mail.subject, text: mail.text, html: renderLifecycleHtml(mail.input), headers: unsubscribeHeaders(unsub) });
        sent++;
      } catch (e) {
        console.warn("[newsletter] send failed", s.email, e instanceof Error ? e.message : e);
      }
    }
    await recordSystemRun(prisma, NEWSLETTER_SYSTEM, { ok: true, outputs: sent }, now);
    return { status: "sent", sent };
  } catch (e) {
    await recordSystemRun(prisma, NEWSLETTER_SYSTEM, { ok: false, error: e instanceof Error ? e.message : "failed" }, now);
    throw e;
  }
}
