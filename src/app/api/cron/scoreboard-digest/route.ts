// Monday scoreboard email to the founder (Vercel Cron, vercel.json). Bearer CRON_SECRET (Vercel sends it).
// Once per ISO week: an AdsEvent marker keyed by the week is written before sending.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { loadScoreboard } from "@/lib/ads/scoreboard-queries";
import { weekStart } from "@/lib/ads/funnel";
import { digestMessage, SCOREBOARD_DIGEST_EVENT } from "@/lib/ads/scoreboard-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const to = process.env.ADS_ALERT_EMAIL;
  if (!to) return NextResponse.json({ skipped: "ADS_ALERT_EMAIL unset" });
  const now = new Date();
  const week = weekStart(now);
  const already = await prisma.adsEvent.findFirst({ where: { name: SCOREBOARD_DIGEST_EVENT, props: { path: ["week"], equals: week } }, select: { id: true } });
  if (already) return NextResponse.json({ skipped: "already sent", week });
  const [board, klySendsTotal] = await Promise.all([loadScoreboard(8, now), prisma.outboundSend.count({ where: { dryRun: false, kind: "sequence" } })]);
  const adminUrl = `${appBaseUrl(new URL(request.url).origin)}/admin/ads/scoreboard`;
  const { subject, text } = digestMessage({ board, checkpoints: board.checkpoints, klySendsTotal, now }, adminUrl);
  await prisma.adsEvent.create({ data: { name: SCOREBOARD_DIGEST_EVENT, props: { week } } });
  const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
  const outcome = await sendAdsMail({ to, subject, text, html });
  return NextResponse.json({ ok: true, week, outcome });
}
