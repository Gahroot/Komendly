// Vercel Cron (Ozzy's Ad Report, Thu 14:00 UTC). Bearer CRON_SECRET; flag sys_newsletter (default OFF) is checked inside runNewsletter.
import { NextResponse } from "next/server";
import { runNewsletter } from "@/lib/growth/newsletter-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ result: await runNewsletter() });
}
