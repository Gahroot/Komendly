import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getObjectStream } from "@/lib/ads/storage";
import { verifyEmailToken } from "@/lib/ads/lifecycle/tokens";

/** Ad thumbnails in lifecycle emails: HMAC-signed, ~30-day token -> streams the AdAsset from S3. Public. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyEmailToken(token, process.env.LIFECYCLE_EMAIL_SECRET ?? "");
  if (!payload || payload.p !== "img") return new NextResponse("Not found", { status: 404 });
  const asset = await prisma.adAsset.findUnique({ where: { id: payload.a }, select: { storageKey: true, mime: true, expiresAt: true } });
  if (!asset || !asset.mime.startsWith("image/") || (asset.expiresAt && asset.expiresAt < new Date())) return new NextResponse("Not found", { status: 404 });
  try {
    const body = await getObjectStream(asset.storageKey);
    const maxAge = Math.max(0, payload.e - Math.floor(Date.now() / 1000));
    return new NextResponse(body, {
      headers: { "Content-Type": asset.mime, "Cache-Control": `public, max-age=${maxAge}, immutable`, "X-Robots-Tag": "noindex" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
