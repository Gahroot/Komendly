// Ozzy Studio free-video abuse guard: one free video per person, mirroring the ads trial rules
// (src/lib/ads/abuse.ts). Claims live in AdsTrialClaim with "studio:"-prefixed hashes (no schema change):
// domainHash = "studio:<workspaceId>", emailHash/deviceHash/ipHash = "studio:" + HMAC.
import { prisma } from "@/lib/prisma";
import { decideStudioFree, STUDIO_CLAIM_PREFIX, studioClaimHashes, type RequestFingerprint, type StudioFreeDecision } from "@/lib/ads/abuse";

const IP_WINDOW_MS = 30 * 24 * 3600 * 1000;

/**
 * Check (and on success record) this workspace's free-video claim. Re-checks for a workspace that already
 * holds a claim are always ok (its own row is excluded). Fails open on errors (e.g. no ADS_HASH_SALT).
 */
export async function claimStudioFreeVideo(input: { workspaceId: string; userId: string; email: string; fp: RequestFingerprint }, now: Date = new Date()): Promise<StudioFreeDecision> {
  try {
    const h = studioClaimHashes(input.workspaceId, input.email, input.fp);
    const own = await prisma.adsTrialClaim.findFirst({ where: { domainHash: h.domainHash }, select: { id: true } });
    if (own) return { ok: true, sharedNetwork: false };
    const others = { domainHash: { not: h.domainHash, startsWith: STUDIO_CLAIM_PREFIX } };
    const [email, device, ip30d] = await Promise.all([
      prisma.adsTrialClaim.count({ where: { ...others, emailHash: h.emailHash } }),
      h.deviceHash ? prisma.adsTrialClaim.count({ where: { ...others, deviceHash: h.deviceHash } }) : 0,
      h.ipHash ? prisma.adsTrialClaim.count({ where: { ...others, ipHash: h.ipHash, createdAt: { gte: new Date(now.getTime() - IP_WINDOW_MS) } } }) : 0,
    ]);
    const d = decideStudioFree({ email, device, ip30d });
    if (!d.ok) {
      await prisma.abuseFlag.create({ data: { kind: "studio_free_blocked", severity: "low", details: { reason: d.reason, ipHash: h.ipHash }, workspaceId: input.workspaceId, userId: input.userId } }).catch(() => undefined);
      return d;
    }
    if (d.sharedNetwork) {
      await prisma.abuseFlag.create({ data: { kind: "shared_network_trial", severity: "low", details: { app: "studio", ipHash: h.ipHash, priorClaims30d: ip30d }, workspaceId: input.workspaceId, userId: input.userId } }).catch(() => undefined);
    }
    await prisma.adsTrialClaim.create({ data: { workspaceId: input.workspaceId, ...h, createdAt: now } });
    return d;
  } catch (error) {
    console.error("[studio] free-video claim check failed", error);
    return { ok: true, sharedNetwork: false };
  }
}

/** Blocked: this person already had their free video elsewhere, so the workspace's free videos go to 0 (paywall on the first message). */
export async function revokeStudioFreeVideos(workspaceId: string): Promise<void> {
  await prisma.adsWorkspace.update({ where: { id: workspaceId }, data: { studioFreeVideos: 0 } });
}
