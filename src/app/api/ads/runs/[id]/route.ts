import { NextResponse } from "next/server";
import { loadRunView } from "@/lib/ads/run-view";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireWorkspaceMember({ runId: id });
    const view = await loadRunView(id);
    if (!view) throw new AdsHttpError(404, "not_found", "Not found.");
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
