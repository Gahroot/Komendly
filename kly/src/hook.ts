// The hook ad: one static per lead through the engine's existing gift pipeline (AdRun kind=gift, auto-confirmed,
// no credits, AdsGift source "outbound" -> public /gift/<token>), enqueued as an `extract` AdJob in Postgres exactly
// like the engine's own gift flow (priority -5 so paying customers go first). Kly never talks to the engine over HTTP.
// When the gift is ready, a Codex vision judge reviews the ad; weak ads are regenerated once, then dropped.
import { createHmac, randomBytes } from "node:crypto";
import { TRIAL_AWARENESS_MIX, TRIAL_RATIOS, type AdGoalValue } from "../../src/lib/ads/contracts";
import type { GiftTiming } from "../../src/lib/ads/outbound/copy";
import { enqueue } from "../../engine/src/queue/queue";
import type { AIProvider } from "./ai";
import { chooseArm, type Rng } from "./arms";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import { afterReject, judgeAd, qualityGate } from "./quality";
import { addCost, bumpDaily } from "./settings";

export const OUTBOUND_GIFT_SOURCE = "outbound";
/** Voice outcomes that asked for the gift (Tribunal call). */
export const VOICE_GIFT_STATUSES: readonly string[] = ["gift_yes", "info_requested"];
export const WEAK_SENT_NOTE = "weak (sent anyway: asked for it on the phone):";
export const GIFT_PRIORITY = -5;
export const STUCK_MS = 2 * 60 * 60_000;
export const ASSET_KEEP_MS = 60 * 86_400_000;

function domainHash(domain: string, env: NodeJS.ProcessEnv): string {
  const salt = env.ADS_HASH_SALT;
  if (!salt) throw new Error("ADS_HASH_SALT is not set");
  return createHmac("sha256", salt).update(`domain:${domain}`).digest("hex");
}

/** The workspace that "sends" outbound gifts: OUTBOUND_GIFT_WORKSPACE_ID, else the first admin's workspace. */
export async function senderWorkspace(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<{ workspaceId: string; userId: string } | null> {
  if (env.OUTBOUND_GIFT_WORKSPACE_ID) {
    const w = await db.adsWorkspace.findUnique({ where: { id: env.OUTBOUND_GIFT_WORKSPACE_ID }, select: { id: true, ownerId: true } });
    return w ? { workspaceId: w.id, userId: w.ownerId } : null;
  }
  // First admin-owned workspace (an admin without a workspace is skipped).
  const admins = await db.user.findMany({ where: { isAdmin: true, ...(env.OUTBOUND_ADMIN_EMAIL ? { email: env.OUTBOUND_ADMIN_EMAIL } : {}) }, select: { id: true } });
  if (admins.length === 0) return null;
  const w = await db.adsWorkspace.findFirst({ where: { ownerId: { in: admins.map((a) => a.id) } }, orderBy: { createdAt: "asc" }, select: { id: true, ownerId: true } });
  return w ? { workspaceId: w.id, userId: w.ownerId } : null;
}

/** The ad_angle arm as AdRun inputs the engine already supports (goal + awarenessMix); defaults otherwise. */
export function angleInputs(content: unknown): { goal: AdGoalValue; awarenessMix: Record<string, number> } {
  const c = (content ?? {}) as { goal?: AdGoalValue; awarenessMix?: Record<string, number> };
  return { goal: c.goal ?? "auto", awarenessMix: c.awarenessMix ?? (TRIAL_AWARENESS_MIX as Record<string, number>) };
}

export interface StartOpts {
  limit: number;
  senderName: string;
  minScore: number;
  rng: Rng;
  explorationPct: number;
  env?: NodeJS.ProcessEnv;
  leadIds?: string[];
}

// ---------------------------------------------------------------------------
// Gift timing (KlyArm dimension gift_timing): "prebuilt" = the hook ad is made and reviewed before the email (below);
// "on-click" = the email offers the drawing and Ozzy makes 3 ads live when the prospect opens the link (web app,
// src/lib/kly/encore.ts startOnClickRun). On-click leads skip AI entirely until someone actually looks.

/** Marks a lead whose gift is drawn on click (OutboundLead.qualityNotes; there is no quality review before sending). */
export const ON_CLICK_NOTE = "on-click: Ozzy draws the ads when the prospect opens the link";

export function timingOf(content: unknown): GiftTiming {
  return (content as { timing?: unknown } | null)?.timing === "on-click" ? "on-click" : "prebuilt";
}

async function timingArmIds(db: Db): Promise<{ all: string[]; prebuilt: string[]; onClick: { id: string } | null }> {
  const arms = await db.klyArm.findMany({ where: { dimension: "gift_timing" }, select: { id: true, status: true, content: true } });
  return {
    all: arms.map((a) => a.id),
    prebuilt: arms.filter((a) => timingOf(a.content) === "prebuilt").map((a) => a.id),
    onClick: arms.find((a) => timingOf(a.content) === "on-click" && a.status !== "retired") ?? null,
  };
}

/** Qualified leads assigned "prebuilt" that still wait for their hook ad (the queue startHookAds works through). */
export async function prebuiltWaiting(db: Db): Promise<number> {
  const t = await timingArmIds(db);
  return db.outboundLead.count({ where: { status: "found", giftId: null, ...(t.all.length ? { armIds: { hasSome: t.prebuilt } } : {}) } });
}

export interface TimingOpts {
  limit: number;
  senderName: string;
  minScore: number;
  rng: Rng;
  explorationPct: number;
  /** Codex or budget stop: every new lead goes on-click (no AI until a real click), so sending never starves. */
  forceOnClick: boolean;
  env?: NodeJS.ProcessEnv;
}

/** Give up to `limit` qualified leads their gift timing. On-click leads get their gift page now (no run) and are ready to send. */
export async function assignGiftTiming(db: Db, o: TimingOpts): Promise<{ onClick: number; prebuilt: number }> {
  const res = { onClick: 0, prebuilt: 0 };
  if (o.limit <= 0) return res;
  const t = await timingArmIds(db);
  if (t.all.length === 0) return res;
  const env = o.env ?? process.env;
  const leads = await db.outboundLead.findMany({
    where: { status: "found", giftId: null, email: { not: "" }, OR: [{ score: null }, { score: { gte: o.minScore } }], NOT: { armIds: { hasSome: t.all } } },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    take: o.limit,
  });
  let sender: { workspaceId: string; userId: string } | null = null;
  for (const lead of leads) {
    const arm = o.forceOnClick && t.onClick ? t.onClick : await chooseArm(db, "gift_timing", o.rng, o.explorationPct);
    if (!arm) break;
    const armIds = [...lead.armIds, arm.id];
    if (timingOf((arm as { content?: unknown }).content ?? { timing: "on-click" }) === "prebuilt") {
      const r = await db.outboundLead.updateMany({ where: { id: lead.id, giftId: null, status: "found" }, data: { armIds } });
      res.prebuilt += r.count;
      continue;
    }
    sender ??= await senderWorkspace(db, env);
    if (!sender) throw new Error("kly: no sender workspace (set OUTBOUND_GIFT_WORKSPACE_ID or OUTBOUND_ADMIN_EMAIL)");
    const s = sender;
    const ok = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`outbound-hook:${lead.id}`}))`;
      const fresh = await tx.outboundLead.findUnique({ where: { id: lead.id }, select: { giftId: true, status: true } });
      if (fresh?.giftId || fresh?.status !== "found") return false;
      // No AdRun yet: the web app starts it when a real person opens the gift page.
      const gift = await tx.adsGift.create({
        data: {
          token: randomBytes(12).toString("base64url"),
          senderWorkspaceId: s.workspaceId,
          senderUserId: s.userId,
          senderName: o.senderName.slice(0, 40),
          recipientUrl: lead.website,
          recipientDomainHash: domainHash(lead.domain, env),
          recipientName: lead.businessName.slice(0, 60),
          source: OUTBOUND_GIFT_SOURCE,
        },
      });
      await tx.outboundLead.update({ where: { id: lead.id }, data: { giftId: gift.id, giftToken: gift.token, armIds, status: "ad_made", qualityNotes: ON_CLICK_NOTE, error: null } });
      return true;
    });
    if (ok) res.onClick++;
  }
  return res;
}

/** Start the hook-ad gift run for qualified "found" leads without one (max `limit`). Only "prebuilt" leads (once the
 * gift_timing test exists); on-click leads never get a run here. */
export async function startHookAds(db: Db, o: StartOpts): Promise<number> {
  if (o.limit <= 0) return 0;
  const env = o.env ?? process.env;
  const t = o.leadIds ? null : await timingArmIds(db);
  const leads = await db.outboundLead.findMany({
    // Phone-only leads (email "") get a gift only when they ask for it on a call (voice passes leadIds).
    where: { status: "found", giftId: null, OR: [{ score: null }, { score: { gte: o.minScore } }], ...(o.leadIds ? { id: { in: o.leadIds } } : { email: { not: "" } }), ...(t?.all.length ? { armIds: { hasSome: t.prebuilt } } : {}) },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    take: o.limit,
  });
  if (leads.length === 0) return 0;
  const sender = await senderWorkspace(db, env);
  if (!sender) throw new Error("kly: no sender workspace (set OUTBOUND_GIFT_WORKSPACE_ID or OUTBOUND_ADMIN_EMAIL)");
  let n = 0;
  for (const lead of leads) {
    const existingAngle = lead.armIds.length ? await db.klyArm.findFirst({ where: { id: { in: lead.armIds }, dimension: "ad_angle" } }) : null;
    const angle = existingAngle ?? (await chooseArm(db, "ad_angle", o.rng, o.explorationPct));
    const { goal, awarenessMix } = angleInputs(angle?.content);
    const started = await db.$transaction(async (tx) => {
      // Kly loop and the dry-run script may race: one gift per lead.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`outbound-hook:${lead.id}`}))`;
      const fresh = await tx.outboundLead.findUnique({ where: { id: lead.id }, select: { giftId: true, status: true } });
      if (fresh?.giftId || fresh?.status !== "found") return false;
      const run = await tx.adRun.create({
        data: { workspaceId: sender.workspaceId, userId: sender.userId, url: lead.website, goal, status: "extracting", isTrial: false, kind: "gift", staticCount: 1, motionCount: 0, creditsReserved: 0, ratios: TRIAL_RATIOS, awarenessMix },
      });
      const gift = await tx.adsGift.create({
        data: {
          token: randomBytes(12).toString("base64url"),
          senderWorkspaceId: sender.workspaceId,
          senderUserId: sender.userId,
          senderName: o.senderName.slice(0, 40),
          recipientUrl: lead.website,
          recipientDomainHash: domainHash(lead.domain, env),
          recipientName: lead.businessName.slice(0, 60),
          source: OUTBOUND_GIFT_SOURCE,
          runId: run.id,
        },
      });
      const armIds = angle && !lead.armIds.includes(angle.id) ? [...lead.armIds, angle.id] : lead.armIds;
      await tx.outboundLead.update({ where: { id: lead.id }, data: { giftId: gift.id, giftToken: gift.token, giftAttempts: { increment: 1 }, armIds, error: null } });
      await enqueue(tx, { type: "extract", runId: run.id, workspaceId: sender.workspaceId, priority: GIFT_PRIORITY, payload: { url: lead.website } });
      return true;
    });
    if (started) n++;
  }
  return n;
}

export type ImageFetcher = (url: string, signal?: AbortSignal) => Promise<{ mediaType: string; base64: string } | null>;

/** The judge sees the ad as a social feed would: a ~1080px copy via the site's image optimizer (the 3 MB original
 * makes vision requests slow and occasionally rejected), falling back to the original. */
export function judgeImageUrl(url: string): string {
  const u = new URL(url);
  return `${u.origin}/_next/image?url=${encodeURIComponent(u.pathname)}&w=1080&q=75`;
}

export const defaultImageFetcher: ImageFetcher = async (url, signal) => {
  const small = await fetch(judgeImageUrl(url), { headers: { Accept: "image/png,image/jpeg,image/*" }, signal: signal ?? AbortSignal.timeout(30_000) }).catch(() => null);
  const res = small?.ok ? small : await fetch(url, { signal: signal ?? AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "image/png";
  return { mediaType: type.split(";")[0] ?? "image/png", base64: Buffer.from(await res.arrayBuffer()).toString("base64") };
};

export interface SyncDeps {
  db: Db;
  provider: AIProvider | null;
  base: string;
  minQualityScore: number;
  followUpDays: number;
  fetchImage?: ImageFetcher;
  now?: () => Date;
  leadIds?: string[];
}

/** Put a lead back in the gift queue (regenerate) or drop it. Returns the outcome. */
async function retryOrDrop(db: Db, lead: { id: string; giftAttempts: number; giftId: string | null }, reason: string, dropError: string, now: Date): Promise<"retry" | "dropped"> {
  const attempts = Math.max(lead.giftAttempts, lead.giftId ? 1 : 0);
  if (afterReject(attempts) === "regenerate") {
    await db.outboundLead.update({ where: { id: lead.id }, data: { status: "found", giftId: null, giftToken: null, adId: null, giftAttempts: attempts, error: `retry: ${reason}`.slice(0, 300) } });
    return "retry";
  }
  await db.outboundLead.update({ where: { id: lead.id }, data: { status: "failed", error: dropError } });
  if (dropError === "quality") await bumpDaily(db, now, { giftsRejected: 1 });
  return "dropped";
}

/**
 * found + gift -> judge -> ad_made, or regenerate once / drop. Gift stuck > 2h -> failed + one retry.
 * Judging needs the provider; without it ready gifts wait.
 */
export async function syncLeadAds(d: SyncDeps): Promise<{ made: number; rejected: number; retried: number; failed: number }> {
  const { db } = d;
  const now = d.now?.() ?? new Date();
  const r = { made: 0, rejected: 0, retried: 0, failed: 0 };
  const leads = await db.outboundLead.findMany({ where: { status: "found", giftId: { not: null }, ...(d.leadIds ? { id: { in: d.leadIds } } : {}) } });
  for (const l of leads) {
    if (!l.giftId) continue;
    const gift = await db.adsGift.findUnique({ where: { id: l.giftId }, select: { id: true, status: true, runId: true, createdAt: true, costMicros: true } });
    if (!gift) continue;
    if ((gift.status === "pending" || gift.status === "generating") && now.getTime() - gift.createdAt.getTime() > STUCK_MS) {
      const marked = await db.adsGift.updateMany({ where: { id: gift.id, status: gift.status }, data: { status: "failed" } });
      if (marked.count === 1) {
        log("warn", "kly: gift stuck, marked failed", { leadId: l.id, giftId: gift.id });
        (await retryOrDrop(db, l, "gift stuck over 2h", "hook ad stuck", now)) === "retry" ? r.retried++ : r.failed++;
      }
      continue;
    }
    if (gift.status === "pending" || gift.status === "generating") continue;
    const ad = gift.status === "ready" && gift.runId
      ? await db.ad.findFirst({ where: { runId: gift.runId, kind: "static", status: "ready", assets: { some: { mime: { startsWith: "image/" } } } }, orderBy: { index: "asc" }, select: { id: true } })
      : null;
    if (!ad) {
      await addCost(db, l.id, gift.costMicros, now);
      (await retryOrDrop(db, l, `hook ad ${gift.status}`, `hook ad ${gift.status}`, now)) === "retry" ? r.retried++ : r.failed++;
      continue;
    }
    if (!d.provider) continue;
    const url = await adImageUrl(db, d.base, { adId: ad.id, giftToken: l.giftToken });
    const img = url ? await (d.fetchImage ?? defaultImageFetcher)(url).catch(() => null) : null;
    if (!img) {
      log("warn", "kly: ad image not fetchable for review", { leadId: l.id });
      continue;
    }
    let verdict;
    try {
      // One retry on a transient provider error (e.g. a one-off "Bad Request") before giving up for this tick.
      const provider = d.provider;
      const j = await judgeAd(provider, img, l).catch(async (e: unknown) => {
        log("warn", "kly: quality judge retry", { leadId: l.id, error: errMsg(e) });
        return judgeAd(provider, img, l);
      });
      await addCost(db, l.id, j.costMicros, now);
      verdict = qualityGate(j.verdict, d.minQualityScore);
    } catch (e) {
      log("warn", "kly: quality judge failed", { leadId: l.id, error: errMsg(e) });
      continue;
    }
    await addCost(db, l.id, gift.costMicros, now);
    if (verdict.pass) {
      // Kept for the follow-up + late clicks; each send pushes it to 60 days after that send.
      await db.adAsset.updateMany({ where: { adId: ad.id }, data: { expiresAt: new Date(now.getTime() + d.followUpDays * 86_400_000 + ASSET_KEEP_MS) } });
      await db.outboundLead.update({ where: { id: l.id }, data: { status: "ad_made", adId: ad.id, qualityScore: verdict.score, qualityNotes: verdict.notes, error: null } });
      await bumpDaily(db, now, { giftsMade: 1 });
      r.made++;
    } else if (l.voiceStatus && VOICE_GIFT_STATUSES.includes(l.voiceStatus) && afterReject(Math.max(l.giftAttempts, 1)) !== "regenerate") {
      // They said yes on the phone: after the one regeneration a weak ad is still sent (with a short note).
      await db.outboundLead.update({ where: { id: l.id }, data: { status: "ad_made", adId: ad.id, qualityScore: verdict.score, qualityNotes: `${WEAK_SENT_NOTE} ${verdict.notes}`.slice(0, 500), error: null } });
      await bumpDaily(db, now, { giftsMade: 1 });
      r.made++;
    } else {
      await db.outboundLead.update({ where: { id: l.id }, data: { qualityScore: verdict.score, qualityNotes: verdict.notes } });
      (await retryOrDrop(db, l, `quality ${verdict.score}/10`, "quality", now)) === "retry" ? r.retried++ : r.rejected++;
    }
  }
  return r;
}

/** The ad image on OUR domain (existing token-checked public gift image route). */
export async function adImageUrl(db: Db, base: string, lead: { adId: string | null; giftToken: string | null }): Promise<string | null> {
  if (!lead.adId || !lead.giftToken) return null;
  const assets = await db.adAsset.findMany({ where: { adId: lead.adId, mime: { startsWith: "image/" } }, select: { id: true, ratio: true }, orderBy: { createdAt: "asc" } });
  const a = assets.find((x) => x.ratio === "1:1") ?? assets.find((x) => x.ratio !== "preview") ?? assets[0];
  return a ? `${base}/api/ads/gift-public/${lead.giftToken}/img/${a.id}` : null;
}

/** Asset retention: 60 days after the last send. */
export async function extendAssets(db: Db, adId: string | null, sentAt: Date): Promise<void> {
  if (!adId) return;
  await db.adAsset.updateMany({ where: { adId }, data: { expiresAt: new Date(sentAt.getTime() + ASSET_KEEP_MS) } });
}

/** Encore runs (2 extra ads drawn live on the gift page, started by the web app): credit their growing cost to the
 * lead and today's budget. Idempotent: AdsGift.extraCostMicros remembers what was already counted. */
export async function syncEncoreCosts(db: Db, now: Date): Promise<number> {
  const gifts = await db.adsGift.findMany({ where: { source: OUTBOUND_GIFT_SOURCE, extraRunId: { not: null }, updatedAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }, select: { id: true, extraRunId: true, extraCostMicros: true } });
  let n = 0;
  for (const g of gifts) {
    const run = g.extraRunId ? await db.adRun.findUnique({ where: { id: g.extraRunId }, select: { costMicros: true } }) : null;
    const jobs = g.extraRunId ? await db.adJob.aggregate({ where: { runId: g.extraRunId }, _sum: { costMicros: true } }) : null;
    const total = [run?.costMicros ?? 0n, jobs?._sum.costMicros ?? 0n].reduce((a, b) => (b > a ? b : a), 0n);
    const delta = total - g.extraCostMicros;
    if (delta <= 0n) continue;
    const moved = await db.adsGift.updateMany({ where: { id: g.id, extraCostMicros: g.extraCostMicros }, data: { extraCostMicros: total } });
    if (moved.count !== 1) continue;
    const lead = await db.outboundLead.findFirst({ where: { giftId: g.id }, select: { id: true } });
    await addCost(db, lead?.id ?? null, delta, now);
    n++;
  }
  return n + (await syncOnClickRuns(db, now));
}

/** On-click gifts once someone opened the page: credit the live run's cost to the lead (AdsGift.extraCostMicros holds
 * what was already counted; these gifts never get an encore), and when the ads are ready point the lead at the
 * first one and keep the assets for the usual 60 days. Idempotent. */
export async function syncOnClickRuns(db: Db, now: Date): Promise<number> {
  const leads = await db.outboundLead.findMany({
    where: { qualityNotes: ON_CLICK_NOTE, giftId: { not: null }, clickedAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } },
    select: { id: true, giftId: true, adId: true },
  });
  let n = 0;
  for (const l of leads) {
    const g = l.giftId ? await db.adsGift.findUnique({ where: { id: l.giftId }, select: { id: true, runId: true, extraCostMicros: true } }) : null;
    if (!g?.runId) continue;
    const run = await db.adRun.findUnique({ where: { id: g.runId }, select: { costMicros: true } });
    const jobs = await db.adJob.aggregate({ where: { runId: g.runId }, _sum: { costMicros: true } });
    const total = [run?.costMicros ?? 0n, jobs._sum.costMicros ?? 0n].reduce((a, b) => (b > a ? b : a), 0n);
    const delta = total - g.extraCostMicros;
    if (delta > 0n) {
      const moved = await db.adsGift.updateMany({ where: { id: g.id, extraCostMicros: g.extraCostMicros }, data: { extraCostMicros: total } });
      if (moved.count === 1) {
        await addCost(db, l.id, delta, now);
        n++;
      }
    }
    if (!l.adId) {
      const ad = await db.ad.findFirst({ where: { runId: g.runId, kind: "static", status: "ready", assets: { some: { mime: { startsWith: "image/" } } } }, orderBy: { index: "asc" }, select: { id: true } });
      if (ad) {
        const set = await db.outboundLead.updateMany({ where: { id: l.id, adId: null }, data: { adId: ad.id } });
        await db.adAsset.updateMany({ where: { ad: { runId: g.runId } }, data: { expiresAt: new Date(now.getTime() + ASSET_KEEP_MS) } });
        if (set.count === 1) await bumpDaily(db, now, { giftsMade: 1 });
      }
    }
  }
  return n;
}
