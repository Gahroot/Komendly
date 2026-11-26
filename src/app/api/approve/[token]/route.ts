import { NextRequest, NextResponse } from "next/server";
import { submitApproval } from "@/lib/growth/creative-hubs-server";
import { clientIp } from "@/lib/growth/hub-ip";

export const dynamic = "force-dynamic";

/** Public, no login: the signed token IS the capability. { action: "approve"|"changes", note?, name? } -> emails the owner. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await submitApproval((await params).token, { action: b.action, note: b.note, name: b.name }, clientIp(request), request.nextUrl.origin);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
