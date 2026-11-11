// Loads lifecycle candidates with raw SQL so the same code runs on the web app's and the engine's
// Prisma clients (structural `RawQueryDb`; no package imports, the engine imports this file).
import { launchOfferReadyAt } from "../billing-config";
import { FREE_ADS_WAYS, freeAdsWaysStart, LONG_TAIL, type LifecycleCandidate } from "./select";

export interface RawQueryDb {
  $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}

/** Look-back that covers the whole schedule (last monthly fresh-ad email + slack). */
export const LOOKBACK_DAYS = Math.max(...LONG_TAIL.map((l) => l.day + l.days)) + 2;
const PAID_STATUSES = ["active", "trialing", "past_due"];

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const date = (v: unknown): Date | null => (v instanceof Date ? v : typeof v === "string" ? new Date(v) : null);

/** Candidates: ads workspace owners who signed up or finished a trial in the last LOOKBACK_DAYS. `userIds` narrows (ops/script). */
export async function loadLifecycleCandidates(db: RawQueryDb, now: Date, userIds?: string[], start: Date = freeAdsWaysStart()): Promise<LifecycleCandidate[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  // While the free_ads_ways announcement is open, every pre-existing user is a candidate too.
  const announceBefore = now.getTime() < start.getTime() + FREE_ADS_WAYS.openDays * 86_400_000 ? start : null;
  const users = rows(
    await db.$queryRawUnsafe(
      `SELECT DISTINCT ON (u.id) u.id, u.email, u.name, u."createdAt", u."emailVerifiedAt",
              w.id AS "workspaceId", w."adsPlan", w."subscriptionStatus", w."suspendedAt"
         FROM "User" u JOIN "AdsWorkspace" w ON w."ownerId" = u.id
        WHERE ($2::text[] IS NOT NULL AND u.id = ANY($2::text[]))
           OR ($2::text[] IS NULL AND (u."createdAt" >= $1
               OR COALESCE(u."createdAt" < $3, false)
               OR EXISTS (SELECT 1 FROM "AdRun" r WHERE r."workspaceId" = w.id AND r."isTrial" AND r."completedAt" >= $1)))
        ORDER BY u.id, w."createdAt" ASC`,
      since,
      userIds ?? null,
      announceBefore,
    ),
  );
  if (!users.length) return [];
  const uids = users.map((u) => String(u.id));
  const wids = users.map((u) => String(u.workspaceId));
  const [runs, events, started, readyTimes] = await Promise.all([
    db.$queryRawUnsafe(
      `SELECT DISTINCT ON (r."workspaceId") r.id, r."workspaceId", r."completedAt",
              (SELECT count(*) FROM "Ad" a WHERE a."runId" = r.id AND a.status::text = 'ready'
                 AND COALESCE(a."visualBrief"->>'locked', 'false') <> 'true')::int AS ready
         FROM "AdRun" r
        WHERE r."workspaceId" = ANY($1::text[]) AND r."isTrial" AND r."completedAt" IS NOT NULL
          AND r.status::text IN ('completed', 'partial')
        ORDER BY r."workspaceId", r."completedAt" ASC`,
      wids,
    ),
    db.$queryRawUnsafe(
      `SELECT name, "userId", "workspaceId", "runId", props, "createdAt" FROM "AdsEvent"
        WHERE ("userId" = ANY($1::text[]) OR "workspaceId" = ANY($2::text[]))
          AND name IN ('email_sent', 'email_unsubscribed', 'purchased', 'paid_converted', 'signed_up', 'trial_blocked')`,
      uids,
      wids,
    ),
    db.$queryRawUnsafe(`SELECT DISTINCT "workspaceId" FROM "AdRun" WHERE "workspaceId" = ANY($1::text[]) AND kind <> 'gift'`, wids),
    // Launch Quarter window (mirror of getLaunchOfferReadyAt in ../launch-offer.ts, which needs the web Prisma client):
    // per trial run, when each ready main (non-bonus) ad got its first non-preview asset, plus the run's completion.
    db.$queryRawUnsafe(
      `SELECT r.id, r."workspaceId", r."completedAt",
              (SELECT min(x."createdAt") FROM "AdAsset" x WHERE x."adId" = a.id AND x.ratio <> 'preview') AS "assetAt"
         FROM "AdRun" r LEFT JOIN "Ad" a ON a."runId" = r.id AND a.status::text = 'ready'
              AND COALESCE(a."visualBrief"->>'locked', 'false') <> 'true'
        WHERE r."workspaceId" = ANY($1::text[]) AND r."isTrial"`,
      wids,
    ),
  ]);
  const startedWs = new Set(rows(started).map((r) => String(r.workspaceId)));
  const runBy = new Map(rows(runs).map((r) => [String(r.workspaceId), r]));
  const ev = rows(events);
  const offerReadyBy = new Map<string, Date>();
  const perRun = new Map<string, { wid: string; completedAt: Date | null; times: Date[] }>();
  for (const r of rows(readyTimes)) {
    const id = String(r.id);
    const e = perRun.get(id) ?? { wid: String(r.workspaceId), completedAt: date(r.completedAt), times: [] };
    const t = date(r.assetAt);
    if (t) e.times.push(t);
    perRun.set(id, e);
  }
  for (const e of perRun.values()) {
    const at = launchOfferReadyAt(e.times, e.completedAt);
    const prev = offerReadyBy.get(e.wid);
    if (at && (!prev || at < prev)) offerReadyBy.set(e.wid, at);
  }
  return users.map((u): LifecycleCandidate => {
    const id = String(u.id);
    const wid = String(u.workspaceId);
    const mine = ev.filter((e) => e.userId === id || e.workspaceId === wid);
    const run = runBy.get(wid);
    const paidWs = str(u.adsPlan) !== "trial" && PAID_STATUSES.includes(str(u.subscriptionStatus) ?? "") && !u.suspendedAt;
    return {
      userId: id,
      email: String(u.email),
      name: str(u.name),
      workspaceId: wid,
      adsSignup: mine.some((e) => e.name === "signed_up"),
      signedUpAt: date(u.createdAt) ?? now,
      emailVerifiedAt: date(u.emailVerifiedAt),
      paid: paidWs || mine.some((e) => e.name === "purchased" || e.name === "paid_converted"),
      unsubscribed: mine.some((e) => e.name === "email_unsubscribed" && e.userId === id),
      trialRunId: run ? String(run.id) : null,
      startedRun: startedWs.has(wid),
      trialBlocked: mine.some((e) => e.name === "trial_blocked"),
      trialCompletedAt: run ? date(run.completedAt) : null,
      offerReadyAt: offerReadyBy.get(wid) ?? null,
      readyAdCount: run ? Number(run.ready ?? 0) : 0,
      sent: mine
        .filter((e) => e.name === "email_sent" && e.userId === id)
        .map((e) => {
          const props = (e.props && typeof e.props === "object" ? e.props : {}) as Record<string, unknown>;
          return { kind: str(props.kind) ?? "", runId: str(e.runId), at: date(e.createdAt) ?? now };
        }),
    };
  });
}
