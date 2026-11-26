// Vercel Cron (indexnow). Bearer CRON_SECRET; the system itself is flag-gated (default OFF) inside runIndexNow.
import { NextResponse } from "next/server";
import { runIndexNow } from "@/lib/growth/indexnow-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ result: await runIndexNow() });
}
