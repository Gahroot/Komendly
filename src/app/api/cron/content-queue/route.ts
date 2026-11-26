// Vercel Cron (content-queue). Bearer CRON_SECRET; the system itself is flag-gated (default OFF) inside runContentQueue.
import { NextResponse } from "next/server";
import { runContentQueue } from "@/lib/growth/content-queue-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ result: await runContentQueue() });
}
