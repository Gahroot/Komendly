import { NextRequest, NextResponse } from "next/server";
import { loadShare } from "@/lib/studio/share";

type Ctx = { params: Promise<{ token: string }> };

/** Public: a shared Studio render (presigned URLs, ~10 min). */
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const share = await loadShare((await params).token);
    if (!share) return NextResponse.json({ error: "Not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json({ share }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=240" } });
  } catch (error) {
    console.error("[studio] share failed", error);
    return NextResponse.json({ error: "Something went wrong.", code: "internal" }, { status: 500 });
  }
}
