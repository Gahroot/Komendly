import { NextResponse } from "next/server";
import { adCheckByToken } from "@/lib/growth/ad-check-server";

export const dynamic = "force-dynamic";

/** Poll one check by its unguessable token: status only (the report itself renders at /ad-check/<token>). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const s = await adCheckByToken((await params).token);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ status: s.status, ok: s.result?.ok ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
