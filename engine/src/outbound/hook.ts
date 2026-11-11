// The hook ad: one static per lead through the existing gift pipeline (AdRun kind=gift, auto-confirmed, no credits,
// AdsGift source "outbound" -> public /gift/<token>). The engine's normal extract/plan/render/QC jobs make it;
// syncLeadAds moves the lead to ad_made once the gift is ready with a QC-passed (status ready) static.
import { createHmac, randomBytes } from "node:crypto";
import { TRIAL_AWARENESS_MIX, TRIAL_RATIOS } from "../../../src/lib/ads/contracts";
import type { Db } from "../db";
import { enqueue } from "../queue/queue";

export const OUTBOUND_GIFT_SOURCE = "outbound";

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
  const admin = await db.user.findFirst({ where: { isAdmin: true, ...(env.OUTBOUND_ADMIN_EMAIL ? { email: env.OUTBOUND_ADMIN_EMAIL } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const w = admin ? await db.adsWorkspace.findFirst({ where: { ownerId: admin.id }, orderBy: { createdAt: "asc" }, select: { id: true } }) : null;
  return admin && w ? { workspaceId: w.id, userId: admin.id } : null;
}

/** Start the hook-ad gift run for every "found" lead without one (max `limit`). */
export async function startHookAds(db: Db, opts: { limit?: number; senderName: string; env?: NodeJS.ProcessEnv }): Promise<number> {
  const env = opts.env ?? process.env;
  const leads = await db.outboundLead.findMany({ where: { status: "found", giftId: null }, orderBy: { createdAt: "asc" }, take: opts.limit ?? 5 });
  if (leads.length === 0) return 0;
  const sender = await senderWorkspace(db, env);
  if (!sender) throw new Error("outbound: no sender workspace (set OUTBOUND_GIFT_WORKSPACE_ID or OUTBOUND_ADMIN_EMAIL)");
  let n = 0;
  for (const lead of leads) {
    const started = await db.$transaction(async (tx) => {
      // Engine loop and the dry-run script may race: one gift per lead.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`outbound-hook:${lead.id}`}))`;
      const fresh = await tx.outboundLead.findUnique({ where: { id: lead.id }, select: { giftId: true } });
      if (fresh?.giftId) return false;
      const run = await tx.adRun.create({
        data: { workspaceId: sender.workspaceId, userId: sender.userId, url: lead.website, goal: "auto", status: "extracting", isTrial: false, kind: "gift", staticCount: 1, motionCount: 0, creditsReserved: 0, ratios: TRIAL_RATIOS, awarenessMix: TRIAL_AWARENESS_MIX },
      });
      const gift = await tx.adsGift.create({
        data: {
          token: randomBytes(12).toString("base64url"),
          senderWorkspaceId: sender.workspaceId,
          senderUserId: sender.userId,
          senderName: opts.senderName.slice(0, 40),
          recipientUrl: lead.website,
          recipientDomainHash: domainHash(lead.domain, env),
          recipientName: lead.businessName.slice(0, 60),
          source: OUTBOUND_GIFT_SOURCE,
          runId: run.id,
        },
      });
      await tx.outboundLead.update({ where: { id: lead.id }, data: { giftId: gift.id, giftToken: gift.token } });
      await enqueue(tx, { type: "extract", runId: run.id, workspaceId: sender.workspaceId, priority: -5, payload: { url: lead.website } });
      return true;
    });
    if (started) n++;
  }
  return n;
}

/** found -> ad_made (gift ready + a ready static) or failed (gift failed / no ad). */
export async function syncLeadAds(db: Db): Promise<{ made: number; failed: number }> {
  const leads = await db.outboundLead.findMany({ where: { status: "found", giftId: { not: null } }, select: { id: true, giftId: true } });
  let made = 0;
  let failed = 0;
  for (const l of leads) {
    if (!l.giftId) continue;
    const gift = await db.adsGift.findUnique({ where: { id: l.giftId }, select: { status: true, runId: true } });
    if (!gift || gift.status === "pending" || gift.status === "generating") continue;
    const ad = gift.status === "ready" && gift.runId
      ? await db.ad.findFirst({ where: { runId: gift.runId, kind: "static", status: "ready", assets: { some: { mime: { startsWith: "image/" } } } }, orderBy: { index: "asc" }, select: { id: true } })
      : null;
    if (ad) {
      // Gift assets normally expire with the run TTL; the hook ad must outlive the 4-day follow-up and late clicks.
      await db.adAsset.updateMany({ where: { adId: ad.id }, data: { expiresAt: null } });
      await db.outboundLead.update({ where: { id: l.id }, data: { status: "ad_made", adId: ad.id } });
      made++;
    } else {
      await db.outboundLead.update({ where: { id: l.id }, data: { status: "failed", error: `hook ad ${gift.status}` } });
      failed++;
    }
  }
  return { made, failed };
}

/** The ad image on OUR domain (existing token-checked public gift image route). */
export async function adImageUrl(db: Db, base: string, lead: { adId: string | null; giftToken: string | null }): Promise<string | null> {
  if (!lead.adId || !lead.giftToken) return null;
  const assets = await db.adAsset.findMany({ where: { adId: lead.adId, mime: { startsWith: "image/" } }, select: { id: true, ratio: true } });
  const a = assets.find((x) => x.ratio === "1:1") ?? assets.find((x) => x.ratio !== "preview") ?? assets[0];
  return a ? `${base}/api/ads/gift-public/${lead.giftToken}/img/${a.id}` : null;
}

const PAID = new Set(["active", "trialing", "past_due"]);

/** Contacted leads whose domain now has its own (non-gift) Komendly brand -> signed_up; paid workspace -> paid. */
export async function syncConversions(db: Db): Promise<number> {
  const leads = await db.outboundLead.findMany({ where: { status: { in: ["sent", "opened", "clicked", "replied", "signed_up"] } }, select: { id: true, domain: true, status: true } });
  let n = 0;
  for (const l of leads) {
    const brand = await db.brandProfile.findFirst({
      where: { domain: { in: [l.domain, `www.${l.domain}`] }, runs: { some: { kind: { notIn: ["gift", "nurture"] } } } },
      select: { workspace: { select: { adsPlan: true, subscriptionStatus: true, suspendedAt: true } } },
    });
    if (!brand) continue;
    const w = brand.workspace;
    const status = w.adsPlan !== "trial" && PAID.has(w.subscriptionStatus) && !w.suspendedAt ? "paid" : "signed_up";
    if (status === l.status) continue;
    await db.outboundLead.update({ where: { id: l.id }, data: { status } });
    n++;
  }
  return n;
}
