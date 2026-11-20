// "You got paid" email to the founder (ADS_ALERT_EMAIL) on every real Website2ads payment: a new subscription or a
// one-time purchase, live mode only, never for internal/test accounts. Called from the ads billing webhook.
// Idempotent: one AdsEvent marker per payment key (sub:<subscriptionId> | cs:<checkoutSessionId>), written under a
// Postgres advisory lock so concurrent deliveries (checkout.session.completed + invoice.paid for the same new
// subscription, or Stripe retries) send exactly one email. Never throws.
import { prisma } from "@/lib/prisma";
import { isInternalEmail } from "@/lib/internal-email";
import { parseFirstTouch, serializeFirstTouch, type FirstTouch } from "@/lib/analytics/first-touch";
import { isTestEmail as isLifecycleTestEmail } from "./lifecycle/select";
import { sendAdsMail } from "./mailer";
import { SCORE_CHANNEL_LABEL, scoreChannel, type ScoreChannel } from "./scoreboard";

/** Marker AdsEvent name (written directly, like founder-alert's `testimonial_paid`): props.alertKey = payment key. */
export const ADS_PAYMENT_ALERT_EVENT = "ads_payment_alerted";

export type PaymentKind = "subscription" | "one_time";

/** Dedupe key: a new subscription is one payment however many events report it; a one-time checkout is its session. */
export function paymentAlertKey(p: { kind: PaymentKind; subscriptionId?: string | null; checkoutSessionId?: string | null; invoiceId?: string | null }): string | null {
  if (p.kind === "subscription") return p.subscriptionId ? `sub:${p.subscriptionId}` : p.invoiceId ? `in:${p.invoiceId}` : null;
  return p.checkoutSessionId ? `cs:${p.checkoutSessionId}` : null;
}

export type PaymentAlertFacts = {
  amountCents: number;
  currency: string;
  what: string;
  kind: PaymentKind;
  workspaceName: string | null;
  email: string;
  name: string | null;
  channel: ScoreChannel;
  source: string | null;
  adminUrl: string;
};

/** Pure: subject + plain text. */
export function paymentAlertMessage(f: PaymentAlertFacts): { subject: string; text: string } {
  const amount = `${f.currency.toUpperCase() === "USD" ? "$" : `${f.currency.toUpperCase()} `}${(f.amountCents / 100).toFixed(f.amountCents % 100 ? 2 : 0)}`;
  const kind = f.kind === "subscription" ? "new subscription" : "one-time purchase";
  const subject = `[Komendly] PAID ${amount}: ${f.email} (${SCORE_CHANNEL_LABEL[f.channel]})`.slice(0, 140);
  const text = [
    `PAID: ${amount}, ${kind} (${f.what})`,
    "",
    `Who: ${f.name ? `${f.name} <${f.email}>` : f.email}`,
    `Workspace: ${f.workspaceName ?? "—"}`,
    `Channel: ${SCORE_CHANNEL_LABEL[f.channel]}${f.source ? ` (first touch: ${f.source})` : ""}`,
    "",
    `Scoreboard: ${f.adminUrl}`,
  ].join("\n");
  return { subject, text };
}

function touchOf(props: unknown): FirstTouch | null {
  const p = (props ?? {}) as { firstTouch?: unknown; meta?: { firstTouch?: unknown } };
  const t = p.firstTouch ?? p.meta?.firstTouch;
  return t && typeof t === "object" ? parseFirstTouch(serializeFirstTouch(t as FirstTouch)) : null;
}

/** Claim the key once (advisory lock + marker row). True = this caller sends the email. */
async function claimOnce(key: string, data: { workspaceId: string; userId: string; props: Record<string, unknown> }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`ads_payment_alert:${key}`}))) AS l`;
    const prior = await tx.adsEvent.findFirst({ where: { name: ADS_PAYMENT_ALERT_EVENT, props: { path: ["alertKey"], equals: key } }, select: { id: true } });
    if (prior) return false;
    await tx.adsEvent.create({ data: { name: ADS_PAYMENT_ALERT_EVENT, workspaceId: data.workspaceId, userId: data.userId, props: { alertKey: key, ...data.props } as object } });
    return true;
  });
}

export async function adsPaymentAlert(p: {
  livemode: boolean;
  kind: PaymentKind;
  workspaceId: string;
  subscriptionId?: string | null;
  checkoutSessionId?: string | null;
  invoiceId?: string | null;
  amountCents: number;
  currency?: string | null;
  what: string;
}): Promise<void> {
  try {
    if (!p.livemode || p.amountCents <= 0) return;
    const key = paymentAlertKey(p);
    if (!key) return;
    const ws = await prisma.adsWorkspace.findUnique({ where: { id: p.workspaceId }, select: { id: true, name: true, ownerId: true } });
    if (!ws) return;
    const owner = await prisma.user.findUnique({ where: { id: ws.ownerId }, select: { email: true, name: true } });
    if (!owner?.email || isInternalEmail(owner.email) || isLifecycleTestEmail(owner.email)) return;
    const to = process.env.ADS_ALERT_EMAIL;
    if (!to) return;
    if (!(await claimOnce(key, { workspaceId: ws.id, userId: ws.ownerId, props: { amountCents: p.amountCents, what: p.what, kind: p.kind } }))) return;
    const [signup, klyLead, klyGift, referral] = await Promise.all([
      prisma.adsEvent.findFirst({ where: { name: "signed_up", workspaceId: ws.id }, orderBy: { createdAt: "asc" }, select: { props: true } }),
      prisma.outboundLead.findFirst({ where: { workspaceId: ws.id }, select: { id: true } }),
      prisma.adsGift.findFirst({ where: { claimedWorkspaceId: ws.id, source: { in: ["outbound", "admin_outreach"] } }, select: { id: true } }),
      prisma.adsReferral.findFirst({ where: { referredWorkspaceId: ws.id, status: { not: "rejected" } }, select: { id: true } }),
    ]);
    const touch = touchOf(signup?.props);
    const source = touch ? [touch.utm_source, touch.utm_medium, touch.utm_campaign].filter(Boolean).join(" / ") || (touch.fbclid ? "fbclid" : touch.referrer ?? null) : null;
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
    const { subject, text } = paymentAlertMessage({
      amountCents: p.amountCents,
      currency: p.currency ?? "usd",
      what: p.what,
      kind: p.kind,
      workspaceName: ws.name,
      email: owner.email,
      name: owner.name,
      channel: scoreChannel({ touch, klyLead: !!klyLead || !!klyGift, referral: !!referral }),
      source,
      adminUrl: `${base}/admin/ads/scoreboard`,
    });
    await Promise.race([
      sendAdsMail({ to, subject, text, html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>` }),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch (e) {
    console.warn("[payment-alert] failed", e instanceof Error ? e.message : e);
  }
}
