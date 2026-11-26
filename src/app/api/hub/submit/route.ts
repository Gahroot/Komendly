import { NextRequest, NextResponse } from "next/server";
import { getCookieUser } from "@/lib/auth";
import { HUB_CONFIGS, type HubKind } from "@/lib/growth/creative-hubs";
import { submitHub } from "@/lib/growth/creative-hubs-server";
import { clientIp } from "@/lib/growth/hub-ip";

export const dynamic = "force-dynamic";

/** Public: { kind, ...fields } for makeover | nominate | rescue | launch | giveaway | nonprofit | reaction | review | takedown. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? "") as HubKind;
  if (!Object.prototype.hasOwnProperty.call(HUB_CONFIGS, kind)) return NextResponse.json({ error: "Unknown form." }, { status: 400 });
  try {
    const user = await getCookieUser().catch(() => null);
    const r = await submitHub(kind, body, { ip: clientIp(request), origin: request.nextUrl.origin, userId: user?.id ?? null });
    return r.ok ? NextResponse.json({ ok: true, message: r.message }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error("[hubs] submit failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
