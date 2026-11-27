// Watchdog for the one thing the engine cannot see about itself: the engine being down. Vercel Cron every 10 min.
// Flag-gated (sys_incidents, OFF = nothing runs). Acts ONLY when no engine heartbeat for 5+ min; otherwise the engine's
// incident job owns incidents. Same allow-listed containment + owner escalation as the engine (src/lib/ops/incident-io.ts).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAdsMail } from "@/lib/ads/mailer";
import { systemEnabled } from "@/lib/growth/systems";
import { incidentTick, type OpsDb } from "@/lib/ops/incident-io";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET; // read inside the function (serverless)
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await systemEnabled(prisma, "incidents"))) return NextResponse.json({ skipped: "sys_incidents is off" });
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const r = await incidentTick(prisma as unknown as OpsDb, async (m) => { await sendAdsMail({ ...m, html: `<pre style="white-space:pre-wrap">${esc(m.text)}</pre>` }); }, { mode: "watchdog", adminUrl: (process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "") });
  return NextResponse.json(r);
}
