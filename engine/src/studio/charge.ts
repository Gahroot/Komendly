// Ozzy Studio charging: the contract's studioCharge applied in one transaction with the StudioRender row.
import { studioCharge, type StudioCharge } from "../../../src/lib/studio/contracts";
import type { Db } from "../db";

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface ChargeWorkspace {
  adsPlan: string;
  subscriptionStatus: string;
  suspendedAt: Date | null;
  creditBalance: number;
  studioFreeVideos: number;
}

/** Mirrors src/lib/ads/billing-gates.ts isPaidWorkspace, plus "has a credit balance". */
export function isPaidStudioWorkspace(ws: ChargeWorkspace): boolean {
  const plan = ws.adsPlan !== "trial" && ws.adsPlan !== "none" && PAID_STATUSES.has(ws.subscriptionStatus) && !ws.suspendedAt;
  return plan || ws.creditBalance > 0;
}

export interface ChargeDecision extends StudioCharge {
  /** Credits actually deducted (0 when the balance can't cover it). */
  deducted: number;
  /** Balance could not cover the price: delivered watermarked, nothing charged. */
  insufficient: boolean;
}

/** Pure: the contract price, then the balance rule (never negative; short balance -> watermarked, free). */
export function decideCharge(ws: ChargeWorkspace, o: { priorRenders: number; seconds: number; sessionFree: boolean }): ChargeDecision {
  const c = studioCharge({ priorRenders: o.priorRenders, seconds: o.seconds, sessionFree: o.sessionFree, freeVideosLeft: ws.studioFreeVideos, isPaidWorkspace: isPaidStudioWorkspace(ws) });
  if (c.credits > ws.creditBalance) return { ...c, credits: c.credits, deducted: 0, insufficient: true, watermark: true };
  return { ...c, deducted: c.credits, insufficient: false };
}

export interface DeliveredRender {
  sessionId: string;
  messageId: string;
  workspaceId: string;
  key: (version: number) => string;
  posterKey: (version: number) => string | null;
  ratio: string;
  seconds: number;
  width: number;
  height: number;
  costMicros: number;
}

export type ChargeTxResult =
  | { ok: true; renderId: string; version: number; decision: ChargeDecision; balanceAfter: number; freeVideosLeft: number }
  /** The decision needs a watermark the uploaded file doesn't have (state changed since planning): re-encode and retry. */
  | { ok: false; needWatermark: true; version: number };

/**
 * One transaction: lock the workspace, price the render, create StudioRender (version = prior + 1),
 * deduct credits (ledger reason studio_charge, stripeRef studio:<renderId>), spend the free video.
 */
export async function chargeAndRecord(db: Db, r: DeliveredRender, watermarked: boolean, now: Date): Promise<ChargeTxResult> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ChargeWorkspace[]>`
      SELECT "adsPlan", "subscriptionStatus", "suspendedAt", "creditBalance", "studioFreeVideos" FROM "AdsWorkspace" WHERE id = ${r.workspaceId} FOR UPDATE`;
    const ws = rows[0];
    if (!ws) throw new Error("workspace not found");
    const session = await tx.studioSession.findUniqueOrThrow({ where: { id: r.sessionId }, select: { freeVideo: true } });
    const priorRenders = await tx.studioRender.count({ where: { sessionId: r.sessionId } });
    const version = priorRenders + 1;
    const decision = decideCharge(ws, { priorRenders, seconds: r.seconds, sessionFree: session.freeVideo });
    if (decision.watermark && !watermarked) return { ok: false as const, needWatermark: true as const, version };
    const render = await tx.studioRender.create({
      data: {
        sessionId: r.sessionId, messageId: r.messageId, workspaceId: r.workspaceId, version, key: r.key(version), posterKey: r.posterKey(version),
        ratio: r.ratio, seconds: r.seconds, width: r.width, height: r.height, watermarked, free: decision.useFreeVideo, kind: decision.kind,
        creditsCharged: decision.deducted, costMicros: BigInt(Math.round(r.costMicros)),
      },
    });
    // Funnel (AdsEvent, like jobs/qc first_ad_ready): every delivery + the workspace's first ever (web forwards it to Meta CAPI).
    const ev = { version, seconds: r.seconds, free: decision.useFreeVideo || decision.deducted === 0, credits: decision.deducted, watermarked, renderId: render.id, sessionId: r.sessionId };
    await tx.adsEvent.create({ data: { name: "studio_render_delivered", workspaceId: r.workspaceId, props: ev } });
    if ((await tx.studioRender.count({ where: { workspaceId: r.workspaceId } })) === 1) await tx.adsEvent.create({ data: { name: "studio_first_render", workspaceId: r.workspaceId, props: ev } });
    let balanceAfter = ws.creditBalance;
    if (decision.deducted > 0) {
      balanceAfter = ws.creditBalance - decision.deducted;
      await tx.creditLedger.create({
        data: { workspaceId: r.workspaceId, delta: -decision.deducted, balanceAfter, reason: "studio_charge", stripeRef: `studio:${render.id}`, note: `studio ${decision.kind} v${version} session ${r.sessionId}` },
      });
    }
    let freeVideosLeft = ws.studioFreeVideos;
    const wsData: { creditBalance?: number; studioFreeVideos?: number } = {};
    if (decision.deducted > 0) wsData.creditBalance = balanceAfter;
    if (decision.useFreeVideo) {
      freeVideosLeft = Math.max(0, ws.studioFreeVideos - 1);
      wsData.studioFreeVideos = freeVideosLeft;
      await tx.studioSession.update({ where: { id: r.sessionId }, data: { freeVideo: true } });
      await tx.adsWorkspace.updateMany({ where: { id: r.workspaceId, studioOfferReadyAt: null }, data: { studioOfferReadyAt: now } });
    }
    if (Object.keys(wsData).length) await tx.adsWorkspace.update({ where: { id: r.workspaceId }, data: wsData });
    return { ok: true as const, renderId: render.id, version, decision, balanceAfter, freeVideosLeft };
  });
}
