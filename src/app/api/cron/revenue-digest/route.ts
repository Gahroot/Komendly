// Monday revenue digest (Vercel Cron, vercel.json). Bearer CRON_SECRET. Flag-gated: AdsFeatureFlag `sys_revenue_digest`
// (missing = OFF -> nothing read or sent). Once per ISO week (AdsEvent marker). Short plain-English email to the owner.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { digestAbsorbed, recordDigestSent } from "@/lib/exec/digest-dedupe";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { weekStart } from "@/lib/ads/funnel";
import { recordSystemRun } from "@/lib/growth/systems";
import { buildRevenueDigest, REVENUE_DIGEST_EVENT, REVENUE_DIGEST_FLAG } from "@/lib/revenue/digest";
import { experimentLine, loadRevenueDashboard } from "@/lib/revenue/queries";
import { needsYou, type Opportunity } from "@/lib/growth/ecosystem";
import registryJson from "../../../../../docs/revenue/registry.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DEFAULT_TO = "nolan@prestyj.com";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const flag = await prisma.adsFeatureFlag.findUnique({ where: { key: REVENUE_DIGEST_FLAG } });
  if (!flag?.enabled) return NextResponse.json({ skipped: `flag ${REVENUE_DIGEST_FLAG} is off` });
  if (await digestAbsorbed(prisma, "revenue_digest")) return NextResponse.json({ skipped: "absorbed by the executive brief (sys_exec_brief is on)" });
  const now = new Date();
  const week = weekStart(now);
  if (await prisma.adsEvent.findFirst({ where: { name: REVENUE_DIGEST_EVENT, props: { path: ["week"], equals: week } }, select: { id: true } })) return NextResponse.json({ skipped: "already sent", week });
  const d = await loadRevenueDashboard(now);
  const needs = needsYou(registryJson as unknown as Opportunity[]).map((o) => ({ id: String(o.id), name: o.name, owner_action: o.owner_action }));
  const { subject, text } = buildRevenueDigest(d.live, d.experiments.map(experimentLine), needs, `${appBaseUrl(new URL(request.url).origin)}/admin/ads/revenue`);
  await prisma.adsEvent.create({ data: { name: REVENUE_DIGEST_EVENT, props: { week, stage: d.live.stage.code } } });
  const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
  const outcome = await sendAdsMail({ to: process.env.REVENUE_REPORT_EMAIL || DEFAULT_TO, subject, text, html });
  await recordDigestSent(prisma, "revenue_digest", week);
  await recordSystemRun(prisma, "revenue_digest", { ok: true, outputs: 1 }, now);
  return NextResponse.json({ ok: true, week, outcome });
}
