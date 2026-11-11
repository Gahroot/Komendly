import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { AdsHttpError, adsErrorResponse, isPaidWorkspace } from "@/lib/ads/workspace";
import { STUDIO_STARTERS } from "@/lib/studio/contracts";
import { sessionSummary, studioAccess, studioAccountFor } from "@/lib/studio/server";
import { trackAdsEvent } from "@/lib/ads/events";
import { DEVICE_COOKIE, fingerprintFrom } from "@/lib/ads/run";
import { claimStudioFreeVideo, revokeStudioFreeVideos } from "@/lib/studio/abuse";
import { forwardStudioFirstRender } from "@/lib/studio/analytics";

const Body = z.object({ starterId: z.string().max(40).optional(), prompt: z.string().max(8000).optional() });

function titleFrom(prompt: string | undefined, starterTitle: string | undefined): string {
  if (starterTitle) return starterTitle;
  const t = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "New video";
  return t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
}

export async function POST(request: NextRequest) {
  try {
    const { user, workspace } = await studioAccess();
    if (!(await rateLimit(`studio-sessions:${user.id}`, 40, 3600))) throw new AdsHttpError(429, "rate_limited", "Slow down a little: too many new chats this hour.");
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Invalid request.");
    const starter = STUDIO_STARTERS.find((s) => s.id === parsed.data.starterId);
    // Free-video abuse guard (one free video per person): blocked -> no free video, the first message hits the paywall.
    let freeVideo = !isPaidWorkspace(workspace) && workspace.studioFreeVideos > 0;
    const guard = freeVideo ? await claimStudioFreeVideo({ workspaceId: workspace.id, userId: user.id, email: user.email, fp: fingerprintFrom(request) }) : null;
    if (guard && !guard.ok) {
      freeVideo = false;
      await revokeStudioFreeVideos(workspace.id);
      await trackAdsEvent("studio_free_blocked", { workspaceId: workspace.id, userId: user.id, props: { reason: guard.reason } });
    }
    const session = await prisma.studioSession.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        title: titleFrom(parsed.data.prompt, starter?.title),
        starterId: starter?.id ?? null,
        freeVideo,
      },
    });
    await trackAdsEvent("studio_session_started", { workspaceId: workspace.id, userId: user.id, props: { starterId: starter?.id, fromPrompt: !!parsed.data.prompt?.trim(), free: freeVideo } });
    await forwardStudioFirstRender(workspace.id, user.id);
    const res = NextResponse.json({ session: sessionSummary(session), ...(guard && !guard.ok ? { freeBlocked: true, reason: guard.reason } : {}) }, { status: 201 });
    // The ads flow's first-party device cookie (fingerprint for the free-video guard); set it if /ads never did.
    if (!request.cookies.get(DEVICE_COOKIE)) res.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (error) {
    return adsErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { workspace } = await studioAccess();
    const archived = request.nextUrl.searchParams.get("archived") === "1";
    const sessions = await prisma.studioSession.findMany({
      where: { workspaceId: workspace.id, archivedAt: archived ? { not: null } : null },
      orderBy: { lastActivityAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ sessions: sessions.map(sessionSummary), account: await studioAccountFor(workspace) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
