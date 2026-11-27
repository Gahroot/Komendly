// Download proxy for the signed-in user's own video URLs. Hardened: real session required (the middleware only checks that a cookie
// exists), https + public-address only (SSRF), no redirect following, header-safe filename.
import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { getCookieUser } from "@/lib/auth";
import { assertPublicHttpsUrl, safeDownloadName } from "@/lib/ops/security/url-guard";

export async function GET(request: NextRequest) {
  const user = await getCookieUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fileUrl = request.nextUrl.searchParams.get("url");
  const filename = safeDownloadName(request.nextUrl.searchParams.get("filename"));
  if (!fileUrl) return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });

  try {
    const url = await assertPublicHttpsUrl(fileUrl, async (h) => (await lookup(h, { all: true })).map((a) => a.address)).catch(() => null);
    if (!url) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return NextResponse.json({ error: "Failed to fetch file" }, { status: response.status >= 300 && response.status < 400 ? 502 : response.status });
    const blob = await response.blob();
    const headers = new Headers();
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    headers.set("Content-Type", response.headers.get("Content-Type") || "video/mp4");
    headers.set("Content-Length", blob.size.toString());
    headers.set("X-Content-Type-Options", "nosniff");
    return new NextResponse(blob, { status: 200, headers });
  } catch (error) {
    console.error("Download proxy error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
