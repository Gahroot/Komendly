// Weekly Drop scheduler + "Your new ads are ready" email (engine side). Pure rules: src/lib/ads/weekly-drop.ts.
// Restart/replica safe: per (workspace, ISO week) advisory lock + AdsEvent weekly_drop_started {week} recorded in the
// same transaction as the AdRun, so two ticks or two replicas can never create two drops for the same week.
// Kill switch: ADS_WEEKLY_DROP=0 (no new runs). Email: needs AdsFeatureFlag lifecycle_email + LIFECYCLE_EMAIL_SECRET,
// honours unsubscribes and test addresses like the lifecycle loop; LIFECYCLE_DRY_RUN=1 logs instead of sending.
import type { Prisma } from "@prisma/client";
import { isTestEmail } from "../../../src/lib/ads/lifecycle/select";
import { renderLifecycleHtml, renderLifecycleText, unsubscribeHeaders, type LifecycleEmailInput } from "../../../src/lib/ads/lifecycle/template";
import { signEmailToken } from "../../../src/lib/ads/lifecycle/tokens";
import { withUtm } from "../../../src/lib/ads/lifecycle/studio-drop";
import {
  isAdDepartment, WEEKLY_EMAIL_KIND, WEEKLY_EXTRACTION_MAX_AGE_MS, WEEKLY_KIND, WEEKLY_MOTION, WEEKLY_RATIOS, WEEKLY_STARTED, WEEKLY_STATICS,
  weeklyAvoidList, weeklyAwarenessMix, weeklyDropDecision, weeklyDropEmailCopy, weeklyDropEnabled,
} from "../../../src/lib/ads/weekly-drop";
import { autopilotPlanPrompt, autopilotSettings, cleanFocus, upcomingMoments } from "../../../src/lib/ads/autopilot";
import type { Db } from "../db";
import { startAutopilotVideo } from "./autopilot-video";
import { errMsg, log } from "../log";
import { enqueue, priorityFor } from "../queue/queue";
import { siteKey } from "./brand-history";
import { WEEKLY_COST_CAP_MICROS, weeklyFirstTryMicros } from "./gift-policy";
import { bestAd, emailImg } from "../lifecycle/studio-drop";
import type { SendMail } from "../lifecycle/mail";

const MAX_PER_TICK = 20;
/** Hold the weekly email this long for the Autopilot video to finish (then send without it). */
const VIDEO_WAIT_MS = 3 * 3_600_000;
const LIFECYCLE_FLAG = "lifecycle_email";

export interface WeeklyDeps {
  db: Db;
  send: SendMail;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export type WeeklyStart = { created: true; runId: string; week: string } | { created: false; week: string; reason: string };

/** ISO weeks that already have a drop (or a recorded skip) for this workspace. */
async function weeksDone(db: Db, workspaceId: string): Promise<string[]> {
  const evs = await db.adsEvent.findMany({ where: { name: WEEKLY_STARTED, workspaceId }, select: { props: true } });
  return evs.flatMap((e) => {
    const w = (e.props as Record<string, unknown> | null)?.week;
    return typeof w === "string" ? [w] : [];
  });
}

/** Create this week's drop for one workspace (no-op if another tick/replica already did). `focus` = Autopilot focus, snapshotted on the run's event. */
export async function startWeeklyRun(db: Db, ws: { id: string; ownerId: string }, week: string, now: Date, focus: string | null = null): Promise<WeeklyStart> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly:${ws.id}:${week}`}))`;
    const prior = await tx.adsEvent.findFirst({ where: { name: WEEKLY_STARTED, workspaceId: ws.id, props: { path: ["week"], equals: week } }, select: { id: true } });
    if (prior) return { created: false as const, week, reason: "already_this_week" };
    // The brand they used most recently: latest own run with an extraction + brand profile.
    const src = await tx.adRun.findFirst({
      where: { workspaceId: ws.id, kind: { notIn: ["gift"] }, extraction: { not: { equals: null } } as Prisma.JsonNullableFilter<"AdRun">, brandProfileId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { url: true, extraction: true, brandProfileId: true, goal: true, resolvedGoal: true, createdAt: true },
    });
    // No brand yet: nothing recorded, retried next tick (the drop arrives once they've made their first run).
    if (!src?.brandProfileId) return { created: false as const, week, reason: "no_brand" };
    if (weeklyFirstTryMicros() > WEEKLY_COST_CAP_MICROS) {
      await tx.adsEvent.create({ data: { name: WEEKLY_STARTED, workspaceId: ws.id, userId: ws.ownerId, props: { week, skipped: "over cost cap" } } });
      return { created: false as const, week, reason: "over_cost_cap" };
    }
    const priorDrops = await tx.adRun.count({ where: { workspaceId: ws.id, kind: WEEKLY_KIND } });
    const fresh = now.getTime() - src.createdAt.getTime() <= WEEKLY_EXTRACTION_MAX_AGE_MS;
    const run = await tx.adRun.create({
      data: {
        workspaceId: ws.id,
        userId: ws.ownerId,
        brandProfileId: src.brandProfileId,
        url: src.url,
        goal: src.goal,
        resolvedGoal: src.resolvedGoal,
        kind: WEEKLY_KIND,
        isTrial: false,
        staticCount: WEEKLY_STATICS,
        motionCount: WEEKLY_MOTION,
        creditsReserved: 0,
        ratios: [...WEEKLY_RATIOS],
        awarenessMix: weeklyAwarenessMix(priorDrops),
        // Fresh extraction: straight to queued (the confirm sweeper enqueues the plan job). Stale: re-extract (auto-confirms).
        ...(fresh ? { status: "queued" as const, confirmedAt: now, extraction: src.extraction as Prisma.InputJsonValue } : { status: "extracting" as const }),
      },
      select: { id: true },
    });
    if (!fresh) await enqueue(tx, { type: "extract", runId: run.id, workspaceId: ws.id, priority: priorityFor(false), payload: { url: src.url } });
    await tx.adsEvent.create({ data: { name: WEEKLY_STARTED, workspaceId: ws.id, userId: ws.ownerId, runId: run.id, props: { week, runId: run.id, reextract: !fresh, ...(focus ? { focus } : {}) } } });
    return { created: true as const, runId: run.id, week };
  });
}

/** One scheduling pass over every Ad Department / Agency workspace with Autopilot on (missing settings row = on). */
export async function weeklyScheduleTick(deps: WeeklyDeps): Promise<WeeklyStart[]> {
  const env = deps.env ?? process.env;
  if (!weeklyDropEnabled(env)) return [];
  const now = deps.now?.() ?? new Date();
  const wss = await deps.db.adsWorkspace.findMany({
    where: { adsPlan: { in: ["ad_department", "agency"] }, subscriptionStatus: { in: ["active", "trialing", "past_due"] }, suspendedAt: null },
    orderBy: { id: "asc" },
    select: { id: true, ownerId: true, adsPlan: true, subscriptionStatus: true, suspendedAt: true, autopilot: { select: { enabled: true, focus: true, dayOfWeek: true, hour: true, timezone: true, includeVideo: true } } },
  });
  const out: WeeklyStart[] = [];
  for (const ws of wss) {
    if (out.filter((r) => r.created).length >= MAX_PER_TICK) break;
    const ap = autopilotSettings(ws.autopilot);
    // Time zone: Autopilot setting, else US Eastern.
    const d = weeklyDropDecision({ now, tz: ap.timezone, enabled: ap.enabled, subscribed: isAdDepartment(ws), weeksDone: await weeksDone(deps.db, ws.id), dayOfWeek: ap.dayOfWeek, hour: ap.hour });
    if (!d.due) continue;
    const r = await startWeeklyRun(deps.db, ws, d.week, now, ap.focus);
    if (r.created) {
      log("info", "weekly drop created", { workspaceId: ws.id, runId: r.runId, week: r.week, reason: d.reason });
      if (ap.includeVideo) {
        const v = await startAutopilotVideo(deps.db, ws, { week: r.week, focus: ap.focus, tz: ap.timezone, now }).catch((e: unknown) => {
          log("warn", "autopilot video not started", { workspaceId: ws.id, week: r.week, error: errMsg(e) });
          return null;
        });
        if (v?.created) log("info", "autopilot video queued", { workspaceId: ws.id, sessionId: v.sessionId, week: r.week });
      }
    }
    out.push(r);
  }
  return out;
}

/** The Autopilot focus snapshotted on this run's weekly_drop_started event (null = none). */
async function runFocus(db: Db, runId: string): Promise<string | null> {
  const ev = await db.adsEvent.findFirst({ where: { name: WEEKLY_STARTED, runId }, select: { props: true } });
  const f = (ev?.props as Record<string, unknown> | null)?.focus;
  return typeof f === "string" ? cleanFocus(f) : null;
}

/** Planner block for weekly runs: Autopilot focus + upcoming US dates, then earlier headlines/angles never to be repeated. */
export async function weeklyAvoidPrompt(db: Db, run: { id: string; workspaceId: string; url: string; createdAt: Date }): Promise<string> {
  const tz = (await db.adsAutopilot.findUnique({ where: { workspaceId: run.workspaceId }, select: { timezone: true } }))?.timezone ?? null;
  const steer = autopilotPlanPrompt({ focus: await runFocus(db, run.id), moments: upcomingMoments(run.createdAt, tz) });
  const avoid = await weeklyAvoidBlock(db, run);
  return [steer, avoid].filter(Boolean).join("\n\n");
}

async function weeklyAvoidBlock(db: Db, run: { id: string; workspaceId: string; url: string; createdAt: Date }): Promise<string> {
  const site = siteKey(run.url);
  const runs = await db.adRun.findMany({ where: { workspaceId: run.workspaceId, id: { not: run.id }, kind: { not: "gift" }, createdAt: { lt: run.createdAt } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, url: true } });
  const ids = runs.filter((r) => siteKey(r.url) === site).slice(0, 8).map((r) => r.id);
  if (!ids.length) return "";
  const ads = await db.ad.findMany({ where: { runId: { in: ids }, status: "ready" }, orderBy: { createdAt: "desc" }, take: 120, select: { headline: true, angle: true } });
  const avoid = weeklyAvoidList(ads);
  return avoid.length ? `WEEKLY DROP: this customer already has these ads (angle | headline). Every new ad must take a different buyer moment and angle, and never reuse or lightly reword these headlines:\n${avoid.map((a) => `- ${a}`).join("\n")}` : "";
}

export interface WeeklyEmailResult { runId: string; userId: string; status: "sent" | "dry_run" | "skipped" | "failed"; detail?: string }

/** Email each finished weekly run once (AdsEvent email_sent {kind: weekly_drop, runId} claimed before sending). */
export async function weeklyEmailTick(deps: WeeklyDeps): Promise<WeeklyEmailResult[]> {
  const env = deps.env ?? process.env;
  const flag = await deps.db.adsFeatureFlag.findUnique({ where: { key: LIFECYCLE_FLAG } });
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  if (!flag?.enabled || !secret) return [];
  const now = deps.now?.() ?? new Date();
  const dryRun = env.LIFECYCLE_DRY_RUN === "1";
  const base = (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
  const runs = await deps.db.adRun.findMany({
    where: { kind: WEEKLY_KIND, status: { in: ["completed", "partial"] }, completedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
    orderBy: { completedAt: "asc" },
    take: 100,
    select: { id: true, userId: true, workspaceId: true, completedAt: true, user: { select: { email: true, name: true } } },
  });
  const out: WeeklyEmailResult[] = [];
  for (const r of runs) {
    if (out.length >= MAX_PER_TICK) break;
    const sent = await deps.db.adsEvent.findFirst({ where: { name: "email_sent", runId: r.id, props: { path: ["kind"], equals: WEEKLY_EMAIL_KIND } }, select: { id: true } });
    if (sent) continue;
    const unsub = await deps.db.adsEvent.findFirst({ where: { name: "email_unsubscribed", userId: r.userId }, select: { id: true } });
    if (unsub || isTestEmail(r.user.email, env.LIFECYCLE_EXCLUDE)) continue;
    const ready = await deps.db.ad.count({ where: { runId: r.id, status: "ready" } });
    if (ready === 0) continue;
    const best = await bestAd(deps.db, r.id, now);
    // Only mention what was delivered: the focus this run used, the video only if this week's one is finished.
    const started = await deps.db.adsEvent.findFirst({ where: { name: WEEKLY_STARTED, runId: r.id }, select: { props: true } });
    const sp = (started?.props as Record<string, unknown> | null) ?? {};
    const week = typeof sp.week === "string" ? sp.week : null;
    const videoReady = week ? (await deps.db.studioRender.count({ where: { workspaceId: r.workspaceId, session: { autopilotWeek: week } } })) > 0 : false;
    // The weekly video is still being made: hold the email (up to VIDEO_WAIT_MS after the ads) so it can mention both.
    if (!videoReady && week && r.completedAt && now.getTime() - r.completedAt.getTime() < VIDEO_WAIT_MS) {
      const busy = await deps.db.studioSession.count({ where: { workspaceId: r.workspaceId, autopilotWeek: week, status: { in: ["queued", "working"] } } });
      if (busy > 0) continue;
    }
    const copy = weeklyDropEmailCopy({ firstName: r.user.name?.trim().split(/\s+/)[0] ?? null, brandName: best.brandName, ready, focus: typeof sp.focus === "string" ? sp.focus : null, videoReady });
    const path = withUtm(`/ads/runs/${r.id}`, WEEKLY_EMAIL_KIND);
    const href = env.LIFECYCLE_CLICK_TRACKING === "1" ? `${base}/api/ads/email-click/${signEmailToken({ p: "click", u: r.userId, k: WEEKLY_EMAIL_KIND, l: path }, secret)}` : `${base}${path}`;
    const unsubscribeUrl = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: r.userId }, secret)}`;
    const input: LifecycleEmailInput = {
      appUrl: base,
      subject: copy.subject,
      preheader: copy.preheader,
      paragraphs: copy.paragraphs,
      cta: { label: copy.ctaLabel, href },
      hero: best.assetId ? { src: emailImg(base, secret, best.assetId, best.expiresAt, now), alt: best.alt, href, caption: "", locked: false, position: "top" } : undefined,
      unsubscribeUrl,
    };
    if (dryRun) {
      log("info", "weekly drop email (dry run)", { runId: r.id, text: renderLifecycleText(input) });
      out.push({ runId: r.id, userId: r.userId, status: "dry_run" });
      continue;
    }
    const claim = await deps.db.adsEvent.create({ data: { name: "email_sent", userId: r.userId, workspaceId: r.workspaceId, runId: r.id, props: { kind: WEEKLY_EMAIL_KIND, subject: copy.subject, source: "fixed" } } });
    try {
      await deps.send({ to: r.user.email, subject: copy.subject, text: renderLifecycleText(input), html: renderLifecycleHtml(input), headers: unsubscribeHeaders(unsubscribeUrl) });
      out.push({ runId: r.id, userId: r.userId, status: "sent" });
    } catch (e) {
      await deps.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
      log("warn", "weekly drop email failed", { runId: r.id, error: errMsg(e) });
      out.push({ runId: r.id, userId: r.userId, status: "failed", detail: errMsg(e) });
    }
  }
  return out;
}

/** Periodic loop (every 10 min): schedule due drops, then email finished ones. Returns a stop function. */
export function startWeeklyLoop(deps: WeeklyDeps, everyMs = 10 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    weeklyScheduleTick(deps)
      .then((r) => r.length && log("info", "weekly drop tick", { created: r.filter((x) => x.created).length, total: r.length }))
      .then(() => weeklyEmailTick(deps))
      .then((r) => r.length && log("info", "weekly drop email tick", { sent: r.filter((x) => x.status === "sent").length, total: r.length }))
      .catch((e) => log("warn", "weekly drop tick failed", { error: errMsg(e) }))
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 90_000);
  const t = setInterval(tick, everyMs);
  return () => {
    clearTimeout(first);
    clearInterval(t);
  };
}
