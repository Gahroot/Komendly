import { NextResponse } from "next/server";
import { AdsHttpError, adsErrorResponse } from "@/lib/ads/workspace";
import { requireStudioSession } from "@/lib/studio/server";
import { isSdpOffer } from "@/lib/studio/voice";
import { startVoiceCall } from "@/lib/studio/voice-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start Ozzy's voice for a Studio session: { sessionId, sdp } (the browser's WebRTC offer) -> { sdp } (the answer).
 * The browser then talks to the realtime voice directly; requests to the studio come back as normal chat messages.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { sessionId?: unknown; sdp?: unknown } | null;
    if (!body || typeof body.sessionId !== "string" || !isSdpOffer(body.sdp)) throw new AdsHttpError(400, "bad_request", "Bad request.");
    const { session } = await requireStudioSession(body.sessionId);
    const r = await startVoiceCall(body.sdp, { title: session.title, signal: request.signal });
    if (!r.ok) {
      console.warn("studio voice unavailable", { code: r.code, status: r.status, detail: r.detail });
      return NextResponse.json({ error: "Voice isn't available right now.", code: "voice_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ sdp: r.sdp }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
