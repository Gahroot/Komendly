// Lifecycle email loop (engine side): select due users (shared pure logic), write personalised copy
// with Codex (validated, fallback template), render the branded email, send via SMTP, record
// AdsEvent email_sent {kind, subject} for idempotency. Kill switch: AdsFeatureFlag lifecycle_email.
import { LAUNCH_QUARTER, launchOfferExpiresAt } from "../../../src/lib/ads/billing-config";
import type { CopyContext } from "../../../src/lib/ads/lifecycle/copy";
import { looksLikeAgency } from "../../../src/lib/ads/lifecycle/facts";
import { freeAdsBlock, type LinkBlock } from "../../../src/lib/ads/lifecycle/free-ads";
import { founderFrom, founderNote } from "../../../src/lib/ads/lifecycle/founder";
import { loadLifecycleCandidates } from "../../../src/lib/ads/lifecycle/load";
import { BEST_AD_KINDS, dueEmail, isFreshKind, offerWindowStart, rankAdsForEmail, isStartKind, isVerifyKind, refreshedPackAllowed, type LifecycleCandidate, type LifecycleKind } from "../../../src/lib/ads/lifecycle/select";
import { renderLifecycleHtml, renderLifecycleText, unsubscribeHeaders, type LifecycleEmailInput } from "../../../src/lib/ads/lifecycle/template";
import { bonusLabel, parseBonus } from "../../../src/lib/ads/bonus-access";
import { makeReferralCode } from "../../../src/lib/ads/referral-code";
import { addPreview } from "../jobs/bonus";
import { nurtureState, startNurtureRun, type NurtureState } from "../jobs/nurture";
import type { Storage } from "../storage/s3";
import { IMG_TOKEN_TTL_DAYS, newVerificationSecrets, signEmailToken, verificationCodeHash, verificationLinkHash } from "../../../src/lib/ads/lifecycle/tokens";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import type { AIProvider } from "../providers/types";
import { writeCopy } from "./copywriter";
import { studioDropTick } from "./studio-drop";
import { STUDIO_DROP_FLAG, studioPsFor, withUtm } from "../../../src/lib/ads/lifecycle/studio-drop";
import type { SendMail } from "./mail";

export const LIFECYCLE_FLAG = "lifecycle_email";
const MAX_PER_TICK = 25;
const CODE_TTL_MS = 24 * 3_600_000;

export interface LifecycleDeps {
  db: Db;
  provider: AIProvider | null;
  send: SendMail;
  /** Needed for the monthly fresh-ad preview image (blurred "preview" AdAsset); without it the email has no image. */
  storage?: Storage;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface SendResult {
  userId: string;
  email: string;
  kind: LifecycleKind;
  subject: string;
  source: "ai" | "fallback";
  status: "sent" | "dry_run" | "skipped" | "failed";
  detail?: string;
}

function appUrl(env: NodeJS.ProcessEnv): string {
  return (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
}

function linkFor(base: string, path: string, kind: LifecycleKind): string {
  return `${base}${path}${path.includes("?") ? "&" : "?"}utm_source=email&utm_medium=lifecycle&utm_campaign=${kind}`;
}

/** Click-tracked link (/api/ads/email-click/<signed token> -> records email_clicked {kind} -> redirects to the app path). */
/** Off unless LIFECYCLE_CLICK_TRACKING=1 (set only once the web with /api/ads/email-click is deployed): plain URLs then. */
export function trackedLink(base: string, secret: string, userId: string, kind: LifecycleKind, path: string, env: NodeJS.ProcessEnv = process.env): string {
  const tagged = withUtm(path, kind);
  if (!secret || env.LIFECYCLE_CLICK_TRACKING !== "1") return `${base}${tagged}`;
  return `${base}/api/ads/email-click/${signEmailToken({ p: "click", u: userId, k: kind, l: tagged }, secret)}`;
}

/** Kinds that carry the "Ways to get more free ads" block (needs the user's referral code). */
/** Not on BEST_AD_KINDS: those are one-image, one-button emails. */
const FREE_ADS_BLOCK_KINDS: ReadonlySet<LifecycleKind> = new Set(["day10_free_ads", "free_ads_ways"]);

/** The workspace's referral code, created on first use (same format/table as the web's ensureReferralCode). */
export async function ensureReferralCodeDb(db: Db, workspaceId: string, userId: string, name: string | null): Promise<string> {
  const existing = await db.adsReferralCode.findUnique({ where: { workspaceId }, select: { code: true } });
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return (await db.adsReferralCode.create({ data: { code: makeReferralCode(name), workspaceId, userId }, select: { code: true } })).code;
    } catch {
      const again = await db.adsReferralCode.findUnique({ where: { workspaceId }, select: { code: true } });
      if (again) return again.code;
    }
  }
  throw new Error("could not allocate a referral code");
}

/** Absolute, click-tracked copy of a link block. */
function trackBlock(b: LinkBlock, link: (path: string) => string): NonNullable<LifecycleEmailInput["blocks"]>[number] {
  return { title: b.title, items: b.items.map((i) => ({ ...i, href: link(i.href) })) };
}

const strOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function brandContext(db: Db, runId: string | null) {
  if (!runId) return { brandName: null, offer: null, audience: null, agencyLike: false, lockedLabel: null as string | null, pains: [] as string[], headlines: [] as string[], thumbs: [] as Array<{ assetId: string; alt: string; expiresAt: Date | null }> };
  const run = await db.adRun.findUnique({ where: { id: runId }, select: { extraction: true, brandProfile: { select: { name: true, mainOffer: true, audience: true, pains: true } } } });
  const ex = (run?.extraction && typeof run.extraction === "object" ? run.extraction : {}) as Record<string, unknown>;
  const bp = run?.brandProfile;
  const painsRaw = Array.isArray(bp?.pains) && bp.pains.length ? bp.pains : Array.isArray(ex.pains) ? ex.pains : [];
  const pains = painsRaw.map((p) => (typeof p === "string" ? p : p && typeof p === "object" ? strOf((p as Record<string, unknown>).text) : null)).filter((p): p is string => Boolean(p));
  const ads = await db.ad.findMany({
    where: { runId, status: "ready" },
    orderBy: { index: "asc" },
    select: { index: true, headline: true, kind: true, visualBrief: true, qcReport: true, qcAttempts: true, assets: { where: { mime: { startsWith: "image/" } }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, expiresAt: true } } },
  });
  // Locked bonus ads are extras: never in the free count, headlines or thumbnails; mentioned separately.
  const locked = ads.filter((a) => parseBonus(a.visualBrief));
  const free = ads.filter((a) => !parseBonus(a.visualBrief));
  const stories = locked.filter((a) => parseBonus(a.visualBrief)?.bonusKind === "story").length;
  const fresh = locked.filter((a) => parseBonus(a.visualBrief)?.bonusKind === "fresh").length;
  const lockedLabel = locked.length ? bonusLabel({ stories, fresh, videos: locked.length - stories - fresh }) : null;
  return {
    lockedLabel,
    brandName: strOf(bp?.name) ?? strOf(ex.brandName) ?? strOf(ex.name),
    offer: strOf(bp?.mainOffer) ?? strOf(ex.mainOffer),
    audience: strOf(bp?.audience) ?? strOf(ex.audience),
    agencyLike: looksLikeAgency([bp?.name, bp?.mainOffer, bp?.audience, ex.brandName, ex.mainOffer, ex.audience, ex.description, ex.tagline].filter((x): x is string => typeof x === "string").join(" \n ")),
    pains,
    headlines: free.map((a) => a.headline).filter(Boolean),
    // Best ready static first (QC), then the next ones: [0] is the hero of BEST_AD_KINDS emails.
    thumbs: rankAdsForEmail(free.map((a) => ({ ...a, hasImage: Boolean(a.assets[0]) }))).slice(0, 4).map((a) => ({ assetId: a.assets[0]?.id ?? "", alt: a.headline, expiresAt: a.assets[0]?.expiresAt ?? null })),
  };
}

/** Fresh code + link for the verify nudge (same hashes as the web app's src/lib/ads/verify.ts). */
async function issueVerification(db: Db, userId: string, now: Date): Promise<{ token: string; code: string }> {
  const { token, code } = newVerificationSecrets();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await db.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
  await db.emailVerificationToken.createMany({ data: [{ userId, tokenHash: verificationLinkHash(token), expiresAt }, { userId, tokenHash: verificationCodeHash(userId, code), expiresAt }] });
  await db.adsRateLimit.deleteMany({ where: { key: `verify-code:${userId}` } });
  return { token, code };
}

/** Build, (maybe) send and record one email. `dryRun` writes nothing and sends nothing. */
export async function sendLifecycleEmail(deps: LifecycleDeps, c: LifecycleCandidate, kind: LifecycleKind, opts: { runId?: string | null; dryRun: boolean; nurture?: NurtureState; studioLive?: boolean }): Promise<SendResult> {
  const env = deps.env ?? process.env;
  const now = deps.now?.() ?? new Date();
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  const base = appUrl(env);
  const runId = opts.runId ?? c.trialRunId;
  const verify = isVerifyKind(kind);
  const brand = await brandContext(deps.db, verify ? null : runId);
  if (kind === "founder_note") return sendFounderNote(deps, c, { runId, brandName: brand.brandName, dryRun: opts.dryRun });
  const verification = verify && !opts.dryRun ? await issueVerification(deps.db, c.userId, now) : null;
  const fresh = isFreshKind(kind) && opts.nurture?.state === "ready" ? opts.nurture : null;
  const referralCode = FREE_ADS_BLOCK_KINDS.has(kind)
    ? opts.dryRun
      ? ((await deps.db.adsReferralCode.findUnique({ where: { workspaceId: c.workspaceId }, select: { code: true } }))?.code ?? "your-code")
      : await ensureReferralCodeDb(deps.db, c.workspaceId, c.userId, c.name)
    : null;
  const ctx: CopyContext = {
    kind,
    firstName: c.name?.trim().split(/\s+/)[0] ?? null,
    brandName: brand.brandName,
    offer: brand.offer,
    audience: brand.audience,
    pains: brand.pains,
    headlines: brand.headlines,
    readyAdCount: kind === "refreshed_pack" ? brand.headlines.length : c.readyAdCount,
    lockedLabel: kind === "ads_ready" || kind === "refreshed_pack" || kind === "how_to_run" ? brand.lockedLabel : null,
    offerExpiresAt: launchOfferExpiresAt(offerWindowStart(c), LAUNCH_QUARTER),
    // Locked bonus ads exist and stay locked (day7 only reaches unpaid users who bought no pack: `paid` covers both).
    hasLockedBonus: Boolean(brand.lockedLabel) && !c.paid,
    code: verification?.code ?? (verify ? "000000" : undefined),
    paid: c.paid,
    agencyLike: brand.agencyLike,
    freshAd: Boolean(fresh),
  };
  const { copy, source, reason } = await writeCopy(verify ? null : deps.provider, ctx, now);
  const path =
    verify ? `/verify-email?token=${verification?.token ?? "DRY_RUN"}`
    : isStartKind(kind) ? "/ads/app"
    // $9 Unlock this pack: the run page shows the unlock card. Without locked ads: the 10-credit pack on pricing.
    : kind === "day7_downsell" && runId && brand.lockedLabel && !c.paid ? `/ads/runs/${runId}`
    : kind === "day7_downsell" || kind === "day14_tip" || kind === "day30_checkin" ? "/ads/pricing"
    : kind === "day10_free_ads" || kind === "free_ads_ways" ? "/ads/refer"
    : kind === "day21_examples" ? "/ad-examples"
    : isFreshKind(kind) ? (fresh ? `/ads/runs/${fresh.runId}` : "/ads/pricing")
    : kind === "how_to_run" && runId ? `/ads/runs/${runId}#launch-guide`
    : runId ? `/ads/runs/${runId}` : "/ads/app";
  const link = (p: string) => (verify ? linkFor(base, p, kind) : trackedLink(base, secret, c.userId, kind, p, env));
  const blocks: NonNullable<LifecycleEmailInput["blocks"]> = [];
  if (referralCode) blocks.push(trackBlock(freeAdsBlock({ referralCode, paid: c.paid }), link));
  if (kind === "day21_examples") {
    blocks.push({ title: "More to look at", items: [
      { text: "Every week we pick one ad made with Komendly to feature.", linkLabel: "Ad of the week", href: link("/ad-of-the-week") },
      ...(runId ? [{ text: "Like one of your ads? Ask us to feature it from your results page.", linkLabel: "Feature my ad", href: link(`/ads/runs/${runId}`) }] : []),
    ] });
  }
  if (kind === "day30_checkin" && !brand.agencyLike) blocks.push({ title: "Know businesses that need ads?", items: [{ text: "Partners earn 30% of what the businesses they refer pay, for 12 months.", linkLabel: "Partner program", href: link("/partners") }] });
  let hero: LifecycleEmailInput["hero"];
  if (fresh && secret) {
    const hasPreview = await deps.db.adAsset.findFirst({ where: { adId: fresh.adId, ratio: "preview" }, select: { id: true } });
    if (!hasPreview && deps.storage && !opts.dryRun) await addPreview(deps.db, deps.storage, fresh.adId, now, IMG_TOKEN_TTL_DAYS).catch((e: unknown) => log("warn", "nurture preview failed", { adId: fresh.adId, error: errMsg(e) }));
    const pv = await deps.db.adAsset.findFirst({ where: { adId: fresh.adId, ratio: "preview" }, orderBy: { createdAt: "desc" }, select: { id: true, expiresAt: true } });
    if (pv && (!pv.expiresAt || pv.expiresAt > now)) {
      const e = Math.floor(now.getTime() / 1000) + IMG_TOKEN_TTL_DAYS * 86_400;
      hero = { src: `${base}/api/ads/email-img/${signEmailToken({ p: "img", a: pv.id, e: pv.expiresAt ? Math.min(e, Math.floor(pv.expiresAt.getTime() / 1000)) : e }, secret)}`, alt: fresh.headline, href: link(path), caption: "Locked: unlocks with any plan or credit pack" };
    }
  }
  const expSec = Math.floor(now.getTime() / 1000) + IMG_TOKEN_TTL_DAYS * 86_400;
  const imgs = secret
    ? brand.thumbs
        .filter((t) => !t.expiresAt || t.expiresAt > now)
        .map((t) => ({ src: `${base}/api/ads/email-img/${signEmailToken({ p: "img", a: t.assetId, e: t.expiresAt ? Math.min(expSec, Math.floor(t.expiresAt.getTime() / 1000)) : expSec }, secret)}`, alt: t.alt }))
    : [];
  const best = BEST_AD_KINDS.has(kind) ? imgs[0] : undefined;
  if (best) hero = { src: best.src, alt: best.alt, href: link(path), caption: "", locked: false, position: "top" };
  // ads_ready: hero + a small grid of 3 more; refreshed_pack keeps its 3 thumbnails; the rest show only the hero.
  const thumbnails = kind === "ads_ready" ? imgs.slice(best ? 1 : 0, (best ? 1 : 0) + 3) : kind === "refreshed_pack" ? imgs.slice(0, 3) : [];
  const unsubscribeUrl = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: c.userId }, secret)}`;
  // Studio woven in lightly (day7/day10 only): a P.S. under the main CTA, never a second button.
  const madeStudioVideo = opts.studioLive ? Boolean((await deps.db.adsWorkspace.findUnique({ where: { id: c.workspaceId }, select: { studioOfferReadyAt: true } }))?.studioOfferReadyAt) : false;
  const ps = BEST_AD_KINDS.has(kind) ? null : studioPsFor(kind, { runId, studioLive: Boolean(opts.studioLive), madeStudioVideo });
  const input = {
    appUrl: base,
    subject: copy.subject,
    preheader: copy.preheader,
    paragraphs: copy.paragraphs,
    cta: { label: copy.ctaLabel, href: link(path) },
    code: verification?.code,
    thumbnails,
    hero,
    blocks,
    ps: ps ? { text: ps.text, linkLabel: ps.linkLabel, href: link(ps.path) } : undefined,
    unsubscribeUrl,
  };
  const result: SendResult = { userId: c.userId, email: c.email, kind, subject: copy.subject, source, status: "dry_run", detail: reason };
  if (opts.dryRun) {
    log("info", "lifecycle email (dry run)", { ...result, text: renderLifecycleText(input) });
    return result;
  }
  // Claim first (idempotency): a failed send removes the claim so the next tick retries inside the window.
  const claim = await deps.db.adsEvent.create({ data: { name: "email_sent", userId: c.userId, workspaceId: c.workspaceId, runId: fresh?.runId ?? runId, props: { kind, subject: copy.subject, source, ...(isFreshKind(kind) ? { freshAd: Boolean(fresh) } : {}) } } });
  try {
    await deps.send({ to: c.email, subject: copy.subject, text: renderLifecycleText(input), html: renderLifecycleHtml(input), headers: unsubscribeHeaders(unsubscribeUrl) });
    log("info", "lifecycle email sent", { userId: c.userId, kind, source, reason });
    return { ...result, status: "sent" };
  } catch (e) {
    await deps.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
    log("warn", "lifecycle email failed", { userId: c.userId, kind, error: errMsg(e) });
    return { ...result, status: "failed", detail: errMsg(e) };
  }
}

/** founder_note: plain text from Nolan (LIFECYCLE_FOUNDER_FROM), no HTML/images/tracking; same claim/unsubscribe as the rest. */
async function sendFounderNote(deps: LifecycleDeps, c: LifecycleCandidate, o: { runId: string | null; brandName: string | null; dryRun: boolean }): Promise<SendResult> {
  const env = deps.env ?? process.env;
  const base = appUrl(env);
  const unsubscribeUrl = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: c.userId }, env.LIFECYCLE_EMAIL_SECRET ?? "")}`;
  const note = founderNote({ firstName: c.name?.trim().split(/\s+/)[0] ?? null, brandName: o.brandName, readyAdCount: c.readyAdCount, runUrl: o.runId ? `${base}/ads/runs/${o.runId}` : null, unsubscribeUrl });
  const kind = "founder_note" as const;
  const result: SendResult = { userId: c.userId, email: c.email, kind, subject: note.subject, source: "fallback", status: "dry_run", detail: "fixed founder copy" };
  if (o.dryRun) {
    log("info", "lifecycle email (dry run)", { ...result, text: note.text });
    return result;
  }
  const claim = await deps.db.adsEvent.create({ data: { name: "email_sent", userId: c.userId, workspaceId: c.workspaceId, runId: o.runId, props: { kind, subject: note.subject, source: "fixed" } } });
  try {
    await deps.send({ to: c.email, from: founderFrom(env.LIFECYCLE_FOUNDER_FROM), subject: note.subject, text: note.text, html: "", headers: unsubscribeHeaders(unsubscribeUrl) });
    log("info", "lifecycle email sent", { userId: c.userId, kind });
    return { ...result, status: "sent" };
  } catch (e) {
    await deps.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
    log("warn", "lifecycle email failed", { userId: c.userId, kind, error: errMsg(e) });
    return { ...result, status: "failed", detail: errMsg(e) };
  }
}

/** One loop tick. Does nothing unless the lifecycle_email flag is on. LIFECYCLE_DRY_RUN=1 logs instead of sending. */
export async function lifecycleTick(deps: LifecycleDeps): Promise<SendResult[]> {
  const env = deps.env ?? process.env;
  const flag = await deps.db.adsFeatureFlag.findUnique({ where: { key: LIFECYCLE_FLAG } });
  if (!flag?.enabled) return [];
  if (!env.LIFECYCLE_EMAIL_SECRET) {
    log("warn", "lifecycle email: LIFECYCLE_EMAIL_SECRET unset, skipping");
    return [];
  }
  const now = deps.now?.() ?? new Date();
  const dryRun = env.LIFECYCLE_DRY_RUN === "1";
  const studioLive = Boolean((await deps.db.adsFeatureFlag.findUnique({ where: { key: STUDIO_DROP_FLAG } }))?.enabled);
  const due = (await loadLifecycleCandidates(deps.db, now)).flatMap((c) => {
    const d = dueEmail(c, now);
    return d ? [{ c, kind: d.kind }] : [];
  });
  const out: SendResult[] = [];
  for (const { c, kind } of due) {
    if (out.length >= MAX_PER_TICK) break;
    let nurture: NurtureState | undefined;
    if (isFreshKind(kind)) {
      // Monthly fresh ad: make the ad first (no email this tick), send once it's ready, failed or timed out.
      nurture = await nurtureState(deps.db, c.workspaceId, kind, now);
      if (nurture.state === "none" && !dryRun) nurture = await startNurtureRun(deps.db, c, kind);
      if (nurture.state === "pending" || (nurture.state === "none" && !dryRun)) continue;
    }
    out.push(await sendLifecycleEmail(deps, c, kind, { dryRun, nurture, studioLive }));
  }
  return out;
}

/** Ops one-off (engine/scripts/send-lifecycle.ts): refreshed_pack for one user + run, once per run. */
export async function sendRefreshedPack(deps: LifecycleDeps, email: string, runId: string, dryRun: boolean): Promise<SendResult | { error: string }> {
  const user = await deps.db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (!user) return { error: `no user ${email}` };
  const [c] = await loadLifecycleCandidates(deps.db, deps.now?.() ?? new Date(), [user.id]);
  if (!c) return { error: "user has no ads workspace" };
  const run = await deps.db.adRun.findFirst({ where: { id: runId, workspaceId: c.workspaceId }, select: { id: true } });
  if (!run) return { error: "run not found in the user's workspace" };
  if (!refreshedPackAllowed(c, runId)) return { error: "suppressed (paid / unsubscribed / test user) or already sent for this run" };
  return sendLifecycleEmail(deps, c, "refreshed_pack", { runId, dryRun });
}

/** Starts the periodic loop; returns a stop function. */
export function startLifecycleLoop(deps: LifecycleDeps, everyMs = 10 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    lifecycleTick(deps)
      .then((r) => r.length && log("info", "lifecycle tick", { sent: r.filter((x) => x.status === "sent").length, total: r.length }))
      // "Ozzy Studio just dropped" drip (flag studio_drop), after the regular sequence so its emails go first.
      .then(() => studioDropTick(deps))
      .then((r) => r.length && log("info", "studio drop tick", { sent: r.filter((x) => x.status === "sent").length, total: r.length }))
      .catch((e) => log("warn", "lifecycle tick failed", { error: errMsg(e) }))
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 60_000);
  const t = setInterval(tick, everyMs);
  return () => {
    clearTimeout(first);
    clearInterval(t);
  };
}
