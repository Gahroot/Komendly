// Daily "Ozzy's business of the day" pick (Vercel Cron). Bearer CRON_SECRET. Only opted-in showcases; flag creative_publish.
import { NextResponse } from "next/server";
import { runBusinessOfTheDay } from "@/lib/growth/creative-hubs-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ result: await runBusinessOfTheDay() });
}
