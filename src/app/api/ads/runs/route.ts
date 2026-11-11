import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE, fingerprintFrom } from "@/lib/ads/run";
import { startRun, StartRunSchema } from "@/lib/ads/run-start";
import type { RunSummary } from "@/lib/ads/run-types";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

export async function GET() {
  try {
    const user = await requireUser();
    const workspace = await getOrCreateWorkspace(user);
    const runs = await prisma.adRun.findMany({
      where: { workspaceId: workspace.id, kind: { notIn: ["gift", "nurture"] } }, // gift packs live on /ads/gifts; nurture runs (monthly locked fresh ad) only via their email link
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { ads: { select: { status: true } } },
    });
    const items: RunSummary[] = runs.map((r) => ({
      id: r.id,
      url: r.url,
      status: r.status,
      isTrial: r.isTrial,
      createdAt: r.createdAt.toISOString(),
      readyCount: r.ads.filter((a) => a.status === "ready").length,
      totalCount: r.staticCount + r.motionCount,
    }));
    return NextResponse.json({ runs: items });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = StartRunSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Enter a valid website URL.");
    const workspace = await getOrCreateWorkspace(user);
    const result = await startRun(parsed.data, { user, workspace, fp: fingerprintFrom(request) });
    const response = NextResponse.json(result, { status: result.resumed ? 200 : 201 });
    if (!request.cookies.get(DEVICE_COOKIE)) {
      response.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    return response;
  } catch (error) {
    return adsErrorResponse(error);
  }
}
