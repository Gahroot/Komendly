// DB loader for the unified hub (/dashboard, /dashboard/library, /api/hub/summary). View logic lives in summary.ts.
import type { AdsWorkspace, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/ads/storage";
import {
  canMakeTestimonials, firstNameOf, mergeRecent, planView, walletView,
  type HubApp, type HubCounts, type HubItem, type HubSummary,
} from "./summary";

const TESTI_READY = new Set(["completed"]);
const TESTI_FAILED = new Set(["failed"]);

async function posterUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await presignGet(key, { seconds: 600 });
  } catch {
    return null;
  }
}

export async function loadHubCounts(user: User, ws: AdsWorkspace): Promise<HubCounts> {
  const [ads, studio, gen, fal] = await Promise.all([
    prisma.ad.count({ where: { workspaceId: ws.id, status: "ready" } }),
    prisma.studioRender.count({ where: { workspaceId: ws.id } }),
    prisma.generatedVideo.count({ where: { userId: user.id, status: "completed" } }),
    prisma.falCompositeVideo.count({ where: { userId: user.id, status: "completed" } }),
  ]);
  return { ads, studio, testimonials: gen + fal };
}

/** Things the user made, newest first. `app` narrows to one app. */
export async function loadHubItems(user: User, ws: AdsWorkspace, opts: { app?: HubApp | null; limit: number }): Promise<HubItem[]> {
  const want = (a: HubApp) => !opts.app || opts.app === a;
  const take = opts.limit;
  const [ads, renders, gen, fal] = await Promise.all([
    want("ads")
      ? prisma.ad.findMany({
          where: { workspaceId: ws.id, status: { in: ["ready", "rendering", "qc", "planned"] } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take,
          select: { id: true, runId: true, headline: true, kind: true, status: true, createdAt: true, assets: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true, mime: true } } },
        })
      : [],
    want("studio")
      ? prisma.studioRender.findMany({
          where: { workspaceId: ws.id },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take,
          select: { id: true, sessionId: true, version: true, posterKey: true, createdAt: true, session: { select: { title: true } } },
        })
      : [],
    want("testimonials")
      ? prisma.generatedVideo.findMany({
          where: { userId: user.id },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take,
          select: { id: true, status: true, thumbnailUrl: true, createdAt: true, review: { select: { reviewerName: true, businessName: true } } },
        })
      : [],
    want("testimonials")
      ? prisma.falCompositeVideo.findMany({
          where: { userId: user.id },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take,
          select: { id: true, status: true, thumbnailUrl: true, createdAt: true, review: { select: { reviewerName: true, businessName: true } } },
        })
      : [],
  ]);
  const studioItems = await Promise.all(
    renders.map(async (r): Promise<HubItem> => ({
      id: `studio:${r.id}`,
      app: "studio",
      title: r.version > 1 ? `${r.session.title} (v${r.version})` : r.session.title,
      media: "video",
      thumbUrl: await posterUrl(r.posterKey),
      href: `/studio/${r.sessionId}`,
      status: "ready",
      createdAt: r.createdAt.toISOString(),
    })),
  );
  const adItems = ads.map((a): HubItem => {
    const asset = a.assets[0];
    return {
      id: `ads:${a.id}`,
      app: "ads",
      title: a.headline,
      media: asset?.mime.startsWith("video/") || a.kind === "motion" ? "video" : "image",
      thumbUrl: asset && !asset.mime.startsWith("video/") ? `/api/ads/assets/${asset.id}/preview` : null,
      href: `/ads/runs/${a.runId}`,
      status: a.status === "ready" ? "ready" : "working",
      createdAt: a.createdAt.toISOString(),
    };
  });
  const testi = [...gen, ...fal].map((v): HubItem => ({
    id: `testimonials:${v.id}`,
    app: "testimonials",
    title: `${v.review.reviewerName} for ${v.review.businessName}`,
    media: "video",
    thumbUrl: v.thumbnailUrl || null,
    href: "/dashboard/videos",
    status: TESTI_READY.has(v.status) ? "ready" : TESTI_FAILED.has(v.status) ? "failed" : "working",
    createdAt: v.createdAt.toISOString(),
  }));
  return mergeRecent([...adItems, ...studioItems, ...testi], take);
}

export async function loadHubSummary(user: User, ws: AdsWorkspace, now: Date): Promise<HubSummary> {
  const [counts, recent] = await Promise.all([loadHubCounts(user, ws), loadHubItems(user, ws, { limit: 8 })]);
  return {
    firstName: firstNameOf(user),
    wallet: walletView(user, ws),
    plan: planView(user, ws, now),
    counts,
    canMakeTestimonials: canMakeTestimonials(user),
    recent,
  };
}
