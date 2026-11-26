// Weekly growth-ecosystem review (Vercel Cron, vercel.json). Bearer CRON_SECRET. Flag-gated: AdsFeatureFlag
// `growth_weekly_review` (missing = OFF -> nothing is read, sent or changed). Once per ISO week (AdsEvent marker).
// Applies the plan's course-change rules (src/lib/growth/ecosystem.ts): channels with 500+ actions and no sign-ups are
// suspended by switching their own sys_<key> flag OFF (never turns anything ON; Kly/outbound is only reported), and the
// owner gets a short plain-English report.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { weekStart } from "@/lib/ads/funnel";
import { buildWeeklyReport, decideCourse, GROWTH_REVIEW_EVENT, GROWTH_REVIEW_FLAG, needsYou, summarizeRegistry, type Opportunity } from "@/lib/growth/ecosystem";
import { loadEcosystemLive } from "@/lib/growth/ecosystem-queries";
import registryJson from "../../../../../docs/growth-ecosystem/registry.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TO = "nolan@prestyj.com";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const flag = await prisma.adsFeatureFlag.findUnique({ where: { key: GROWTH_REVIEW_FLAG } });
  if (!flag?.enabled) return NextResponse.json({ skipped: "flag growth_weekly_review is off" });
  const now = new Date();
  const week = weekStart(now);
  const already = await prisma.adsEvent.findFirst({ where: { name: GROWTH_REVIEW_EVENT, props: { path: ["week"], equals: week } }, select: { id: true } });
  if (already) return NextResponse.json({ skipped: "already sent", week });

  const registry = registryJson as unknown as Opportunity[];
  const live = await loadEcosystemLive(now);
  const decisions = decideCourse(live.sources);
  const switched: string[] = [];
  for (const d of decisions) {
    if (!d.switchOff) continue;
    await prisma.adsFeatureFlag.upsert({ where: { key: d.switchOff }, create: { key: d.switchOff, enabled: false }, update: { enabled: false } });
    switched.push(d.switchOff);
  }
  const { overall } = summarizeRegistry(registry);
  const needs = needsYou(registry).map((o) => ({ id: o.id, name: o.name, owner_action: o.owner_action }));
  const adminUrl = `${appBaseUrl(new URL(request.url).origin)}/admin/ads/growth`;
  const { subject, text } = buildWeeklyReport({ decisions, overall, needs, payingCustomers: live.payingCustomers, signups7d: live.signups7d, now }, adminUrl);
  await prisma.adsEvent.create({ data: { name: GROWTH_REVIEW_EVENT, props: { week, switchedOff: switched, decisions: decisions.filter((d) => d.action !== "keep" && d.action !== "no_data").map((d) => ({ source: d.source, action: d.action })) } } });
  const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
  const outcome = await sendAdsMail({ to: process.env.GROWTH_REPORT_EMAIL || DEFAULT_TO, subject, text, html });
  return NextResponse.json({ ok: true, week, outcome, switchedOff: switched });
}
