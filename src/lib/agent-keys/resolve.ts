// Bearer key -> user, with per-key rate limits and once-a-day `api_used` tracking.
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { trackAdsEvent } from "@/lib/ads/events";
import { API_KEY_LIMITS, hashApiKey, isApiKeyFormat, type ApiVia } from "./keys";

export type ResolveResult =
  | { ok: true; user: User; keyId: string; workspaceId: string }
  | { ok: false; reason: "invalid" | "rate_limited" | "job_limited" };

export const RATE_LIMIT_MESSAGE = "Too many requests with this API key. Wait a minute and try again.";
export const JOB_LIMIT_MESSAGE = `This API key started ${API_KEY_LIMITS.jobsPerHour} jobs in the last hour, which is the limit. Try again later.`;

/** Unknown, malformed or revoked keys resolve to nothing. `job` = this call queues paid work. */
export async function resolveApiKey(raw: string, opts: { via: ApiVia; job?: boolean; now?: Date }): Promise<ResolveResult> {
  if (!isApiKeyFormat(raw)) return { ok: false, reason: "invalid" };
  const key = await prisma.agentApiKey.findUnique({ where: { keyHash: hashApiKey(raw) }, include: { user: true } });
  if (!key || key.revokedAt) return { ok: false, reason: "invalid" };
  if (!(await rateLimit(`apikey:${key.id}`, API_KEY_LIMITS.perMinute, 60))) return { ok: false, reason: "rate_limited" };
  if (opts.job && !(await checkJobLimit(key.id))) return { ok: false, reason: "job_limited" };
  await touchKey(key.id, key.userId, key.workspaceId, opts.via, opts.now ?? new Date());
  return { ok: true, user: key.user, keyId: key.id, workspaceId: key.workspaceId };
}

export function checkJobLimit(keyId: string): Promise<boolean> {
  return rateLimit(`apikey-jobs:${keyId}`, API_KEY_LIMITS.jobsPerHour, 3600);
}

/** lastUsedAt (at most once a minute) + `api_used` once per key per UTC day (the conditional update wins once). */
async function touchKey(keyId: string, userId: string, workspaceId: string, via: ApiVia, now: Date): Promise<void> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const firstToday = await prisma.agentApiKey.updateMany({
    where: { id: keyId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: dayStart } }] },
    data: { lastUsedAt: now },
  });
  if (firstToday.count === 1) {
    await trackAdsEvent("api_used", { workspaceId, userId, props: { via, keyId } });
    return;
  }
  await prisma.agentApiKey.updateMany({ where: { id: keyId, lastUsedAt: { lt: new Date(now.getTime() - 60_000) } }, data: { lastUsedAt: now } });
}
