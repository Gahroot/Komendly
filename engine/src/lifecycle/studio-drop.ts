// "Ozzy Studio just dropped" drip (engine side). Runs inside the lifecycle loop tick. Needs BOTH AdsFeatureFlag
// lifecycle_email and studio_drop (default off) + LIFECYCLE_EMAIL_SECRET; LIFECYCLE_DRY_RUN=1 logs instead of sending.
// Copy: Codex-written body (validated) with fixed subjects and fixed fallbacks. Idempotency: AdsEvent email_sent
// {kind, inviteId?} claimed before the send (removed again if the send fails).
import { STUDIO_LAUNCH_OFFER } from "../../../src/lib/hub/money-model";
import { parseBonus } from "../../../src/lib/ads/bonus-access";
import {
  buildStudioCopyPrompt, checkStudioCopy, dueStudioEmail, loadStudioDropCandidates, STUDIO_COPY_SYSTEM, STUDIO_DROP_FLAG, STUDIO_FIXED_COPY, STUDIO_INVITE_SAFE,
  STUDIO_SUBJECTS, studioBridgePath, studioCtaPath, studioDropStart, studioFallbackCopy, studioOfferOpen, studioStarterLinks, withUtm,
  type StudioCopyContext, type StudioDropCandidate, type StudioDropKind,
} from "../../../src/lib/ads/lifecycle/studio-drop";
import type { EmailCopy } from "../../../src/lib/ads/lifecycle/copy";
import { renderLifecycleHtml, renderLifecycleText, unsubscribeHeaders, type LifecycleEmailInput } from "../../../src/lib/ads/lifecycle/template";
import { IMG_TOKEN_TTL_DAYS, signEmailToken } from "../../../src/lib/ads/lifecycle/tokens";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { structured } from "../providers/structured";
import type { AIProvider, UsageMeter } from "../providers/types";
import { CopySchema } from "./copywriter";
import type { SendMail } from "./mail";

const MAX_PER_TICK = 25;

export interface StudioDropDeps {
  db: Db;
  provider: AIProvider | null;
  send: SendMail;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface StudioDropResult {
  userId: string;
  kind: StudioDropKind;
  subject: string;
  source: "ai" | "fallback";
  status: "sent" | "dry_run" | "failed";
  detail?: string;
}

export function studioCopyContext(c: StudioDropCandidate, kind: StudioDropKind, now: Date, brandName: string | null = null): StudioCopyContext {
  // One offer at a time: no Studio launch-offer pitch while the trial's Launch Quarter window is open.
  const offerOpen = studioOfferOpen(c, now);
  return {
    runId: c.trial?.runId ?? null,
    brandName,
    kind,
    firstName: c.name?.trim().split(/\s+/)[0] ?? null,
    paid: c.paid,
    testimonialsUser: c.testimonialsUser,
    offerOpen,
    offerClosesAt: c.firstFreeVideoAt ? new Date(c.firstFreeVideoAt.getTime() + STUDIO_LAUNCH_OFFER.windowHours * 3_600_000) : null,
    freeVideosLeft: c.freeVideosLeft,
  };
}

/** Codex body with the fixed subject; any failure -> fixed fallback copy. */
export async function writeStudioCopy(provider: AIProvider | null, ctx: StudioCopyContext, now: Date, signal?: AbortSignal): Promise<{ copy: EmailCopy; source: "ai" | "fallback"; reason?: string }> {
  const fallback = studioFallbackCopy(ctx, now);
  if (STUDIO_FIXED_COPY.has(ctx.kind)) return { copy: fallback, source: "fallback", reason: "fixed copy" };
  if (!provider) return { copy: fallback, source: "fallback", reason: "no provider" };
  try {
    const usage: UsageMeter[] = [];
    const out = await structured(provider, CopySchema, { system: STUDIO_COPY_SYSTEM, prompt: buildStudioCopyPrompt(ctx, now), reasoning: "low", signal }, usage);
    const copy = { ...out, subject: STUDIO_SUBJECTS[ctx.kind] };
    const bad = checkStudioCopy(copy, ctx);
    return bad ? { copy: fallback, source: "fallback", reason: bad } : { copy, source: "ai" };
  } catch (e) {
    return { copy: fallback, source: "fallback", reason: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
}

function linkWith(base: string, secret: string, userId: string, kind: string, path: string, env: NodeJS.ProcessEnv): string {
  const tagged = withUtm(path, kind);
  if (!secret || env.LIFECYCLE_CLICK_TRACKING !== "1") return `${base}${tagged}`;
  return `${base}/api/ads/email-click/${signEmailToken({ p: "click", u: userId, k: kind, l: tagged }, secret)}`;
}

/** Pure: the rendered email input for one Studio drop email (also used to render samples). */
export function studioDropEmailInput(o: { base: string; ctx: StudioCopyContext; copy: EmailCopy; link: (path: string) => string; unsubscribeUrl: string; bestAd?: { src: string; alt: string } | null }): LifecycleEmailInput {
  const { ctx, copy, link } = o;
  const blocks: NonNullable<LifecycleEmailInput["blocks"]> = [];
  const cta = { label: copy.ctaLabel, href: link(studioCtaPath(ctx.kind, ctx.runId)) };
  if (ctx.kind === "studio_second_wow") {
    const hero = o.bestAd ? { src: o.bestAd.src, alt: o.bestAd.alt, href: cta.href, caption: "Your ad, ready to become a video", locked: false } : undefined;
    return { appUrl: o.base, subject: copy.subject, preheader: copy.preheader, paragraphs: copy.paragraphs, cta, hero, blocks, unsubscribeUrl: o.unsubscribeUrl };
  }
  if (ctx.kind === "studio_included") {
    if (ctx.runId) blocks.push({ title: "Start from an ad you already have", items: [{ text: "Pick one of your ads and I'll turn it into a short video.", linkLabel: "Make one of my ads a video", href: link(studioBridgePath(ctx.runId)) }] });
    blocks.push({ title: "Or start with one of these", items: studioStarterLinks().map((i) => ({ ...i, href: link(i.href) })) });
  }
  if (ctx.kind === "studio_d0") blocks.push({ title: "Start with one of these", items: studioStarterLinks().map((i) => ({ ...i, href: link(i.href) })) });
  if (ctx.kind === "studio_d5") blocks.push({ title: "Give a friend 2 free videos", items: [{ text: STUDIO_INVITE_SAFE, linkLabel: "Open Ozzy Studio", href: link("/studio") }] });
  if (ctx.kind === "studio_ready" && ctx.offerOpen) blocks.push({ title: STUDIO_LAUNCH_OFFER.name, items: [{ text: STUDIO_LAUNCH_OFFER.stack.join(" · "), linkLabel: "Claim the offer", href: link("/ads/billing") }] });
  return { appUrl: o.base, subject: copy.subject, preheader: copy.preheader, paragraphs: copy.paragraphs, cta, blocks, unsubscribeUrl: o.unsubscribeUrl };
}

/** The run's best ad = the first ready FREE static ad (same pick as the ads_ready thumbnails) + its image asset. */
export async function bestAd(db: Db, runId: string, now: Date): Promise<{ assetId: string | null; expiresAt: Date | null; alt: string; brandName: string | null }> {
  const [run, ads] = await Promise.all([
    db.adRun.findUnique({ where: { id: runId }, select: { brandProfile: { select: { name: true } } } }),
    db.ad.findMany({ where: { runId, status: "ready", kind: "static" }, orderBy: { index: "asc" }, select: { headline: true, visualBrief: true, assets: { where: { mime: { startsWith: "image/" } }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, expiresAt: true } } } }),
  ]);
  const ad = ads.find((a) => !parseBonus(a.visualBrief) && a.assets[0] && (!a.assets[0].expiresAt || a.assets[0].expiresAt > now));
  const brandName = run?.brandProfile?.name?.trim() || null;
  return { assetId: ad?.assets[0]?.id ?? null, expiresAt: ad?.assets[0]?.expiresAt ?? null, alt: ad?.headline ?? "Your ad", brandName };
}

/** Signed email image URL (same as the ads_ready thumbnails). */
export function emailImg(base: string, secret: string, assetId: string, expiresAt: Date | null, now: Date): string {
  const e = Math.floor(now.getTime() / 1000) + IMG_TOKEN_TTL_DAYS * 86_400;
  return `${base}/api/ads/email-img/${signEmailToken({ p: "img", a: assetId, e: expiresAt ? Math.min(e, Math.floor(expiresAt.getTime() / 1000)) : e }, secret)}`;
}

/** One tick: no-op unless lifecycle_email AND studio_drop are on. */
export async function studioDropTick(deps: StudioDropDeps): Promise<StudioDropResult[]> {
  const env = deps.env ?? process.env;
  const [main, drop] = await Promise.all([
    deps.db.adsFeatureFlag.findUnique({ where: { key: "lifecycle_email" } }),
    deps.db.adsFeatureFlag.findUnique({ where: { key: STUDIO_DROP_FLAG } }),
  ]);
  if (!main?.enabled || !drop?.enabled) return [];
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  if (!secret) return [];
  const now = deps.now?.() ?? new Date();
  const start = studioDropStart(drop.updatedAt, env.LIFECYCLE_STUDIO_DROP_START);
  const dryRun = env.LIFECYCLE_DRY_RUN === "1";
  const base = (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
  const due = (await loadStudioDropCandidates(deps.db, now)).flatMap((c) => {
    const d = dueStudioEmail(c, now, start, env.LIFECYCLE_EXCLUDE);
    return d ? [{ c, d }] : [];
  });
  const out: StudioDropResult[] = [];
  for (const { c, d } of due.slice(0, MAX_PER_TICK)) {
    const best = d.kind === "studio_second_wow" && c.trial ? await bestAd(deps.db, c.trial.runId, now) : null;
    const ctx = studioCopyContext(c, d.kind, now, best?.brandName ?? null);
    const { copy, source, reason } = await writeStudioCopy(deps.provider, ctx, now);
    const unsubscribeUrl = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: c.userId }, secret)}`;
    const bestImg = best?.assetId ? { src: emailImg(base, secret, best.assetId, best.expiresAt, now), alt: best.alt } : null;
    const input = studioDropEmailInput({ base, ctx, copy, unsubscribeUrl, bestAd: bestImg, link: (p) => linkWith(base, secret, c.userId, d.kind, p, env) });
    const result: StudioDropResult = { userId: c.userId, kind: d.kind, subject: copy.subject, source, status: "dry_run", detail: reason };
    if (dryRun) {
      log("info", "studio drop email (dry run)", { ...result, text: renderLifecycleText(input) });
      out.push(result);
      continue;
    }
    const claim = await deps.db.adsEvent.create({ data: { name: "email_sent", userId: c.userId, workspaceId: c.workspaceId, runId: c.trial?.runId ?? null, props: { kind: d.kind, subject: copy.subject, source, ...(d.inviteId ? { inviteId: d.inviteId } : {}) } } });
    try {
      await deps.send({ to: c.email, subject: copy.subject, text: renderLifecycleText(input), html: renderLifecycleHtml(input), headers: unsubscribeHeaders(unsubscribeUrl) });
      out.push({ ...result, status: "sent" });
    } catch (e) {
      await deps.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
      log("warn", "studio drop email failed", { userId: c.userId, kind: d.kind, error: errMsg(e) });
      out.push({ ...result, status: "failed", detail: errMsg(e) });
    }
  }
  return out;
}
