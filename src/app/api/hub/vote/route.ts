import { NextRequest, NextResponse } from "next/server";
import { castVote, pairTally } from "@/lib/growth/creative-hubs-server";
import { clientIp } from "@/lib/growth/hub-ip";

export const dynamic = "force-dynamic";

/** Public head-to-head vote: { pair, choice } -> tally. One vote per network per pair per day; no PII stored. */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as { pair?: unknown; choice?: unknown };
  const pair = String(b.pair ?? ""), choice = String(b.choice ?? "");
  const r = await castVote(pair, choice, clientIp(request));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, tally: await pairTally(pair) });
}
