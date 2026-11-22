import { NextResponse } from "next/server";
import { deleteLead, requireTeamAccess } from "@/lib/ads/team/server";
import { adsErrorResponse } from "@/lib/ads/workspace";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteLead(await requireTeamAccess(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
