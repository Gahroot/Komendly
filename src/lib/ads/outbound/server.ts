// Web side of cold outbound: claim-link clicks, unsubscribes, admin actions. The engine does finding/sending.
import type { z } from "zod";
import { OutboundRunSchema, type OutboundAction } from "./server-schema";
import { prisma } from "@/lib/prisma";
import { isBotUserAgent } from "@/lib/ads/gifts";
import { emailDomain, isStopped } from "./policy";

export { OutboundActionSchema, OutboundRunSchema, type OutboundAction } from "./server-schema";

export function isLeadToken(v: string): boolean {
  return /^[A-Za-z0-9_-]{20,32}$/.test(v);
}

/** utm_campaign for a niche ("roofers" -> "roofers"). */
export function nicheCampaign(niche: string): string {
  return niche.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "outbound";
}

/** Claim link: records the click (humans only) and returns the gift page path with outbound first-touch UTMs. */
export async function claimRedirect(token: string, ua: string | null): Promise<string | null> {
  if (!isLeadToken(token)) return null;
  const lead = await prisma.outboundLead.findUnique({ where: { claimToken: token }, select: { id: true, giftToken: true, niche: true, status: true, clickedAt: true } });
  if (!lead?.giftToken) return null;
  if (!isBotUserAgent(ua) && !lead.clickedAt) {
    const promote = ["ad_made", "queued", "sent", "opened"].includes(lead.status);
    await prisma.outboundLead.update({ where: { id: lead.id }, data: { clickedAt: new Date(), ...(promote ? { status: "clicked" } : {}) } });
  }
  const utm = new URLSearchParams({ utm_source: "outbound", utm_medium: "email", utm_campaign: nicheCampaign(lead.niche) });
  return `/gift/${lead.giftToken}?${utm.toString()}`;
}

/** Unsubscribe by token: suppress the address (never email again) and stop the lead. Idempotent. */
export async function unsubscribeLead(token: string): Promise<{ email: string } | null> {
  if (!isLeadToken(token)) return null;
  const lead = await prisma.outboundLead.findUnique({ where: { unsubToken: token }, select: { id: true, email: true, status: true } });
  if (!lead) return null;
  const email = lead.email.toLowerCase();
  await prisma.outboundSuppression.upsert({ where: { value: email }, create: { value: email, kind: "email", reason: "unsubscribe" }, update: {} });
  if (!isStopped(lead.status) || lead.status === "failed") await prisma.outboundLead.update({ where: { id: lead.id }, data: { status: "unsubscribed" } });
  return { email };
}

/** Admin: suppress an email or a whole domain by hand. */
export async function suppressManual(value: string): Promise<void> {
  const v = value.trim().toLowerCase();
  const kind = v.includes("@") ? "email" : "domain";
  await prisma.outboundSuppression.upsert({ where: { value: kind === "domain" ? emailDomain(`x@${v}`) : v }, create: { value: kind === "domain" ? emailDomain(`x@${v}`) : v, kind, reason: "manual" }, update: {} });
}

/** Queue a lead-finding run (the engine picks it up within a minute). */
export async function requestOutboundRun(input: z.infer<typeof OutboundRunSchema>, createdBy: string | null): Promise<{ id: string }> {
  return prisma.outboundRun.create({ data: { niche: input.niche, cities: input.cities, count: input.count, createdBy }, select: { id: true } });
}

export async function applyOutboundAction(a: OutboundAction, adminId: string): Promise<Record<string, unknown>> {
  switch (a.action) {
    case "pause":
      await prisma.outboundMailbox.update({ where: { id: a.mailboxId }, data: { paused: true, pausedReason: "admin" } });
      return { ok: true };
    case "resume":
      await prisma.outboundMailbox.update({ where: { id: a.mailboxId }, data: { paused: false, pausedReason: null } });
      return { ok: true };
    case "run":
      return requestOutboundRun(a, adminId);
    case "kill_switch":
      await prisma.adsFeatureFlag.upsert({ where: { key: "outbound" }, create: { key: "outbound", enabled: a.enabled }, update: { enabled: a.enabled } });
      return { ok: true };
    case "suppress":
      await suppressManual(a.value);
      return { ok: true };
  }
}
