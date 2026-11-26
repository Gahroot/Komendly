// Public: 302 to a 10-minute presigned URL of the reel's MP4 (Meta pulls it by URL when publishing the Reel).
import { NextResponse } from "next/server";
import { presignGet } from "@/lib/ads/storage";
import { reelVideoKey } from "@/lib/growth/reels-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ reelId: string }> }) {
  const { reelId } = await params;
  const v = await reelVideoKey(reelId);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(await presignGet(v.key, { seconds: 600 }), 302);
}
