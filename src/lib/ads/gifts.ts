// Gift a pack: a user asks Ozzy to make 3 free statics for another business's website, shared as /gift/<token>.
// Web creates AdsGift + an AdRun kind=gift (no credits, no trial claim) and enqueues its extract job like run-start;
// the engine auto-confirms gift runs, updates AdsGift.status and emits gift_ready.
import { randomBytes } from "node:crypto";
import type { AdsWorkspace, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSafeTargetUrl, hashIdentity, normalizeEmail, rateLimit, registrableDomain } from "./abuse";
import { TRIAL_AWARENESS_MIX, TRIAL_RATIOS } from "./contracts";
import { isPaidWorkspace } from "./billing-gates";
import { getPlan } from "./billing-config";
import { trackAdsEvent } from "./events";
import { enqueueJob } from "./jobs";
import { normalizeUrl, PRIORITY } from "./run";
import { isWebmailDomain } from "./referrals";
import { AdsHttpError } from "./workspace";
import { ENCORE_STATIC, encoreState, ON_CLICK_STATIC } from "@/lib/kly/encore";

export const GIFT_STATIC_COUNT = 3;
export const PARTNER_DEMO_DEFAULT = 3;
const GIFTS_PER_HOUR = 5;

export type GiftSource = "trial_ready" | "paid_monthly" | "partner_demo" | "admin_outreach" | "outbound";
export type GiftStatus = "pending" | "generating" | "ready" | "failed";

export const CreateGiftSchema = z.object({
  url: z.string().trim().min(3).max(2048),
  senderName: z.string().trim().min(1).max(40),
  recipientName: z.string().trim().max(60).optional(),
  note: z.string().trim().max(280).optional(),
});
export type CreateGiftInput = z.infer<typeof CreateGiftSchema>;

export interface GiftQuotaInput {
  isAdmin: boolean;
  /** demoGiftsPerMonth of an approved partner, else null. */
  partnerPerMonth: number | null;
  isPaid: boolean;
  /** Gift packs per month on the paid plan (billing-config giftsPerMonth, default 1). */
  paidPerMonth?: number;
  /** Non-failed gifts ever sent by this workspace, and this calendar month per source. */
  total: number;
  monthBySource: Partial<Record<GiftSource, number>>;
}
export type GiftQuota = { ok: true; source: GiftSource; remaining: number | null } | { ok: false; reason: "quota_used"; message: string; perk: "trial" | "paid" };

/** Pure quota rules: admin unlimited; partners N/month; paid 1/month; trial 1 total. `remaining` counts after this gift. */
export function decideGiftQuota(q: GiftQuotaInput): GiftQuota {
  if (q.isAdmin) return { ok: true, source: "admin_outreach", remaining: null };
  if (q.partnerPerMonth !== null) {
    const used = q.monthBySource.partner_demo ?? 0;
    if (used < q.partnerPerMonth) return { ok: true, source: "partner_demo", remaining: q.partnerPerMonth - used - 1 };
  }
  if (q.isPaid) {
    const per = q.paidPerMonth ?? 1;
    const used = q.monthBySource.paid_monthly ?? 0;
    if (used < per) return { ok: true, source: "paid_monthly", remaining: per - used - 1 };
    return { ok: false, reason: "quota_used", perk: "paid", message: "You've sent this month's gift packs. You get more on the 1st." };
  }
  if (q.total < 1) return { ok: true, source: "trial_ready", remaining: 0 };
  return { ok: false, reason: "quota_used", perk: "trial", message: "You've sent your free gift pack. Paid plans include 1 gift pack every month." };
}

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function newGiftToken(): string {
  return randomBytes(12).toString("base64url");
}

export function isGiftToken(v: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(v);
}

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|discord|slack|twitter|linkedin|embedly|preview|headless|lighthouse|curl|wget|python|axios|node-fetch|go-http|skype|pinterest|vkshare|quora|redditbot|applebot|bingpreview|google-inspectiontool/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  return !ua || BOT_UA.test(ua);
}

/** Pure: the domains a sender may not gift (their own company / brands). */
export function isOwnDomain(target: string, sender: { email: string; brandDomains: string[] }): boolean {
  const t = registrableDomain(target);
  const emailDomain = normalizeEmail(sender.email).split("@")[1] ?? "";
  if (emailDomain && !isWebmailDomain(emailDomain) && registrableDomain(emailDomain) === t) return true;
  return sender.brandDomains.some((d) => registrableDomain(d) === t);
}

/** Optional `giftsPerMonth` on the plan tier (default 1). */
export function plansGiftsPerMonth(planKey: string): number {
  const plan: object | undefined = getPlan(planKey);
  const n = plan && "giftsPerMonth" in plan ? plan.giftsPerMonth : undefined;
  return typeof n === "number" && n >= 0 ? n : 1;
}

export async function giftQuotaFor(user: User, workspace: AdsWorkspace, now: Date = new Date()): Promise<GiftQuota> {
  const [partner, total, month] = await Promise.all([
    prisma.adsPartner.findUnique({ where: { workspaceId: workspace.id }, select: { status: true, demoGiftsPerMonth: true } }),
    prisma.adsGift.count({ where: { senderWorkspaceId: workspace.id, status: { not: "failed" } } }),
    prisma.adsGift.groupBy({ by: ["source"], where: { senderWorkspaceId: workspace.id, status: { not: "failed" }, createdAt: { gte: monthStart(now) } }, _count: { _all: true } }),
  ]);
  const monthBySource: Partial<Record<GiftSource, number>> = {};
  for (const m of month) monthBySource[m.source as GiftSource] = m._count._all;
  return decideGiftQuota({
    isAdmin: user.isAdmin,
    partnerPerMonth: partner?.status === "approved" ? (partner.demoGiftsPerMonth ?? PARTNER_DEMO_DEFAULT) : null,
    isPaid: isPaidWorkspace(workspace),
    paidPerMonth: plansGiftsPerMonth(workspace.adsPlan),
    total,
    monthBySource,
  });
}

export async function createGift(input: CreateGiftInput, ctx: { user: User; workspace: AdsWorkspace }): Promise<{ id: string; token: string }> {
  const { user, workspace } = ctx;
  if (workspace.suspendedAt) throw new AdsHttpError(403, "suspended", "This workspace is suspended.");
  if (!user.emailVerifiedAt) throw new AdsHttpError(403, "email_unverified", "Confirm your email first, then you can send a gift pack.");
  const quota = await giftQuotaFor(user, workspace);
  if (!quota.ok) throw new AdsHttpError(402, quota.reason, quota.message, { perk: quota.perk });
  if (!(await rateLimit(`gifts:${user.id}`, GIFTS_PER_HOUR, 3600))) {
    throw new AdsHttpError(429, "rate_limited", "You're sending gifts very quickly. Give it a few minutes and try again.");
  }
  let target: URL;
  try {
    target = await assertSafeTargetUrl(normalizeUrl(input.url));
  } catch (error) {
    throw new AdsHttpError(400, "blocked_url", error instanceof Error && error.message ? error.message : "That doesn't look like a public website.");
  }
  const brands = await prisma.brandProfile.findMany({ where: { workspaceId: workspace.id, runs: { some: { kind: { not: "gift" } } } }, select: { domain: true } });
  if (quota.source !== "admin_outreach" && isOwnDomain(target.hostname, { email: user.email, brandDomains: brands.map((b) => b.domain) })) {
    throw new AdsHttpError(400, "own_domain", "That's your own website. Gift packs are for someone else's business.");
  }
  const url = target.toString();
  const gift = await prisma.$transaction(async (tx) => {
    const run = await tx.adRun.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        url,
        goal: "auto",
        status: "extracting",
        isTrial: false,
        kind: "gift",
        staticCount: GIFT_STATIC_COUNT,
        motionCount: 0,
        creditsReserved: 0,
        ratios: TRIAL_RATIOS,
        awarenessMix: TRIAL_AWARENESS_MIX,
      },
    });
    return tx.adsGift.create({
      data: {
        token: newGiftToken(),
        senderWorkspaceId: workspace.id,
        senderUserId: user.id,
        senderName: input.senderName,
        recipientUrl: url,
        recipientDomainHash: hashIdentity("domain", registrableDomain(target.hostname)),
        recipientName: input.recipientName || null,
        note: input.note || null,
        source: quota.source,
        runId: run.id,
      },
    });
  });
  if (gift.runId) await enqueueJob({ type: "extract", runId: gift.runId, workspaceId: workspace.id, priority: PRIORITY.trial, payload: { url } });
  await trackAdsEvent("gift_created", { workspaceId: workspace.id, userId: user.id, runId: gift.runId ?? undefined, props: { giftId: gift.id, source: quota.source, domain: registrableDomain(target.hostname) } });
  return { id: gift.id, token: gift.token };
}

// ---------------------------------------------------------------------------
// Views

export interface GiftAdView {
  id: string;
  headline: string;
  imageUrl: string;
  width: number;
  height: number;
}
export interface GiftView {
  id: string;
  token: string;
  status: GiftStatus;
  senderName: string;
  recipientName: string | null;
  businessName: string;
  domain: string;
  url: string;
  note: string | null;
  viewCount: number;
  viewedAt: string | null;
  claimedAt: string | null;
  createdAt: string;
  ads: GiftAdView[];
  expected: number;
  source: string;
  /** Outbound only: the 2 extra ads Ozzy draws live once a real person opens the page. */
  encore: "none" | "drawing" | "done" | "failed";
}

/** Cold-outbound hook gifts carry one ad; every other gift pack has 3. */
export function giftExpected(source: string): number {
  return source === "outbound" ? 1 : GIFT_STATIC_COUNT;
}

type GiftRow = NonNullable<Awaited<ReturnType<typeof prisma.adsGift.findUnique>>>;

function brandNameOf(extraction: unknown): string | null {
  const n = (extraction as { brandName?: unknown } | null)?.brandName;
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 60) : null;
}

/** Gift + its ready static ads; image URLs go through the token-checked public route. */
export async function giftView(gift: GiftRow): Promise<GiftView> {
  const run = gift.runId
    ? await prisma.adRun.findUnique({
        where: { id: gift.runId },
        select: {
          status: true,
          extraction: true,
          staticCount: true,
          ads: { where: { kind: "static", status: "ready" }, orderBy: { index: "asc" }, include: { assets: { where: { mime: { startsWith: "image/" } } } } },
        },
      })
    : null;
  const domain = new URL(gift.recipientUrl).hostname.replace(/^www\./, "");
  // Kly on-click gift: no run until a real person opens the page, then one 3-ad run (no encore).
  const onClick = gift.source === "outbound" && (!gift.runId || (run?.staticCount ?? 0) >= ON_CLICK_STATIC);
  const ads: GiftAdView[] = (run?.ads ?? []).flatMap((ad) => {
    const asset = ad.assets.find((a) => a.ratio === "1:1") ?? ad.assets.find((a) => a.ratio !== "preview") ?? ad.assets[0];
    return asset ? [{ id: ad.id, headline: ad.headline, imageUrl: `/api/ads/gift-public/${gift.token}/img/${asset.id}`, width: asset.width, height: asset.height }] : [];
  }).slice(0, onClick ? ON_CLICK_STATIC : giftExpected(gift.source));
  // Outbound encore: up to 2 more ads from a second gift run, appended after the hook ad.
  const extra = gift.source === "outbound" && gift.extraRunId
    ? await prisma.adRun.findUnique({
        where: { id: gift.extraRunId },
        select: { status: true, ads: { where: { kind: "static", status: "ready" }, orderBy: { index: "asc" }, include: { assets: { where: { mime: { startsWith: "image/" } } } } } },
      })
    : null;
  const encore = onClick ? "done" : gift.source === "outbound" ? encoreState(extra, gift.extraRunId) : "none";
  const extraAds: GiftAdView[] = (extra?.ads ?? []).flatMap((ad) => {
    const asset = ad.assets.find((a) => a.ratio === "1:1") ?? ad.assets.find((a) => a.ratio !== "preview") ?? ad.assets[0];
    return asset ? [{ id: ad.id, headline: ad.headline, imageUrl: `/api/ads/gift-public/${gift.token}/img/${asset.id}`, width: asset.width, height: asset.height }] : [];
  }).slice(0, ENCORE_STATIC);
  const allAds = [...ads, ...extraAds];
  const runOver = gift.status === "ready" || gift.status === "failed" || (run && ["completed", "partial", "failed", "canceled"].includes(run.status));
  const expected = onClick ? (runOver ? allAds.length : ON_CLICK_STATIC) : gift.source !== "outbound" ? giftExpected(gift.source) : encore === "done" || encore === "failed" ? allAds.length : 1 + ENCORE_STATIC;
  const runDone = run && ["completed", "partial"].includes(run.status);
  const runFailed = run && ["failed", "canceled"].includes(run.status);
  // Engine owns AdsGift.status; fall back to the run's state if it hasn't written it yet.
  const status: GiftStatus = gift.status === "ready" || gift.status === "failed" ? (gift.status as GiftStatus)
    : runDone && ads.length > 0 ? "ready" : runFailed ? "failed" : run && run.status !== "extracting" ? "generating" : (gift.status as GiftStatus);
  return {
    id: gift.id,
    token: gift.token,
    status,
    senderName: gift.senderName,
    recipientName: gift.recipientName,
    businessName: brandNameOf(run?.extraction) ?? gift.recipientName ?? domain,
    domain,
    url: gift.recipientUrl,
    note: gift.note,
    viewCount: gift.viewCount,
    viewedAt: gift.viewedAt?.toISOString() ?? null,
    claimedAt: gift.claimedAt?.toISOString() ?? null,
    createdAt: gift.createdAt.toISOString(),
    ads: allAds,
    expected,
    source: gift.source,
    encore,
  };
}

export async function giftByToken(token: string) {
  if (!isGiftToken(token)) return null;
  return prisma.adsGift.findUnique({ where: { token } });
}

/** Is the recipient's domain already on Komendly (trial claimed)? Then the gift page offers "log in". */
export async function recipientHasAccount(domainHash: string): Promise<boolean> {
  return !!(await prisma.adsTrialClaim.findFirst({ where: { domainHash }, select: { id: true } }));
}

/** Public view beacon: counts humans only, never the sender. */
export async function recordGiftView(token: string, ctx: { ua: string | null; isMetaIp: boolean; viewerUserId: string | null }): Promise<boolean> {
  const gift = await giftByToken(token);
  if (!gift || isBotUserAgent(ctx.ua) || ctx.isMetaIp || ctx.viewerUserId === gift.senderUserId) return false;
  await prisma.adsGift.update({ where: { id: gift.id }, data: { viewCount: { increment: 1 }, viewedAt: gift.viewedAt ?? new Date() } });
  await trackAdsEvent("gift_viewed", { workspaceId: gift.senderWorkspaceId, props: { giftId: gift.id, first: !gift.viewedAt } });
  return true;
}
