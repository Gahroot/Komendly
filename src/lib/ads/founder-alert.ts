// Founder alerts: one short email to ADS_ALERT_EMAIL on the funnel moments worth a personal follow-up
// (sign-up, trial refused, first download, checkout opened, payment, cancel). Off when ADS_ALERT_EMAIL is unset.
// Never throws; test/internal users (same rules as lifecycle email) never alert.
import { prisma } from "@/lib/prisma";
import { isTestEmail as isLifecycleTestEmail } from "./lifecycle/select";
import { isInternalEmail } from "@/lib/internal-email";
import { sendAdsMail } from "./mailer";

export const ALERT_EVENTS = ["signed_up", "trial_blocked", "export_downloaded", "checkout_started", "purchased", "churned"] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];
export function isAlertEvent(name: string): name is AlertEvent {
  return (ALERT_EVENTS as readonly string[]).includes(name);
}

const LABEL: Record<AlertEvent, string> = {
  signed_up: "New sign-up",
  trial_blocked: "Free pack refused",
  export_downloaded: "Downloaded their ads",
  checkout_started: "Opened checkout",
  purchased: "PAID",
  churned: "Cancelled",
};

export interface AlertFacts {
  event: AlertEvent;
  email: string;
  name: string | null;
  website: string | null;
  source: string | null;
  props: Record<string, unknown>;
  adminUrl: string;
}

const money = (cents: unknown) => (typeof cents === "number" ? `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` : null);

/** Pure: subject + plain text for one alert. */
export function alertMessage(f: AlertFacts): { subject: string; text: string } {
  const p = f.props;
  const detail =
    f.event === "purchased" ? [String(p.key ?? p.kind ?? ""), money(p.amountCents)].filter(Boolean).join(" ")
    : f.event === "checkout_started" ? [String(p.key ?? ""), p.interval === "year" ? "(yearly)" : "", p.placement ? `from ${String(p.placement)}` : ""].filter(Boolean).join(" ")
    : f.event === "trial_blocked" ? `reason: ${String(p.reason ?? "?")}${p.domain ? ` (${String(p.domain)})` : ""}`
    : f.event === "export_downloaded" ? (p.kind === "zip" ? "the whole pack (zip)" : "an ad")
    : "";
  const who = f.website ? `${f.email} (${f.website.replace(/^https?:\/\//, "").replace(/\/$/, "")})` : f.email;
  const subject = `[Komendly] ${LABEL[f.event]}: ${who}`.slice(0, 120);
  const text = [
    `${LABEL[f.event]}${detail ? `: ${detail}` : ""}`,
    "",
    `Who: ${f.name ? `${f.name} <${f.email}>` : f.email}`,
    f.website ? `Website: ${f.website}` : null,
    `Came from: ${f.source ?? "unknown"}`,
    "",
    f.event === "export_downloaded" || f.event === "trial_blocked" ? "Good moment for a personal note: email them directly." : null,
    `Admin: ${f.adminUrl}`,
  ].filter((l) => l !== null).join("\n");
  return { subject, text };
}

/** Called by trackAdsEvent after the event row is saved. */
export async function founderAlert(name: string, data: { userId?: string; workspaceId?: string; props?: Record<string, unknown> }): Promise<void> {
  const to = process.env.ADS_ALERT_EMAIL;
  if (!to || !isAlertEvent(name)) return;
  try {
    const userId = data.userId ?? (data.workspaceId ? (await prisma.adsWorkspace.findUnique({ where: { id: data.workspaceId }, select: { ownerId: true } }))?.ownerId : undefined);
    if (!userId) return;
    // Downloads: only the first one per user (each ad download is its own event).
    if (name === "export_downloaded" && (await prisma.adsEvent.count({ where: { name, userId } })) > 1) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user?.email || isLifecycleTestEmail(user.email) || isInternalEmail(user.email)) return;
    const [run, signup] = await Promise.all([
      prisma.adRun.findFirst({ where: { userId, kind: { not: "gift" } }, orderBy: { createdAt: "desc" }, select: { url: true } }),
      prisma.adsEvent.findFirst({ where: { name: "signed_up", userId }, orderBy: { createdAt: "asc" }, select: { props: true } }),
    ]);
    const ft = ((signup?.props as Record<string, unknown> | null)?.firstTouch ?? null) as Record<string, unknown> | null;
    const source = ft ? [ft.utm_source, ft.utm_medium].filter(Boolean).join(" / ") || (typeof ft.referrer === "string" ? ft.referrer : null) : null;
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
    const website = run?.url ?? (typeof data.props?.domain === "string" ? data.props.domain : null);
    const { subject, text } = alertMessage({ event: name, email: user.email, name: user.name, website, source, props: data.props ?? {}, adminUrl: `${base}/admin/ads/signups` });
    await Promise.race([
      sendAdsMail({ to, subject, text, html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>` }),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch (e) {
    console.warn("[founder-alert] failed", e instanceof Error ? e.message : e);
  }
}
