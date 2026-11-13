// Claimed Kly outbound gift: put the gifted ad(s) in the new customer's workspace as an AdRun kind "gift_claimed".
// Rows are copied; S3 objects are shared (same storageKey, no re-upload, no credits, not a trial).
// Idempotent: the copied run's id is derived from the gift id, so a second claim hits the primary key and does nothing.
import type { Prisma, PrismaClient } from "@prisma/client";

export const GIFT_CLAIMED_KIND = "gift_claimed";

export function claimedRunId(giftId: string): string {
  return `gc_${giftId}`;
}

type Db = Pick<PrismaClient, "$transaction">;
type SourceRun = Prisma.AdRunGetPayload<{ include: { ads: { include: { assets: true } } } }>;

/** Pure: the rows to create for the copy (ready ads with image assets only). */
export function planGiftCopy(src: SourceRun, giftId: string, target: { workspaceId: string; userId: string }, now: Date) {
  const runId = claimedRunId(giftId);
  const ads = src.ads
    .filter((a) => a.status === "ready" && a.assets.length > 0)
    .sort((a, b) => a.index - b.index)
    .map((a, i) => ({
      ad: {
        id: `${runId}_${i}`,
        runId,
        workspaceId: target.workspaceId,
        kind: a.kind,
        index: i,
        awareness: a.awareness,
        angle: a.angle,
        hook: a.hook,
        headline: a.headline,
        body: a.body,
        cta: a.cta,
        claims: a.claims as Prisma.InputJsonValue,
        visualBrief: (a.visualBrief ?? undefined) as Prisma.InputJsonValue | undefined,
        status: a.status,
        qcAttempts: a.qcAttempts,
        qcReport: (a.qcReport ?? undefined) as Prisma.InputJsonValue | undefined,
        costMicros: BigInt(0),
        durationMs: a.durationMs,
      },
      // Shared key: the copy keeps no TTL (see retainSharedKeys) so cleanup never deletes the object under it.
      assets: a.assets.map((x) => ({ adId: `${runId}_${i}`, ratio: x.ratio, storageKey: x.storageKey, mime: x.mime, width: x.width, height: x.height, bytes: x.bytes, expiresAt: null })),
    }));
  const run = {
    id: runId,
    workspaceId: target.workspaceId,
    userId: target.userId,
    url: src.url,
    goal: src.goal,
    resolvedGoal: src.resolvedGoal,
    status: "completed" as const,
    isTrial: false,
    kind: GIFT_CLAIMED_KIND,
    extraction: (src.extraction ?? undefined) as Prisma.InputJsonValue | undefined,
    ratios: src.ratios,
    staticCount: ads.length,
    motionCount: 0,
    creditsReserved: 0,
    creditsCharged: 0,
    confirmedAt: now,
    firstAdAt: now,
    completedAt: now,
  };
  return { run, ads, storageKeys: ads.flatMap((a) => a.assets.map((x) => x.storageKey)) };
}

/** Copy the gift's ready ads (hook run + optional encore run) into the workspace. Additive and idempotent: a later call
 * (e.g. at trial start, after the encore finished) appends only ads not copied yet. Returns the copied run id, or null. */
export async function copyGiftToWorkspace(db: Db, input: { giftId: string; sourceRunId: string; extraRunId?: string | null; workspaceId: string; userId: string; now?: Date }): Promise<string | null> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const runId = claimedRunId(input.giftId);
    const src = await tx.adRun.findUnique({ where: { id: input.sourceRunId }, include: { ads: { include: { assets: true } } } });
    if (!src) return null;
    const extra = input.extraRunId ? await tx.adRun.findUnique({ where: { id: input.extraRunId }, include: { ads: { include: { assets: true } } } }) : null;
    // Encore ads go after the hook ad(s): offset their index so planGiftCopy's sort keeps that order.
    const merged = { ...src, ads: [...src.ads, ...(extra?.ads ?? []).map((a) => ({ ...a, index: a.index + 1000 }))] };
    const plan = planGiftCopy(merged, input.giftId, input, now);
    if (plan.ads.length === 0) return null;
    const existing = await tx.adRun.findUnique({ where: { id: runId }, select: { id: true, staticCount: true } });
    const have = new Set(existing ? (await tx.ad.findMany({ where: { runId }, select: { id: true } })).map((a) => a.id) : []);
    const missing = plan.ads.filter((a) => !have.has(a.ad.id));
    if (missing.length === 0) return existing ? null : runId;
    if (existing) await tx.adRun.update({ where: { id: runId }, data: { staticCount: plan.ads.length } });
    else await tx.adRun.create({ data: plan.run });
    for (const a of missing) {
      await tx.ad.create({ data: a.ad });
      await tx.adAsset.createMany({ data: a.assets });
    }
    // The original gift assets share these S3 keys: retain them too, or the engine's TTL cleanup would delete the objects.
    await tx.adAsset.updateMany({ where: { storageKey: { in: plan.storageKeys }, expiresAt: { not: null } }, data: { expiresAt: null } });
    return runId;
  });
}
