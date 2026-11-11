// Ads -> Studio bridge: open a Studio chat seeded with the user's own ad (copied into a StudioUpload) and send
// the first message, so Ozzy starts right away with their ad + brand. Flag studio_bridge (default off).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { parseBonus } from "@/lib/ads/bonus-access";
import { isBonusUnlockedById } from "@/lib/ads/bonus-unlock";
import { getBalance } from "@/lib/ads/credits";
import { trackAdsEvent } from "@/lib/ads/events";
import { DEVICE_COOKIE, fingerprintFrom, PRIORITY } from "@/lib/ads/run";
import { parseExtraction } from "@/lib/ads/run-confirm";
import { AdsHttpError, adsErrorResponse, isPaidWorkspace, requireWorkspaceMember } from "@/lib/ads/workspace";
import { claimStudioFreeVideo, revokeStudioFreeVideos } from "@/lib/studio/abuse";
import { BRIDGE_PLACEMENTS, BRIDGE_STARTERS, bridgePrompt, bridgeTitle, domainOf, pickBridgeAsset, type BridgeStarter } from "@/lib/studio/bridge";
import { copyObject, studioBridgeEnabled } from "@/lib/studio/bridge-server";
import { canStartStudioTurn, STUDIO_TURN_JOB_TYPE, studioKeys, type StudioTurnPayload } from "@/lib/studio/contracts";

const Body = z
  .object({
    adId: z.string().min(1).max(64).optional(),
    runId: z.string().min(1).max(64).optional(),
    starter: z.enum(BRIDGE_STARTERS).optional(),
    /** The user's own words from the bridge card (wins over the starter's canned prompt). */
    prompt: z.string().trim().min(2).max(2000).optional(),
    placement: z.enum(BRIDGE_PLACEMENTS).default("ad_card"),
  })
  .refine((b) => b.adId || b.runId, "adId or runId required");

const LOGO_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

interface Seed {
  runId: string;
  url: string;
  starter: BridgeStarter;
  headline: string | null;
  adKind: string | null;
  file: { key: string; mime: string; bytes: number; width: number | null; height: number | null; filename: string } | null;
}

async function seedFrom(b: z.infer<typeof Body>): Promise<{ seed: Seed; workspaceId: string }> {
  if (b.adId) {
    const ad = await prisma.ad.findUnique({ where: { id: b.adId }, include: { assets: true, run: { select: { id: true, url: true } } } });
    if (!ad) throw new AdsHttpError(404, "not_found", "Not found.");
    const { workspace } = await requireWorkspaceMember({ runId: ad.runId });
    if (ad.status !== "ready") throw new AdsHttpError(409, "not_ready", "This ad isn't ready yet.");
    if (parseBonus(ad.visualBrief) && !(await isBonusUnlockedById(workspace.id))) throw new AdsHttpError(403, "locked", "This bonus ad is locked.");
    const asset = pickBridgeAsset(ad.kind, ad.assets.filter((a) => a.ratio !== "preview"));
    if (!asset) throw new AdsHttpError(404, "not_found", "This ad has no file to send.");
    const ext = asset.mime === "video/mp4" ? "mp4" : asset.mime === "image/jpeg" ? "jpg" : asset.mime === "image/webp" ? "webp" : "png";
    return {
      workspaceId: workspace.id,
      seed: {
        runId: ad.runId,
        url: ad.run.url,
        starter: b.starter ?? (ad.kind === "motion" ? "motion_edit" : "reels"),
        headline: ad.headline,
        adKind: ad.kind,
        file: { key: asset.storageKey, mime: asset.mime, bytes: asset.bytes, width: asset.width, height: asset.height, filename: `ad-${ad.index + 1}-${asset.ratio.replace(":", "x")}.${ext}` },
      },
    };
  }
  const runId = b.runId ?? "";
  const { workspace } = await requireWorkspaceMember({ runId });
  const run = await prisma.adRun.findUniqueOrThrow({ where: { id: runId }, include: { brandProfile: { select: { logoKey: true } } } });
  const starter = b.starter === "logo" ? "logo" : "promo";
  const logoKey = starter === "logo" ? (parseExtraction(run.extraction)?.logoKey ?? run.brandProfile?.logoKey ?? null) : null;
  const ext = logoKey?.split(".").pop()?.toLowerCase() ?? "";
  const mime = LOGO_MIME[ext];
  return {
    workspaceId: workspace.id,
    seed: { runId, url: run.url, starter, headline: null, adKind: null, file: logoKey && mime ? { key: logoKey, mime, bytes: 0, width: null, height: null, filename: `logo.${ext}` } : null },
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!(await studioBridgeEnabled())) throw new AdsHttpError(404, "not_found", "Not found.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Invalid request.");
    const { seed, workspaceId } = await seedFrom(parsed.data);
    const { user, workspace } = await requireWorkspaceMember({ workspaceId });
    if (workspace.suspendedAt) throw new AdsHttpError(403, "suspended", "This workspace is suspended.");
    if (!(await rateLimit(`studio-sessions:${user.id}`, 40, 3600))) throw new AdsHttpError(429, "rate_limited", "Slow down a little: too many new chats this hour.");
    await trackAdsEvent("studio_bridge_clicked", { workspaceId, userId: user.id, runId: seed.runId, props: { placement: parsed.data.placement, adKind: seed.adKind ?? seed.starter, starter: seed.starter } });

    // Same free-video guard as POST /api/studio/sessions (one free video per person).
    const paid = isPaidWorkspace(workspace);
    let freeVideo = !paid && workspace.studioFreeVideos > 0;
    const guard = freeVideo ? await claimStudioFreeVideo({ workspaceId, userId: user.id, email: user.email, fp: fingerprintFrom(request) }) : null;
    if (guard && !guard.ok) {
      freeVideo = false;
      await revokeStudioFreeVideos(workspaceId);
      await trackAdsEvent("studio_free_blocked", { workspaceId, userId: user.id, props: { reason: guard.reason } });
    }
    const fresh = await prisma.adsWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const gate = canStartStudioTurn({ priorRenders: 0, sessionFree: freeVideo, freeVideosLeft: fresh.studioFreeVideos, balance: await getBalance(workspaceId), isPaidWorkspace: paid });
    if (!gate.ok) {
      // No free video and no credits: open Studio home with the prompt prefilled; sending it shows the paywall.
      const prompt = parsed.data.prompt ?? bridgePrompt({ starter: seed.starter, headline: seed.headline, url: seed.url, hasLogo: false });
      return NextResponse.json({ sessionId: null, url: `/studio?prompt=${encodeURIComponent(prompt)}`, sent: false }, { status: 200 });
    }
    const domain = domainOf(seed.url);
    const session = await prisma.studioSession.create({ data: { workspaceId, userId: user.id, title: bridgeTitle(seed.starter, domain), starterId: `bridge_${seed.starter}`, freeVideo } });
    await trackAdsEvent("studio_session_started", { workspaceId, userId: user.id, props: { starterId: `bridge_${seed.starter}`, fromAd: true, free: freeVideo } });

    let uploadId: string | null = null;
    if (seed.file) {
      const upload = await prisma.studioUpload.create({
        data: { workspaceId, userId: user.id, sessionId: session.id, key: `pending/${session.id}`, filename: seed.file.filename, mime: seed.file.mime, bytes: seed.file.bytes, width: seed.file.width, height: seed.file.height, status: "pending" },
      });
      const key = studioKeys.upload(workspaceId, upload.id, seed.file.filename);
      try {
        await copyObject(seed.file.key, key, seed.file.mime, request.signal);
        await prisma.studioUpload.update({ where: { id: upload.id }, data: { key, status: "ready" } });
        uploadId = upload.id;
      } catch {
        await prisma.studioUpload.update({ where: { id: upload.id }, data: { key, status: "failed" } });
      }
    }

    const content = parsed.data.prompt
      ? `${parsed.data.prompt}${parsed.data.prompt.includes(seed.url) ? "" : `\n\nMy website: ${seed.url}`}${uploadId ? "\n(I attached one of my ads from Komendly; use it if it helps.)" : ""}`
      : bridgePrompt({ starter: seed.starter, headline: seed.headline, url: seed.url, hasLogo: uploadId !== null });
    {
      await prisma.$transaction(async (tx) => {
        await tx.studioSession.update({ where: { id: session.id }, data: { status: "queued", lastActivityAt: new Date() } });
        const userMessage = await tx.studioMessage.create({ data: { sessionId: session.id, role: "user", content, attachments: uploadId ? [{ uploadId }] : [], status: "done" } });
        const assistant = await tx.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
        const payload: StudioTurnPayload = { sessionId: session.id, userMessageId: userMessage.id, assistantMessageId: assistant.id };
        const job = await tx.adJob.create({ data: { type: STUDIO_TURN_JOB_TYPE, workspaceId, payload: { ...payload }, priority: paid ? PRIORITY.paid : PRIORITY.trial, maxAttempts: 2 } });
        await tx.studioMessage.update({ where: { id: assistant.id }, data: { jobId: job.id } });
      });
      await trackAdsEvent("studio_message_sent", { workspaceId, userId: user.id, props: { turn: 1, uploads: uploadId ? 1 : 0, sessionId: session.id, fromAd: true } });
    }
    const res = NextResponse.json({ sessionId: session.id, url: `/studio/${session.id}`, sent: true }, { status: 201 });
    if (!request.cookies.get(DEVICE_COOKIE)) res.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (error) {
    return adsErrorResponse(error);
  }
}
