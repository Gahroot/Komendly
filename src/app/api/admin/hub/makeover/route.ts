import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { publishMakeover } from "@/lib/growth/creative-hubs-server";

export const dynamic = "force-dynamic";

/** Admin approval path for a public makeover: only a claimed gift, or the business's own public source on its own domain. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const r = await publishMakeover(user.id, { businessName: s("businessName"), siteUrl: s("siteUrl"), runId: s("runId"), basis: b.basis === "claimed" ? "claimed" : "own_public", giftToken: s("giftToken") || undefined, sourceUrl: s("sourceUrl") || undefined, caption: s("caption") || undefined });
  return r.ok ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ error: r.error }, { status: r.status });
}
