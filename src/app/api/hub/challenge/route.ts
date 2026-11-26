import { NextRequest, NextResponse } from "next/server";
import { finishChallenge, startChallenge } from "@/lib/growth/creative-hubs-server";
import { clientIp } from "@/lib/growth/hub-ip";
import { normalizeSiteUrl, domainOf } from "@/lib/growth/creative-hubs";

export const dynamic = "force-dynamic";

/** { phase: "start" } -> { token }. { phase: "finish", token, ms, url } -> { id, ms } (shareable /challenge/r/<id>). */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ip = clientIp(request);
  if (b.phase === "start") {
    const s = await startChallenge(ip);
    return s ? NextResponse.json(s) : NextResponse.json({ error: "Not available right now." }, { status: 503 });
  }
  const url = normalizeSiteUrl(b.url);
  if (!url) return NextResponse.json({ error: "Enter your website first." }, { status: 400 });
  const r = await finishChallenge(String(b.token ?? ""), Number(b.ms), domainOf(url), ip);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "That round expired. Start again." }, { status: 400 });
}
