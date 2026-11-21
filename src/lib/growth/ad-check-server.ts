// Server side of the Meta Ad Check (growth system ad_check): kill switch, per-IP rate limit, daily cap, job queue.
// Web never fetches the Ad Library: it inserts AdJob `adlib_scan` (payload AdCheckPayload) and the engine fills result.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { systemEnabled } from "@/lib/growth/systems";
import { hashIp } from "@/lib/growth/free-tools-server";
import { dailyCap, perIpHourly, startOfUtcDay } from "@/lib/growth/free-tools";
import { AD_CHECK_JOB_TYPE, cleanState, cleanTrade, isAdCheckToken, type AdCheckPayload, type AdCheckResult } from "@/lib/growth/ad-check";
import { parseAdlibTarget } from "@/lib/growth/adlib-scan";

export const adCheckEnabled = () => systemEnabled(prisma, "ad_check");

export type AdCheckQueue = { ok: true; token: string } | { ok: false; status: number; error: string };

/** Queue one check. Same limits as the free tools (FREE_TOOLS_PER_IP_HOUR, FREE_TOOLS_DAILY_CAP). */
export async function queueAdCheck(input: { url: unknown; trade?: unknown; state?: unknown }, ip: string): Promise<AdCheckQueue> {
  const raw = typeof input.url === "string" ? input.url.trim().slice(0, 300) : "";
  if (!parseAdlibTarget(raw)) return { ok: false, status: 400, error: "Paste your Facebook Page link (facebook.com/yourpage) or your website (yourbusiness.com)." };
  const ipHash = hashIp(ip);
  if (!(await rateLimit(`ad_check:${ipHash}`, perIpHourly(process.env), 3600))) {
    return { ok: false, status: 429, error: "You've run a lot of checks in the last hour. Try again later." };
  }
  const today = await prisma.adJob.count({ where: { type: AD_CHECK_JOB_TYPE, createdAt: { gte: startOfUtcDay(new Date()) } } });
  if (today >= dailyCap(process.env)) return { ok: false, status: 429, error: "Today's free checks are used up. Come back tomorrow." };
  const token = randomBytes(24).toString("base64url");
  const payload: AdCheckPayload = { token, input: raw, purpose: "ad_check", ...(cleanTrade(input.trade) ? { trade: cleanTrade(input.trade) } : {}), ...(cleanState(input.state) ? { state: cleanState(input.state) } : {}) };
  await prisma.adJob.create({ data: { type: AD_CHECK_JOB_TYPE, payload: { ...payload, ipHash } as object, maxAttempts: 2 } });
  // Not a typed trackAdsEvent name on purpose (src/lib/ads/events.ts is owned elsewhere): plain row for the funnel.
  await prisma.adsEvent.create({ data: { name: "ad_check_requested", props: { system: "ad_check", kind: parseAdlibTarget(raw)!.kind } } }).catch(() => undefined);
  return { ok: true, token };
}

export type AdCheckStatus = { status: "queued" | "running" | "done"; result: AdCheckResult | null; input: string };

/** Job state by report token, or null for unknown tokens. */
export async function adCheckByToken(token: string): Promise<AdCheckStatus | null> {
  if (!isAdCheckToken(token)) return null;
  const job = await prisma.adJob.findFirst({ where: { type: AD_CHECK_JOB_TYPE, payload: { path: ["token"], equals: token } }, select: { status: true, result: true, payload: true } }).catch(() => null);
  if (!job) return null;
  const input = String((job.payload as { input?: unknown } | null)?.input ?? "");
  if (job.status === "succeeded" || job.status === "dead" || job.status === "canceled") {
    const result = (job.result as AdCheckResult | null) ?? { ok: false, reason: "unavailable", input };
    return { status: "done", result, input };
  }
  return { status: job.status === "running" ? "running" : "queued", result: null, input };
}
