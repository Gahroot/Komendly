// Competitor ad watch loop (growth system ad_watch). Hourly tick, single replica; acts from Monday 13:00 UTC.
// For each confirmed, not-opted-out subscriber (AdsEvent rows, see src/lib/growth/ad-watch.ts) once per ISO week:
// scan their rival Pages (scanPage, cached 24h), pick up to 3 ads started in the last week and never emailed before,
// skip the week when nothing is new (ad_watch_skipped), else precheck -> optional AI review gate -> claim
// (ad_watch_sent) -> send. Kill switch sys_ad_watch each tick and before each send; heartbeat every tick.
// Review: deterministic precheck, then the AI gate (always on; benchmark kept it) with the rival-ad data as facts.
// Rejected -> one revision rebuilt from the template with fewer details ("minimal") -> rejected again = skip the week.
import { renderLifecycleHtml, renderLifecycleText, unsubscribeHeaders } from "../../../src/lib/ads/lifecycle/template";
import {
  activeSubscriptions, AD_WATCH_EVENT_NAMES, AD_WATCH_EVENTS, AD_WATCH_EXTRA_RULES, AD_WATCH_SYSTEM, adWatchDueWeek, adWatchUnsubscribeUrl, buildWeeklyEmail, pickNewAds, weekSendAt,
  type AdlibPageScan, type AdWatchSub,
} from "../../../src/lib/growth/ad-watch";
import { precheck, type ReviewItem, type ReviewVerdict } from "../../../src/lib/growth/review-gate";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import type { AIProvider } from "../providers/types";
import { scanPage } from "./adlib-scan";
import { gate } from "./review-gate";

const MAX_PER_TICK = 50;

export type ScanPage = (db: Db, pageIdOrUrl: string) => Promise<AdlibPageScan | null>;
export interface AdWatchDeps { db: Db; provider: Pick<AIProvider, "text"> | null; send: SendMail; scan?: ScanPage; env?: NodeJS.ProcessEnv; now?: () => Date }
export interface AdWatchTickResult { enabled: boolean; due: number; sent: number; skipped: number; errors: string[] }

const appUrl = (env: NodeJS.ProcessEnv) => (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");

/**
 * The single AI review step for ad watch emails: shared review gate (fails closed; no provider = not approved), with
 * one revision = `revise()` (the minimal rebuild). Returns the approved content or null.
 */
export async function reviewAdWatchEmail(
  d: Pick<AdWatchDeps, "db" | "provider">,
  item: ReviewItem,
  revise?: () => string | null,
): Promise<{ approved: boolean; content: string | null; verdict: ReviewVerdict }> {
  if (!d.provider) return { approved: false, content: null, verdict: { approved: false, reasons: ["reviewer error: no AI provider"] } };
  return gate(d.db, d.provider, item, { revise: revise ? async () => revise() : undefined });
}

type Outcome = "sent" | "skipped" | "retry";

async function closeWeek(d: AdWatchDeps, sub: AdWatchSub, week: string, props: Record<string, unknown>): Promise<void> {
  await d.db.adsEvent.create({ data: { name: AD_WATCH_EVENTS.skipped, userId: sub.userId, props: { system: AD_WATCH_SYSTEM, subId: sub.subId, email: sub.email, week, ...props } as object } });
}

async function weekTaken(db: Db, subId: string, week: string): Promise<boolean> {
  const hit = await db.adsEvent.findFirst({ where: { name: { in: [AD_WATCH_EVENTS.sent, AD_WATCH_EVENTS.skipped] }, AND: [{ props: { path: ["subId"], equals: subId } }, { props: { path: ["week"], equals: week } }] }, select: { id: true } });
  return Boolean(hit);
}

async function optedOutNow(db: Db, sub: AdWatchSub): Promise<boolean> {
  const hit = await db.adsEvent.findFirst({ where: { name: AD_WATCH_EVENTS.unsubscribed, createdAt: { gte: sub.subscribedAt }, props: { path: ["email"], equals: sub.email } }, select: { id: true } });
  return Boolean(hit);
}

async function runSub(d: AdWatchDeps, scan: ScanPage, cache: Map<string, Promise<AdlibPageScan | null>>, sub: AdWatchSub, week: string, now: Date): Promise<Outcome> {
  const env = d.env ?? process.env;
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  if (!secret) throw new Error("LIFECYCLE_EMAIL_SECRET unset");
  const scans: AdlibPageScan[] = [];
  let failed = 0;
  for (const page of sub.pages) {
    if (!cache.has(page)) cache.set(page, scan(d.db, page).catch((e) => { log("warn", "ad watch scan failed", { page, error: errMsg(e) }); return null; }));
    const s = await cache.get(page)!;
    if (s) scans.push(s);
    else failed++;
  }
  if (!scans.length && failed) return "retry"; // scanner down: keep the week open, try next tick
  const ads = pickNewAds(scans, sub.seen, now);
  if (!ads.length) {
    await closeWeek(d, sub, week, { reason: "nothing_new", pages: sub.pages.length, scanned: scans.length });
    return "skipped";
  }
  const base = appUrl(env);
  const unsubscribeUrl = adWatchUnsubscribeUrl(base, sub.subId, secret);
  const itemKey = `watch:${sub.subId}:${week}`;
  const build = (detail: "full" | "minimal") => {
    const e = buildWeeklyEmail({ base, sub, ads, week, unsubscribeUrl, postalAddress: env.OUTBOUND_POSTAL_ADDRESS, detail });
    const text = renderLifecycleText(e.input);
    return { ...e, text, content: `Subject: ${e.subject}\n\n${text}`, pre: precheck({ system: AD_WATCH_SYSTEM, kind: "email", itemKey, content: e.ownText }) };
  };
  const full = build("full");
  const minimal = build("minimal");
  // Precheck (our own words; competitor quotes masked). A full email failing it goes straight to the minimal one.
  const first = full.pre.length ? minimal : full;
  if (first.pre.length) {
    await closeWeek(d, sub, week, { reason: "precheck", reasons: first.pre });
    return "skipped";
  }
  const review = await reviewAdWatchEmail(
    d,
    { system: AD_WATCH_SYSTEM, kind: "email", itemKey, content: first.content, facts: full.facts, extraRules: AD_WATCH_EXTRA_RULES },
    first === full ? () => minimal.content : undefined,
  );
  if (!review.approved || !review.content) {
    if (review.verdict.reasons.some((r) => r.startsWith("reviewer error"))) return "retry";
    await closeWeek(d, sub, week, { reason: "review_gate", reasons: review.verdict.reasons.slice(0, 5) });
    return "skipped";
  }
  const email = review.content === full.content ? full : minimal;
  const text = email.text;
  if (!(await systemEnabled(d.db, AD_WATCH_SYSTEM)) || (await optedOutNow(d.db, sub)) || (await weekTaken(d.db, sub.subId, week))) return "skipped";
  const claim = await d.db.adsEvent.create({
    data: { name: AD_WATCH_EVENTS.sent, userId: sub.userId, props: { system: AD_WATCH_SYSTEM, subId: sub.subId, email: sub.email, week, adIds: ads.map((a) => a.adArchiveId), pageIds: [...new Set(ads.map((a) => a.pageId))], subject: email.subject, detail: email === full ? "full" : "minimal" } },
  });
  try {
    await d.send({ to: sub.email, subject: email.subject, text, html: renderLifecycleHtml(email.input), headers: unsubscribeHeaders(unsubscribeUrl) });
    return "sent";
  } catch (e) {
    await d.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
    throw e;
  }
}

export async function adWatchTick(d: AdWatchDeps): Promise<AdWatchTickResult> {
  const now = (d.now ?? (() => new Date()))();
  const out: AdWatchTickResult = { enabled: false, due: 0, sent: 0, skipped: 0, errors: [] };
  if (!(await systemEnabled(d.db, AD_WATCH_SYSTEM))) return out;
  out.enabled = true;
  try {
    if (now >= weekSendAt(now)) {
      const events = await d.db.adsEvent.findMany({ where: { name: { in: AD_WATCH_EVENT_NAMES } }, select: { id: true, name: true, createdAt: true, userId: true, props: true }, orderBy: { createdAt: "asc" } });
      const due = activeSubscriptions(events).flatMap((sub) => {
        const week = adWatchDueWeek(sub, now);
        return week ? [{ sub, week }] : [];
      });
      out.due = due.length;
      const scan: ScanPage = d.scan ?? scanPage;
      const cache = new Map<string, Promise<AdlibPageScan | null>>();
      for (const { sub, week } of due.slice(0, MAX_PER_TICK)) {
        if (!(await systemEnabled(d.db, AD_WATCH_SYSTEM))) break;
        try {
          const r = await runSub(d, scan, cache, sub, week, now);
          if (r === "sent") out.sent++;
          if (r === "skipped") out.skipped++;
          if (r === "retry") out.errors.push(`${sub.subId}: scanner/reviewer unavailable`);
        } catch (e) {
          out.errors.push(`${sub.subId}: ${errMsg(e)}`);
        }
      }
    }
  } catch (e) {
    out.errors.push(errMsg(e));
  }
  await recordSystemRun(d.db, AD_WATCH_SYSTEM, { ok: out.errors.length === 0, outputs: out.sent, error: out.errors.join("; ").slice(0, 500) || null }, now);
  if (out.sent || out.skipped || out.errors.length) log(out.errors.length ? "warn" : "info", "ad watch tick", { ...out });
  return out;
}

export function startAdWatchLoop(deps: AdWatchDeps, everyMs = 60 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    adWatchTick(deps)
      .catch((e) => log("warn", "ad watch tick failed", { error: errMsg(e) }))
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 150_000);
  const t = setInterval(tick, everyMs);
  return () => {
    clearTimeout(first);
    clearInterval(t);
  };
}
