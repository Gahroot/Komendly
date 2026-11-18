import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/ads/storage";

/** Review-gift video: the engine-rendered quote video lives in S3, served via a short presigned redirect (<= 10 min). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return new NextResponse(null, { status: 404 });
  const g = await prisma.klyReviewGift.findUnique({ where: { token }, select: { status: true, videoKey: true, videoUrl: true } }).catch(() => null);
  if (!g || g.status !== "ready") return new NextResponse(null, { status: 404 });
  const url = g.videoKey ? await presignGet(g.videoKey, { seconds: 600 }) : g.videoUrl;
  if (!url) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
