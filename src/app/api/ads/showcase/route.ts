import { NextRequest, NextResponse } from "next/server";
import { mineShowcase, saveShowcase } from "@/lib/growth/creative-hubs-server";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

export const dynamic = "force-dynamic";

/** Owner's public showcase opt-in (off until they enable it). GET = current settings. */
export async function GET() {
  try {
    const ws = await getOrCreateWorkspace(await requireUser());
    return NextResponse.json({ showcase: await mineShowcase(ws.id) });
  } catch (e) { return adsErrorResponse(e); }
}
/** POST { title, blurb, adIds[], enabled, botd }: enabled=false unpublishes immediately. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await saveShowcase(user.id, ws.id, { title: b.title, blurb: b.blurb, adIds: b.adIds, enabled: b.enabled, botd: b.botd });
    return r.ok ? NextResponse.json({ ok: true, slug: r.slug }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) { return adsErrorResponse(e); }
}
