// Daily funnel monitor (Vercel Cron, vercel.json). Bearer CRON_SECRET. Flag-gated: AdsFeatureFlag `sys_funnel_monitor`
// (missing = OFF, nothing runs). Fetches our own public pages, checks the Stripe price/coupon objects, and reads a few
// DB health numbers; emails Nolan once per distinct problem per day (plain text) and always records an AdsEvent
// `funnel_check` (ok + details) so the revenue digest can show a weekly "all green".
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { systemEnabled } from "@/lib/growth/systems";
import { isInternalEmail } from "@/lib/internal-email";
import { isBonusUnlockedById } from "@/lib/ads/bonus-unlock";
import { AUTOPILOT_LAUNCH, UNLOCK_PACK, UNLOCK_PACK_COUPON_ENV } from "@/lib/ads/billing-config";
import { alertMail, checkDb, checkOfferApi, checkPage, checkSitemap, checkStripeCoupon, checkStripePrice, EXPECTED_CENTS, newProblems, PAGE_SPECS, problemKey, type CheckResult, type DbFacts } from "@/lib/funnel-checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_TO = "nolan@prestyj.com";
const HOUR = 3_600_000;

async function get(url: string): Promise<{ status: number; body: string; location: string | null } | { error: string }> {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "komendly-funnel-monitor" } });
    return { status: r.status, body: await r.text(), location: r.headers.get("location") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function pageChecks(base: string): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const pages = await Promise.all(PAGE_SPECS.map(async (s) => [s, await get(base + s.path)] as const));
  for (const [s, r] of pages) out.push(...checkPage(s, r));
  const sm = await get(base + "/sitemap.xml");
  out.push("error" in sm || sm.status !== 200 ? { name: "sitemap.xml", ok: false, detail: "error" in sm ? sm.error : `status ${sm.status}` } : checkSitemap(sm.body, base));
  const offer = await get(base + "/api/ads-billing/offer");
  out.push("error" in offer ? { name: "api /api/ads-billing/offer", ok: false, detail: offer.error } : checkOfferApi(offer.status, offer.body));
  return out;
}

async function stripeChecks(): Promise<CheckResult[]> {
  const key = process.env.STRIPE_SECRET_KEY; // read inside the function (serverless)
  if (!key) return [{ name: "stripe objects", ok: false, detail: "STRIPE_SECRET_KEY not set" }];
  const stripe = new Stripe(key);
  const price = async (id?: string) => (id ? await stripe.prices.retrieve(id).catch(() => null) : null);
  const coupon = async (id?: string) => (id ? await stripe.coupons.retrieve(id).catch(() => null) : null);
  const apId = process.env[AUTOPILOT_LAUNCH.priceEnv];
  const apCoupon = process.env[AUTOPILOT_LAUNCH.couponEnv ?? ""];
  const unlockId = process.env[UNLOCK_PACK.priceEnv];
  const unlockCoupon = process.env[UNLOCK_PACK_COUPON_ENV];
  return [
    checkStripePrice("autopilot", apId, await price(apId), EXPECTED_CENTS.autopilot),
    checkStripeCoupon("autopilot launch", apCoupon, await coupon(apCoupon), EXPECTED_CENTS.autopilotCouponOff),
    checkStripePrice("unlock pack", unlockId, await price(unlockId), EXPECTED_CENTS.unlock),
    checkStripeCoupon("unlock pack", unlockCoupon, await coupon(unlockCoupon), EXPECTED_CENTS.unlock),
  ];
}

async function dbFacts(now: Date): Promise<DbFacts> {
  const ago = (h: number) => new Date(now.getTime() - h * HOUR);
  const finished = { status: { in: ["completed", "partial"] as ("completed" | "partial")[] }, kind: "standard", completedAt: { gte: ago(24) } };
  const [finishedPacks24h, finishedPacksNoReadyAds24h, unlocks, stuckRunning, stuckQueued, owners] = await Promise.all([
    prisma.adRun.count({ where: finished }),
    prisma.adRun.count({ where: { ...finished, ads: { none: { status: "ready" } } } }),
    prisma.creditLedger.findMany({ where: { reason: "topup", delta: { gt: 0 }, note: "unlock_pack", createdAt: { gte: ago(24 * 7) } }, select: { workspaceId: true }, distinct: ["workspaceId"], take: 50 }),
    prisma.adJob.count({ where: { status: "running", lockedAt: { lt: ago(0.5) } } }),
    prisma.adJob.count({ where: { status: "queued", runAt: { lt: ago(0.5) } } }),
    prisma.adsWorkspace.findMany({ where: { createdAt: { gte: ago(26), lte: ago(2) } }, select: { ownerId: true, runs: { select: { id: true }, take: 1 } }, take: 500 }),
  ]);
  let paidUnlocksStillLocked = 0;
  for (const u of unlocks) if (!(await isBonusUnlockedById(u.workspaceId))) paidUnlocksStillLocked++;
  const users = await prisma.user.findMany({ where: { id: { in: owners.map((o) => o.ownerId) } }, select: { id: true, email: true } });
  const real = new Set(users.filter((u) => !isInternalEmail(u.email)).map((u) => u.id));
  const mine = owners.filter((o) => real.has(o.ownerId));
  return { finishedPacks24h, finishedPacksNoReadyAds24h, paidUnlocksStillLocked, signups: mine.length, signupsNoPack: mine.filter((o) => o.runs.length === 0).length, stuckRunning, stuckQueued };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await systemEnabled(prisma, "funnel_monitor"))) return NextResponse.json({ skipped: "sys_funnel_monitor is off" });
  const now = new Date();
  const base = appBaseUrl(new URL(request.url).origin);

  const settled = await Promise.allSettled([pageChecks(base), stripeChecks(), dbFacts(now).then(checkDb)]);
  const labels = ["pages", "stripe", "db"];
  const results: CheckResult[] = settled.flatMap((s, i) => (s.status === "fulfilled" ? s.value : [{ name: `monitor ${labels[i]} errored`, ok: false, detail: String(s.reason).slice(0, 300) }]));

  const day = now.toISOString().slice(0, 10);
  const today = await prisma.adsEvent.findMany({ where: { name: "funnel_check", createdAt: { gte: new Date(`${day}T00:00:00Z`) } }, select: { props: true } });
  const already = new Set(today.flatMap((e) => ((e.props as { alerted?: string[] } | null)?.alerted ?? [])));
  const fresh = newProblems(results, already);
  let mailed = false;
  if (fresh.length) {
    const m = alertMail(fresh, base);
    await sendAdsMail({ to: process.env.ADS_ALERT_EMAIL || DEFAULT_TO, subject: m.subject, text: m.text, html: `<pre>${m.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>` }).then(() => { mailed = true; }).catch((e) => console.error("[funnel-monitor] mail failed", e));
  }
  const failed = results.filter((r) => !r.ok);
  await prisma.adsEvent.create({
    data: { name: "funnel_check", props: { day, ok: failed.length === 0, checks: results.length, failures: failed.map((r) => ({ name: r.name, detail: r.detail })), alerted: mailed ? fresh.map(problemKey) : [] } },
  });
  return NextResponse.json({ ok: failed.length === 0, checks: results.length, failures: failed, mailed });
}
