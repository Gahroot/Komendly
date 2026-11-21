// Competitor ad watch, web side: subscribe (double opt-in email via sendAdsMail), confirm, unsubscribe.
// State = AdsEvent rows (see src/lib/growth/ad-watch.ts). Weekly sends run in the engine (engine/src/growth/ad-watch.ts).
import { prisma } from "@/lib/prisma";
import { sendAdsMail } from "@/lib/ads/mailer";
import { rateLimit } from "@/lib/ads/abuse";
import { systemEnabled } from "@/lib/growth/systems";
import { AD_WATCH_EVENTS, AD_WATCH_SYSTEM, adWatchConfirmUrl, buildConfirmEmail, optedOut, type AdWatchInput } from "@/lib/growth/ad-watch";

export const adWatchEnabled = () => systemEnabled(prisma, AD_WATCH_SYSTEM);

export type SubscribeResult = { ok: true } | { ok: false; status: number; error: string };

export async function subscribeAdWatch(input: AdWatchInput, o: { base: string; ip: string; source: string; userId?: string | null }): Promise<SubscribeResult> {
  if (!(await adWatchEnabled())) return { ok: false, status: 503, error: "Competitor ad watch is taking a short break. Please try again later." };
  const secret = process.env.LIFECYCLE_EMAIL_SECRET ?? "";
  if (!secret) return { ok: false, status: 503, error: "Competitor ad watch is taking a short break. Please try again later." };
  if (!(await rateLimit(`ad_watch_sub_ip:${o.ip}`, 5, 3600)) || !(await rateLimit(`ad_watch_sub_email:${input.email}`, 3, 86_400))) {
    return { ok: false, status: 429, error: "Too many requests. Check your inbox for the confirmation email, or try again tomorrow." };
  }
  const ev = await prisma.adsEvent.create({
    data: { name: AD_WATCH_EVENTS.subscribed, userId: o.userId ?? null, props: { system: AD_WATCH_SYSTEM, email: input.email, trade: input.trade, city: input.city, pages: input.pages, source: o.source.slice(0, 40) } },
  });
  const mail = buildConfirmEmail({ base: o.base, confirmUrl: adWatchConfirmUrl(o.base, ev.id, secret), trade: input.trade, city: input.city, pages: input.pages });
  await sendAdsMail({ to: input.email, ...mail });
  return { ok: true };
}

async function subEvent(subId: string) {
  const ev = await prisma.adsEvent.findUnique({ where: { id: subId } });
  if (!ev || ev.name !== AD_WATCH_EVENTS.subscribed) return null;
  const email = String((ev.props as { email?: unknown } | null)?.email ?? "").toLowerCase();
  return email ? { ev, email } : null;
}

/** Double opt-in confirmation. Refused when the email opted out after this request (old link). */
export async function confirmAdWatch(subId: string): Promise<"confirmed" | "opted_out" | "invalid"> {
  const s = await subEvent(subId);
  if (!s) return "invalid";
  const unsub = await prisma.adsEvent.findMany({ where: { name: AD_WATCH_EVENTS.unsubscribed, props: { path: ["email"], equals: s.email } }, select: { id: true, name: true, createdAt: true, props: true } });
  if (optedOut(unsub, s.email, s.ev.createdAt)) return "opted_out";
  const already = await prisma.adsEvent.findFirst({ where: { name: AD_WATCH_EVENTS.confirmed, props: { path: ["subId"], equals: subId } }, select: { id: true } });
  if (!already) await prisma.adsEvent.create({ data: { name: AD_WATCH_EVENTS.confirmed, userId: s.ev.userId, props: { system: AD_WATCH_SYSTEM, subId, email: s.email } } });
  return "confirmed";
}

/** Opt-out for the whole email address (every earlier ad watch subscription). Idempotent enough: one row per click. */
export async function unsubscribeAdWatch(subId: string, via: "link" | "one_click"): Promise<boolean> {
  const s = await subEvent(subId);
  if (!s) return false;
  await prisma.adsEvent.create({ data: { name: AD_WATCH_EVENTS.unsubscribed, userId: s.ev.userId, props: { system: AD_WATCH_SYSTEM, subId, email: s.email, via } } });
  return true;
}
