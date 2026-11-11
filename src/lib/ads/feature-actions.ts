// Ad of the week DB actions: user consent/withdraw, admin queue moves, featured-ad public reads.
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { renderEmailLayout } from "@/lib/email/layout";
import { pickFeatureAsset, publicFeatureImageUrl } from "./feature-assets";
import { parseBonus } from "./bonus-access";
import { isBonusUnlockedById } from "./bonus-unlock";
import { trackAdsEvent } from "./events";
import { canFeatureAd, defaultCaption, featuredEmailCopy, nextFeatureStatus, normalizeHandle } from "./features";
import { appBaseUrl, sendAdsMail } from "./mailer";
import { AdsHttpError, requireWorkspaceMember } from "./workspace";

const SITE = "https://www.komendly.com";

function brandNameOf(extraction: unknown, url: string): string {
  const name = (extraction as { brandName?: unknown } | null)?.brandName;
  if (typeof name === "string" && name.trim()) return name.trim().slice(0, 80);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export interface RunFeatures {
  enabled: boolean;
  brandName: string;
  byAd: Record<string, { status: string; handle: string | null; postUrl: string | null }>;
}

/** Feature state of every ad in a run (member-only). Gift runs: disabled. */
export async function loadRunFeatures(runId: string): Promise<RunFeatures> {
  await requireWorkspaceMember({ runId });
  const run = await prisma.adRun.findUnique({ where: { id: runId }, select: { kind: true, url: true, extraction: true, ads: { select: { id: true } } } });
  if (!run) throw new AdsHttpError(404, "not_found", "Not found.");
  const rows = await prisma.adsFeature.findMany({ where: { adId: { in: run.ads.map((a) => a.id) } } });
  const byAd: RunFeatures["byAd"] = {};
  for (const r of rows) byAd[r.adId] = { status: r.status, handle: r.handle, postUrl: r.status === "featured" ? r.postUrl : null };
  return { enabled: run.kind !== "gift", brandName: brandNameOf(run.extraction, run.url), byAd };
}

async function adForUser(adId: string) {
  const ad = await prisma.ad.findUnique({ where: { id: adId }, select: { id: true, status: true, workspaceId: true, visualBrief: true, run: { select: { kind: true } } } });
  if (!ad) throw new AdsHttpError(404, "not_found", "Not found.");
  const access = await requireWorkspaceMember({ workspaceId: ad.workspaceId });
  return { ad, access };
}

export async function consentFeature(input: { adId: string; handle: string; brandName: string }): Promise<{ status: string }> {
  const { ad, access } = await adForUser(input.adId);
  const locked = parseBonus(ad.visualBrief) !== null && !(await isBonusUnlockedById(ad.workspaceId));
  if (!canFeatureAd({ status: ad.status, locked }, ad.run.kind)) throw new AdsHttpError(400, "not_featureable", "This ad can't be featured.");
  const current = await prisma.adsFeature.findUnique({ where: { adId: ad.id } });
  const next = nextFeatureStatus(current?.status ?? null, "consent");
  if (!next) throw new AdsHttpError(409, "already", "This ad is already in the Ad of the week queue.");
  const data = { status: next, consentAt: new Date(), handle: normalizeHandle(input.handle) || null, brandName: input.brandName || null, userId: access.user.id, workspaceId: ad.workspaceId };
  await prisma.adsFeature.upsert({ where: { adId: ad.id }, create: { adId: ad.id, ...data }, update: data });
  await trackAdsEvent("feature_consented", { workspaceId: ad.workspaceId, userId: access.user.id, props: { adId: ad.id, hasHandle: !!data.handle } });
  return { status: next };
}

export async function withdrawFeature(adId: string): Promise<{ status: string }> {
  const { ad, access } = await adForUser(adId);
  const current = await prisma.adsFeature.findUnique({ where: { adId: ad.id } });
  const next = nextFeatureStatus(current?.status ?? null, "withdraw");
  if (!current || !next) throw new AdsHttpError(409, "not_consented", "Nothing to withdraw.");
  await prisma.adsFeature.update({ where: { id: current.id }, data: { status: next } });
  await trackAdsEvent("feature_withdrawn", { workspaceId: ad.workspaceId, userId: access.user.id, props: { adId: ad.id, from: current.status } });
  return { status: next };
}

async function unsubscribed(userId: string): Promise<boolean> {
  return Boolean(await prisma.adsEvent.findFirst({ where: { name: "email_unsubscribed", userId }, select: { id: true } }));
}

export async function adminFeatureAction(actor: User, input: { featureId: string; action: "shortlist" | "feature" | "decline"; caption?: string; postUrl?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const f = await prisma.adsFeature.findUnique({ where: { id: input.featureId } });
  if (!f) return { ok: false, error: "Not found" };
  const next = nextFeatureStatus(f.status, input.action);
  if (!next) return { ok: false, error: `Can't ${input.action} a ${f.status} ad` };
  const featuring = next === "featured";
  await prisma.adsFeature.update({
    where: { id: f.id },
    data: {
      status: next,
      ...(input.caption !== undefined ? { caption: input.caption || null } : {}),
      ...(featuring ? { featuredAt: new Date(), postUrl: input.postUrl || null, caption: input.caption || f.caption || defaultCaption(f.brandName, f.handle) } : {}),
    },
  });
  // Featured ads stay on the public page: keep their files past the temporary storage TTL.
  if (featuring) await prisma.adAsset.updateMany({ where: { adId: f.adId }, data: { expiresAt: null } });
  const event = next === "featured" ? "admin_feature_featured" : next === "shortlisted" ? "admin_feature_shortlisted" : "admin_feature_declined";
  await trackAdsEvent(event, { workspaceId: f.workspaceId, userId: f.userId, props: { featureId: f.id, adId: f.adId, actorId: actor.id } });
  if (featuring) {
    try {
      const user = await prisma.user.findUnique({ where: { id: f.userId }, select: { email: true } });
      if (user && !(await unsubscribed(f.userId))) {
        const run = await prisma.ad.findUnique({ where: { id: f.adId }, select: { runId: true } });
        const base = appBaseUrl(SITE);
        const copy = featuredEmailCopy(f.brandName, input.postUrl || null);
        const button = { label: "See it on Ad of the week", href: `${base}/ad-of-the-week` };
        await sendAdsMail({
          to: user.email,
          subject: copy.subject,
          html: renderEmailLayout({ appUrl: base, preheader: "We picked your ad.", heading: "Your ad is Ad of the week", paragraphs: copy.paragraphs, button, imageUrl: `${base}/brand/ozzy-ascended-happy.png` }),
          text: [...copy.paragraphs, "", `${button.label}: ${button.href}`, run ? `Your run: ${base}/ads/runs/${run.runId}` : ""].join("\n\n"),
        });
      }
    } catch (err) {
      console.error("[feature] email failed", err);
    }
  }
  return { ok: true };
}

export async function loadFeaturedAds(limit = 40) {
  const rows = await prisma.adsFeature.findMany({ where: { status: "featured" }, orderBy: [{ featuredAt: "desc" }, { id: "asc" }], take: limit });
  const ads = await prisma.ad.findMany({ where: { id: { in: rows.map((r) => r.adId) } }, select: { id: true, headline: true, assets: { select: { ratio: true, mime: true, width: true, height: true } } } });
  const byId = new Map(ads.map((a) => [a.id, a]));
  return rows.flatMap((r) => {
    const ad = byId.get(r.adId);
    const asset = ad ? pickFeatureAsset(ad.assets) : undefined;
    if (!ad || !asset) return [];
    return [{ id: r.id, adId: r.adId, brandName: r.brandName, handle: r.handle, caption: r.caption, postUrl: r.postUrl, featuredAt: r.featuredAt, headline: ad.headline, width: asset.width, height: asset.height, src: publicFeatureImageUrl(r.adId) }];
  });
}
