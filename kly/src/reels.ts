// Ozzy's short-video publisher + weekly insights for Komendly's OWN Facebook Page / Instagram (system `reels`, flag sys_reels, OFF by default).
// The engine renders reels (AdsEvent `reel_ready`); this publishes them as a Facebook Reel + Instagram Reel through the same connection,
// token and unique-claim idempotency as the daily static post: KlySocialPost.platform = "<platform>_reel:<slot>" (no schema change), so
// each (day, platform, slot) is claimed before publishing and N reels/day (default 1, max 3) never double-post. Auth/policy errors pause
// the platform (AdsEvent reel_paused) until someone resumes it. Docs: docs/growth-ecosystem/reels.md.
import { openSecret } from "./mailboxes";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import {
  SOCIAL_SITE, etDay, etHour, etMinutes, fbReelInsights, igReelInsights, publishFacebookReel, publishInstagramReel, socialGate, type FetchFn, type SocialPlatform,
} from "../../src/lib/kly/social-core";
import {
  REEL_EVENTS, REEL_PLATFORMS, checkReelCaption, dailyCap, isAuthOrPolicyError, isPaused, parseSlotPlatform, reelDue, reelSlotPlatform, type ReelPlatform, type ReelReadyProps,
} from "../../src/lib/growth/reels-core";
import { isoWeekLabel as isoWeek, learningMarkdown, perfsFromEvents } from "../../src/lib/growth/reels-learning";
import { systemFlagKey } from "../../src/lib/growth/systems";

const DEFAULT_GRAPH_VERSION = "v25.0";
const DAY = 86_400_000;

export interface ReelsDeps {
  db: Db;
  settings: { socialEnabled: boolean; socialHourEt: number };
  env: NodeJS.ProcessEnv;
  now: Date;
  fetch?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
}

export async function reelsOn(db: Db): Promise<boolean> {
  try {
    return (await db.adsFeatureFlag.findUnique({ where: { key: systemFlagKey("reels") } }))?.enabled === true;
  } catch {
    return false; // fail safe: unreadable flag = off
  }
}

async function pausedPlatforms(db: Db): Promise<Set<string>> {
  const ev = await db.adsEvent.findMany({ where: { name: { in: [REEL_EVENTS.paused, REEL_EVENTS.resumed] } }, orderBy: { createdAt: "desc" }, take: 50, select: { name: true, props: true, createdAt: true } });
  return new Set(REEL_PLATFORMS.filter((p) => isPaused(ev, p)));
}

const readyProps = (e: { props: unknown }) => e.props as ReelReadyProps;

/** For the static post: has a reel gone out today / is one ready and waiting (so the static post should wait or skip)? */
export async function reelsState(db: Db, now: Date): Promise<{ on: boolean; postedToday: Set<SocialPlatform>; ready: boolean; paused: Set<string> }> {
  if (!(await reelsOn(db))) return { on: false, postedToday: new Set(), ready: false, paused: new Set() };
  const day = etDay(now);
  const rows = await db.klySocialPost.findMany({ where: { day }, select: { platform: true, status: true } });
  const postedToday = new Set<SocialPlatform>();
  for (const r of rows) {
    const s = parseSlotPlatform(r.platform);
    if (s && r.status !== "failed") postedToday.add(s.platform);
  }
  const events = await db.adsEvent.findMany({ where: { name: REEL_EVENTS.ready, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }, select: { props: true }, take: 50 });
  const used = new Set((await db.klySocialPost.findMany({ where: { sourceKind: "reel" }, select: { sourceRef: true }, take: 1000 })).map((r) => r.sourceRef));
  return { on: true, postedToday, ready: events.some((e) => !used.has(readyProps(e).reelId)), paused: await pausedPlatforms(db) };
}

export type ReelsResult = { skipped: string } | { posted: Array<{ platform: ReelPlatform; slot: number; ok: boolean; id?: string; error?: string }> };

export async function reelsTick(d: ReelsDeps): Promise<ReelsResult> {
  const { db, now } = d;
  if (!d.settings.socialEnabled) return { skipped: "switched off" };
  if (!(await reelsOn(db))) return { skipped: "sys_reels off" };
  const conn = await db.klySocialConnection.findUnique({ where: { id: "komendly" } });
  const key = d.env.ADS_TOKEN_KEY?.trim();
  const gate = socialGate({ socialEnabled: true, socialHourEt: d.settings.socialHourEt, connected: Boolean(conn?.pageId && conn.pageTokenEnc), hasTokenKey: Boolean(key), now });
  if (gate || !conn) return { skipped: gate ?? "not connected" };
  const day = etDay(now);
  const cap = dailyCap(d.env);
  const paused = await pausedPlatforms(db);
  const today = await db.klySocialPost.findMany({ where: { day }, select: { platform: true } });
  const taken = new Set(today.map((r) => r.platform));
  const ready = (await db.adsEvent.findMany({ where: { name: REEL_EVENTS.ready, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }, orderBy: { createdAt: "asc" }, take: 50, select: { props: true } })).map(readyProps);
  const claimed = await db.klySocialPost.findMany({ where: { sourceKind: "reel" }, select: { sourceRef: true, platform: true }, take: 1000 });
  const token = openSecret(conn.pageTokenEnc, key);
  const version = d.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const f = d.fetch ?? fetch;
  const posted: Array<{ platform: ReelPlatform; slot: number; ok: boolean; id?: string; error?: string }> = [];
  const platforms = REEL_PLATFORMS.filter((p) => p === "facebook" || conn.igUserId);
  for (const platform of platforms) {
    if (paused.has(platform)) continue;
    const slot = Array.from({ length: cap }, (_, i) => i + 1).find((s) => !taken.has(reelSlotPlatform(platform, s)));
    if (!slot || !reelDue(etMinutes(now), d.settings.socialHourEt, day, platform, slot)) continue;
    const reel = ready.find((r) => !claimed.some((c) => c.sourceRef === r.reelId && (parseSlotPlatform(c.platform)?.platform === platform)));
    if (!reel) continue;
    const caption = reel.captions?.[platform] ?? "";
    const bad = checkReelCaption(caption, platform, { withCta: reel.withCta, hookId: reel.hookId });
    if (bad) {
      log("warn", "kly reels caption rejected, skipped", { reelId: reel.reelId, platform, reason: bad });
      continue;
    }
    const videoUrl = `${SOCIAL_SITE}/api/reels/${encodeURIComponent(reel.reelId)}/video`;
    let rowId: string;
    try {
      rowId = (await db.klySocialPost.create({ data: { day, platform: reelSlotPlatform(platform, slot), sourceKind: "reel", sourceRef: reel.reelId, caption, imageUrl: videoUrl } })).id;
    } catch {
      continue; // someone else claimed this (day, platform, slot)
    }
    try {
      const signal = AbortSignal.timeout(300_000);
      const id = platform === "facebook"
        ? await publishFacebookReel({ f, version, pageId: conn.pageId, token, videoUrl, caption, signal, sleep: d.sleep })
        : await publishInstagramReel({ f, version, igUserId: conn.igUserId ?? "", token, videoUrl, caption, signal, sleep: d.sleep });
      await db.klySocialPost.update({ where: { id: rowId }, data: { status: "posted", postId: id } });
      await db.adsEvent.create({ data: { name: REEL_EVENTS.published, props: { reelId: reel.reelId, platform, postId: id, slot, day } } }).catch(() => undefined);
      posted.push({ platform, slot, ok: true, id });
    } catch (e) {
      const error = errMsg(e).slice(0, 500);
      await db.klySocialPost.update({ where: { id: rowId }, data: { status: "failed", error } });
      if (isAuthOrPolicyError(error)) {
        await db.adsEvent.create({ data: { name: REEL_EVENTS.paused, props: { platform, reason: error } } }).catch(() => undefined);
        log("warn", "kly reels paused after auth/policy error", { platform, error });
      }
      posted.push({ platform, slot, ok: false, error });
    }
  }
  return { posted };
}

export type InsightsResult = { skipped: string } | { measured: number; unavailable: boolean };

/** Weekly: read reel insights from Graph with the existing Page token, store them, then store the week's learning. Never throws on permission errors. */
export async function reelInsightsTick(d: ReelsDeps): Promise<InsightsResult> {
  const { db, now } = d;
  if (!(await reelsOn(db))) return { skipped: "sys_reels off" };
  const last = await db.adsEvent.findFirst({ where: { name: REEL_EVENTS.learning }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last && now.getTime() - last.createdAt.getTime() < 6.5 * DAY) return { skipped: "ran this week" };
  const conn = await db.klySocialConnection.findUnique({ where: { id: "komendly" } });
  const key = d.env.ADS_TOKEN_KEY?.trim();
  const week = isoWeek(now);
  let measured = 0;
  let unavailable = false;
  if (conn?.pageTokenEnc && key) {
    const token = openSecret(conn.pageTokenEnc, key);
    const version = d.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
    const f = d.fetch ?? fetch;
    const rows = await db.klySocialPost.findMany({ where: { sourceKind: "reel", status: "posted", createdAt: { gte: new Date(now.getTime() - 35 * DAY), lte: new Date(now.getTime() - DAY) } }, select: { sourceRef: true, platform: true, postId: true }, take: 100 });
    for (const r of rows) {
      const slot = parseSlotPlatform(r.platform);
      if (!slot || !r.postId) continue;
      const out = slot.platform === "facebook" ? await fbReelInsights(f, version, r.postId, token) : await igReelInsights(f, version, r.postId, token);
      const none = Object.keys(out.metrics).length === 0;
      if (none) unavailable = true;
      if (none) log("info", "kly reels: insights unavailable", { reelId: r.sourceRef, platform: slot.platform, errors: out.errors.slice(0, 2) });
      await db.adsEvent.create({ data: { name: REEL_EVENTS.insights, props: { reelId: r.sourceRef, platform: slot.platform, metrics: out.metrics, errors: out.errors, unavailable: none } } }).catch(() => undefined);
      if (!none) measured++;
    }
  } else unavailable = true;
  const ready = (await db.adsEvent.findMany({ where: { name: REEL_EVENTS.ready }, orderBy: { createdAt: "desc" }, take: 300, select: { props: true } })).map(readyProps);
  const ins = await db.adsEvent.findMany({ where: { name: REEL_EVENTS.insights }, orderBy: { createdAt: "desc" }, take: 500, select: { props: true, createdAt: true } });
  const perfs = perfsFromEvents(ready, ins.map((e) => ({ ...(e.props as { reelId: string; platform: string; metrics?: Record<string, number> }), at: e.createdAt })));
  const md = learningMarkdown(week, perfs);
  await db.adsEvent.create({ data: { name: REEL_EVENTS.learning, props: { week, title: md.title, note: md.note, measured, unavailable } } });
  return { measured, unavailable };
}
