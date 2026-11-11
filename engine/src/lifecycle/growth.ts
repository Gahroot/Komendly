// Growth-loop emails (fixed copy, no AI): gift_ready to the gift sender, referral_reward to the referrer.
// Same guards as the lifecycle loop: AdsFeatureFlag lifecycle_email, LIFECYCLE_EMAIL_SECRET, LIFECYCLE_DRY_RUN=1,
// unsubscribes, never e2e test users. Idempotency: AdsEvent email_sent {kind, giftId|referralId} claimed before send.
// The loop also runs the referral credit expiry sweep (not flag-gated: it's billing, not email).
import { isTestEmail } from "../../../src/lib/ads/lifecycle/select";
import { renderLifecycleHtml, renderLifecycleText, unsubscribeHeaders, type LifecycleEmailInput } from "../../../src/lib/ads/lifecycle/template";
import { IMG_TOKEN_TTL_DAYS, signEmailToken } from "../../../src/lib/ads/lifecycle/tokens";
import type { Db } from "../db";
import { sweepReferralExpiry } from "../jobs/referral";
import { errMsg, log } from "../log";
import type { SendMail } from "./mail";
import { LIFECYCLE_FLAG } from "./send";

export type GrowthKind = "gift_ready" | "referral_reward";
const LOOKBACK_MS = 3 * 86_400_000;
const MAX_PER_TICK = 25;

export interface GrowthDeps {
  db: Db;
  send: SendMail;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface GrowthResult {
  kind: GrowthKind;
  id: string;
  userId: string;
  status: "sent" | "dry_run" | "skipped" | "failed";
  subject?: string;
  detail?: string;
}

function appUrl(env: NodeJS.ProcessEnv): string {
  return (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Fixed copy (pure, exported for tests). */
export function giftEmailCopy(brand: string | null, ready: number): Pick<LifecycleEmailInput, "subject" | "preheader" | "paragraphs"> & { ctaLabel: string } {
  const b = brand?.trim() || "them";
  const n = ready === 1 ? "1 ad" : `${ready} ads`;
  return {
    subject: `Your gift for ${b} is ready`.slice(0, 80),
    preheader: `${n} made from their own website. Send them the link.`,
    paragraphs: [
      `Your gift is done: ${n} made from ${brand?.trim() || "their"}${brand?.trim() ? "'s" : ""} own website, ready to run on Facebook and Instagram.`,
      "Copy the link and send it to them however you usually talk: text, email or DM. They can see and download the ads without signing up.",
    ],
    ctaLabel: "Copy your gift link",
  };
}

export function referralEmailCopy(credits: number, expiresAt: Date): Pick<LifecycleEmailInput, "subject" | "preheader" | "paragraphs"> & { ctaLabel: string } {
  return {
    subject: `You earned ${credits} free ads`,
    preheader: `A friend you invited just got their free ads. Your ${credits} credits are in.`,
    paragraphs: [
      `A friend you invited to Komendly just got their free ads, so we added ${credits} free credits to your account.`,
      `Use them before ${fmtDate(expiresAt)}; unused referral credits expire then. Keep sharing your link: every friend whose free ads finish earns you ${credits} more.`,
    ],
    ctaLabel: "See your referrals",
  };
}

async function recipient(db: Db, userId: string): Promise<{ email: string; skip: string | null } | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!u) return null;
  if (isTestEmail(u.email)) return { email: u.email, skip: "test_user" };
  const unsub = await db.adsEvent.findFirst({ where: { name: "email_unsubscribed", userId }, select: { id: true } });
  return { email: u.email, skip: unsub ? "unsubscribed" : null };
}

async function alreadySent(db: Db, kind: GrowthKind, key: "giftId" | "referralId", id: string): Promise<boolean> {
  const e = await db.adsEvent.findFirst({ where: { name: "email_sent", props: { path: [key], equals: id }, AND: { props: { path: ["kind"], equals: kind } } }, select: { id: true } });
  return Boolean(e);
}

async function deliver(
  deps: GrowthDeps,
  m: { kind: GrowthKind; id: string; key: "giftId" | "referralId"; userId: string; workspaceId: string; runId: string | null; email: string; input: LifecycleEmailInput },
  dryRun: boolean,
): Promise<GrowthResult> {
  const base: GrowthResult = { kind: m.kind, id: m.id, userId: m.userId, status: "dry_run", subject: m.input.subject };
  if (dryRun) {
    log("info", "growth email (dry run)", { kind: m.kind, id: m.id, userId: m.userId, text: renderLifecycleText(m.input) });
    return base;
  }
  const claim = await deps.db.adsEvent.create({
    data: { name: "email_sent", userId: m.userId, workspaceId: m.workspaceId, runId: m.runId, props: { kind: m.kind, subject: m.input.subject, source: "fixed", [m.key]: m.id } },
  });
  try {
    await deps.send({ to: m.email, subject: m.input.subject, text: renderLifecycleText(m.input), html: renderLifecycleHtml(m.input), headers: unsubscribeHeaders(m.input.unsubscribeUrl) });
    log("info", "growth email sent", { kind: m.kind, id: m.id, userId: m.userId });
    return { ...base, status: "sent" };
  } catch (e) {
    await deps.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
    log("warn", "growth email failed", { kind: m.kind, id: m.id, error: errMsg(e) });
    return { ...base, status: "failed", detail: errMsg(e) };
  }
}

async function giftThumbs(db: Db, runId: string, base: string, secret: string, now: Date): Promise<Array<{ src: string; alt: string }>> {
  const ads = await db.ad.findMany({
    where: { runId, status: "ready", kind: "static" },
    orderBy: { index: "asc" },
    take: 3,
    select: { headline: true, assets: { where: { mime: { startsWith: "image/" } }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, expiresAt: true } } },
  });
  const expSec = Math.floor(now.getTime() / 1000) + IMG_TOKEN_TTL_DAYS * 86_400;
  return ads.flatMap((a) => {
    const asset = a.assets[0];
    if (!asset || (asset.expiresAt && asset.expiresAt <= now)) return [];
    const e = asset.expiresAt ? Math.min(expSec, Math.floor(asset.expiresAt.getTime() / 1000)) : expSec;
    return [{ src: `${base}/api/ads/email-img/${signEmailToken({ p: "img", a: asset.id, e }, secret)}`, alt: a.headline }];
  });
}

export async function growthEmailTick(deps: GrowthDeps): Promise<GrowthResult[]> {
  const env = deps.env ?? process.env;
  const flag = await deps.db.adsFeatureFlag.findUnique({ where: { key: LIFECYCLE_FLAG } });
  if (!flag?.enabled) return [];
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  if (!secret) return [];
  const now = deps.now?.() ?? new Date();
  const dryRun = env.LIFECYCLE_DRY_RUN === "1";
  const base = appUrl(env);
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const out: GrowthResult[] = [];
  const unsub = (userId: string) => `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: userId }, secret)}`;

  const gifts = await deps.db.adsGift.findMany({ where: { status: "ready", source: { not: "outbound" }, createdAt: { gte: since }, runId: { not: null } }, orderBy: { createdAt: "asc" }, take: 100 });
  for (const g of gifts) {
    if (out.length >= MAX_PER_TICK || !g.runId) break;
    if (await alreadySent(deps.db, "gift_ready", "giftId", g.id)) continue;
    const r = await recipient(deps.db, g.senderUserId);
    if (!r) continue;
    if (r.skip) {
      out.push({ kind: "gift_ready", id: g.id, userId: g.senderUserId, status: "skipped", detail: r.skip });
      continue;
    }
    const run = await deps.db.adRun.findUnique({ where: { id: g.runId }, select: { extraction: true, brandProfile: { select: { name: true } } } });
    const ex = (run?.extraction && typeof run.extraction === "object" ? run.extraction : {}) as Record<string, unknown>;
    const brand = g.recipientName?.trim() || run?.brandProfile?.name?.trim() || (typeof ex.brandName === "string" ? ex.brandName : null);
    const thumbnails = await giftThumbs(deps.db, g.runId, base, secret, now);
    const copy = giftEmailCopy(brand, thumbnails.length || 3);
    out.push(
      await deliver(deps, {
        kind: "gift_ready", id: g.id, key: "giftId", userId: g.senderUserId, workspaceId: g.senderWorkspaceId, runId: g.runId, email: r.email,
        input: { appUrl: base, subject: copy.subject, preheader: copy.preheader, paragraphs: copy.paragraphs, cta: { label: copy.ctaLabel, href: `${base}/gift/${g.token}?share=1` }, thumbnails, unsubscribeUrl: unsub(g.senderUserId) },
      }, dryRun),
    );
  }

  const refs = await deps.db.adsReferral.findMany({ where: { status: "rewarded", rewardedAt: { gte: since }, rewardLedgerId: { not: null } }, orderBy: { rewardedAt: "asc" }, take: 100 });
  for (const ref of refs) {
    if (out.length >= MAX_PER_TICK || !ref.rewardLedgerId) break;
    if (await alreadySent(deps.db, "referral_reward", "referralId", ref.id)) continue;
    const ws = await deps.db.adsWorkspace.findUnique({ where: { id: ref.referrerWorkspaceId }, select: { ownerId: true } });
    const ledger = await deps.db.creditLedger.findUnique({ where: { id: ref.rewardLedgerId }, select: { delta: true, expiresAt: true } });
    if (!ws || !ledger?.expiresAt) continue;
    const r = await recipient(deps.db, ws.ownerId);
    if (!r) continue;
    if (r.skip) {
      out.push({ kind: "referral_reward", id: ref.id, userId: ws.ownerId, status: "skipped", detail: r.skip });
      continue;
    }
    const copy = referralEmailCopy(ledger.delta, ledger.expiresAt);
    out.push(
      await deliver(deps, {
        kind: "referral_reward", id: ref.id, key: "referralId", userId: ws.ownerId, workspaceId: ref.referrerWorkspaceId, runId: null, email: r.email,
        input: { appUrl: base, subject: copy.subject, preheader: copy.preheader, paragraphs: copy.paragraphs, cta: { label: copy.ctaLabel, href: `${base}/ads/refer?utm_source=email&utm_medium=lifecycle&utm_campaign=referral_reward` }, unsubscribeUrl: unsub(ws.ownerId) },
      }, dryRun),
    );
  }
  return out;
}

/** Growth loop: emails every `emailEveryMs` (default 1 min), referral expiry sweep every `expiryEveryMs` (default 30 min). */
export function startGrowthLoop(deps: GrowthDeps, emailEveryMs = 60_000, expiryEveryMs = 30 * 60_000): () => void {
  let mailing = false;
  let sweeping = false;
  const mail = () => {
    if (mailing) return;
    mailing = true;
    growthEmailTick(deps)
      .then((r) => r.length && log("info", "growth email tick", { sent: r.filter((x) => x.status === "sent").length, total: r.length }))
      .catch((e) => log("warn", "growth email tick failed", { error: errMsg(e) }))
      .finally(() => {
        mailing = false;
      });
  };
  const sweep = () => {
    if (sweeping) return;
    sweeping = true;
    sweepReferralExpiry(deps.db, deps.now?.() ?? new Date())
      .then((r) => r.length && log("info", "referral expiry sweep", { grants: r.length, credits: r.reduce((a, x) => a + x.expired, 0) }))
      .catch((e) => log("warn", "referral expiry sweep failed", { error: errMsg(e) }))
      .finally(() => {
        sweeping = false;
      });
  };
  const timers = [setTimeout(mail, 30_000), setTimeout(sweep, 45_000)];
  const intervals = [setInterval(mail, emailEveryMs), setInterval(sweep, expiryEveryMs)];
  return () => {
    for (const t of timers) clearTimeout(t);
    for (const t of intervals) clearInterval(t);
  };
}
