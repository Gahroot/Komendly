// Abandoned-checkout recovery loop (PRD #8, system checkout_recovery). Every 15 min, single replica:
//  1. Stripe sync (hourly, read-only REST): unpaid sessions of the last RECOVERY_BACKFILL_DAYS (default 30) become
//     checkout_started rows (testimonial Launch Kit checkouts were never recorded; also catches missed webhooks).
//  2. One sequence per user (pure rules in src/lib/growth/checkout-recovery.ts): ~1h, 24h, 72h, ~6.5d; stops on any
//     purchase, unsubscribe, reply or test address. The final step carries a one-time 20% off (applied by the resume link).
//  3. Claim (recovery_email_sent row) before sending; a failed send removes the claim. Kill switch sys_checkout_recovery
//     checked every tick and before each send; heartbeat (recordSystemRun) every enabled tick.
// Copy: Codex (Luna, RECOVERY_TEXT_MODEL) with a deterministic fallback. Frequency: the recovery steps are exempt from
// the lifecycle 24h cap (like last_chance: they answer the user's own action) but wait 6h after any lifecycle email.
import { z } from "zod";
import { recordSystemRun, systemEnabled, withSystemUtm } from "../../../src/lib/growth/systems";
import {
  backfillDays, buildRecoveryPrompt, checkoutFromSession, checkRecoveryCopy, dueStep, fallbackRecoveryCopy, isFinalStep, itemInfo,
  loadRecoveryRows, recordCheckoutRecovered, recoveryCopyContext, RECOVERY, RECOVERY_COPY_SYSTEM, RECOVERY_MAX_SUBJECT, RECOVERY_SYSTEM, resumePayloadFor, signResumeToken,
  type RecoveryCopyContext, type RecoveryStep, type SessionLike, type StartedCheckout,
} from "../../../src/lib/growth/checkout-recovery";
import type { EmailCopy } from "../../../src/lib/ads/lifecycle/copy";
import { renderLifecycleHtml, renderLifecycleText, unsubscribeHeaders, type LifecycleEmailInput } from "../../../src/lib/ads/lifecycle/template";
import { IMG_TOKEN_TTL_DAYS, signEmailToken } from "../../../src/lib/ads/lifecycle/tokens";
import type { Db } from "../db";
import { brandContext } from "../lifecycle/send";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import { structured } from "../providers/structured";
import type { AIProvider, TextRequest, UsageMeter } from "../providers/types";

const MAX_PER_TICK = 20;
const STRIPE_SYNC_MS = 60 * 60_000;

export interface RecoveryDeps {
  db: Db;
  provider: AIProvider | null;
  send: SendMail;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

export interface RecoveryTickResult { enabled: boolean; sent: number; recovered: number; synced: number; due: number }

function appUrl(env: NodeJS.ProcessEnv): string {
  return (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
}

// ---------- Stripe sync (read-only) ----------

let lastSyncAt = 0;

/** Unpaid Stripe checkout sessions since `since` -> checkout_started rows (deduped by session id). Returns rows added. */
export async function syncStripeCheckouts(d: RecoveryDeps, since: Date, now: Date): Promise<number> {
  const env = d.env ?? process.env;
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return 0;
  const f = d.fetchImpl ?? fetch;
  let added = 0;
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ limit: "100", "created[gte]": String(Math.floor(since.getTime() / 1000)) });
    if (after) q.set("starting_after", after);
    const res = await f(`https://api.stripe.com/v1/checkout/sessions?${q}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`stripe sessions list ${res.status}`);
    const body = (await res.json()) as { data?: SessionLike[]; has_more?: boolean };
    const list = body.data ?? [];
    for (const x of list) {
      // Still open and young: not abandoned yet (the route recorded the start anyway).
      if (x.status === "open" && now.getTime() - x.created * 1000 < RECOVERY.abandonAfterMs) continue;
      const c = checkoutFromSession(x);
      if (!c) continue;
      if (await d.db.adsEvent.findFirst({ where: { name: "checkout_started", props: { path: ["sessionId"], equals: x.id } }, select: { id: true } })) continue;
      let userId: string | null = null;
      let workspaceId: string | null = null;
      if (c.billing === "ads" && c.workspaceId) {
        const ws = await d.db.adsWorkspace.findUnique({ where: { id: c.workspaceId }, select: { id: true, ownerId: true } });
        if (ws) [userId, workspaceId] = [ws.ownerId, ws.id];
        // Older route rows have no session id: same workspace within 5 min = the same checkout.
        const near = workspaceId && (await d.db.adsEvent.findFirst({ where: { name: "checkout_started", workspaceId, createdAt: { gte: new Date(c.startedAt.getTime() - 300_000), lte: new Date(c.startedAt.getTime() + 300_000) } }, select: { id: true } }));
        if (near) continue;
      } else {
        const u = c.userId ? await d.db.user.findUnique({ where: { id: c.userId }, select: { id: true } }) : c.email ? await d.db.user.findUnique({ where: { email: c.email.toLowerCase() }, select: { id: true } }) : null;
        userId = u?.id ?? null;
      }
      if (!userId) continue;
      await d.db.adsEvent.create({
        data: { name: "checkout_started", userId, workspaceId, createdAt: c.startedAt, props: { kind: c.item.kind, key: c.item.key, ...(c.item.interval ? { interval: c.item.interval } : {}), billing: c.billing, sessionId: x.id, source: "stripe_sync", amountCents: c.amountCents } },
      });
      added++;
    }
    if (!body.has_more || !list.length) break;
    after = list[list.length - 1]?.id ?? null;
  }
  return added;
}

// ---------- copy (Codex Luna only) ----------

const RecoveryCopySchema = z.object({
  subject: z.string().min(3).max(RECOVERY_MAX_SUBJECT),
  preheader: z.string().max(110),
  paragraphs: z.array(z.string().min(1).max(600)).min(2).max(4),
  ctaLabel: z.string().min(2).max(28),
});

/** Codex text only (never MiMo / paid OpenAI), on the small fast model. null = no AI (fallback copy). */
function codexLuna(p: AIProvider | null, env: NodeJS.ProcessEnv): AIProvider | null {
  if (!p || p.name !== "codex") return null;
  const model = env.RECOVERY_TEXT_MODEL || "gpt-6-luna";
  const codexText = (p as { fallbackText?: AIProvider["text"] }).fallbackText ?? p.text.bind(p);
  return { name: "codex", text: (r: TextRequest) => codexText({ ...r, model }), image: (r) => p.image(r), health: () => p.health() };
}

export async function writeRecoveryCopy(provider: AIProvider | null, ctx: RecoveryCopyContext, env: NodeJS.ProcessEnv = process.env): Promise<{ copy: EmailCopy; source: "ai" | "fallback"; reason?: string }> {
  const fallback = fallbackRecoveryCopy(ctx);
  const ai = codexLuna(provider, env);
  if (!ai) return { copy: fallback, source: "fallback", reason: "no codex provider" };
  try {
    const usage: UsageMeter[] = [];
    const out = await structured(ai, RecoveryCopySchema, { system: RECOVERY_COPY_SYSTEM, prompt: buildRecoveryPrompt(ctx), reasoning: "low", signal: AbortSignal.timeout(90_000) }, usage);
    const bad = checkRecoveryCopy(out, ctx);
    return bad ? { copy: fallback, source: "fallback", reason: bad } : { copy: out, source: "ai" };
  } catch (e) {
    return { copy: fallback, source: "fallback", reason: errMsg(e).slice(0, 200) };
  }
}

// ---------- one email ----------

async function sendStep(d: RecoveryDeps, c: StartedCheckout, step: RecoveryStep, user: { email: string; name: string | null }, now: Date, dryRun: boolean): Promise<"sent" | "dry_run" | "skipped" | "failed"> {
  const env = d.env ?? process.env;
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  const base = appUrl(env);
  // Their own results (ads billing): the latest finished run's brand + ready ads.
  const run = c.billing === "ads" && c.workspaceId
    ? await d.db.adRun.findFirst({ where: { workspaceId: c.workspaceId, kind: { not: "gift" }, completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { id: true } })
    : null;
  const brand = await brandContext(d.db, run?.id ?? null);
  const ctx = recoveryCopyContext(c, step, { firstName: user.name?.trim().split(/\s+/)[0] ?? null, brandName: brand.brandName, readyAdCount: brand.headlines.length, headlines: brand.headlines, now });
  const { copy, source, reason } = await writeRecoveryCopy(d.provider, ctx, env);
  const utm = (url: string, content?: string) => withSystemUtm(url, RECOVERY_SYSTEM, { campaign: step, medium: "email", ...(content ? { content } : {}) });
  const resume = utm(`${base}/api/recovery/resume?t=${signResumeToken(resumePayloadFor(c, step, now), secret)}`, "cta");
  const expSec = Math.floor(now.getTime() / 1000) + IMG_TOKEN_TTL_DAYS * 86_400;
  const imgs = brand.thumbs
    .filter((t) => t.assetId && (!t.expiresAt || t.expiresAt > now))
    .map((t) => ({ src: `${base}/api/ads/email-img/${signEmailToken({ p: "img", a: t.assetId, e: t.expiresAt ? Math.min(expSec, Math.floor(t.expiresAt.getTime() / 1000)) : expSec }, secret)}`, alt: t.alt }));
  // Value first: their own ads on the first and third notes (none on the discount note).
  const showAds = (step === "r1_1h" || step === "r3_72h") && imgs.length > 0;
  const unsubscribeUrl = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: c.userId }, secret)}`;
  const input: LifecycleEmailInput = {
    appUrl: base,
    subject: copy.subject,
    preheader: copy.preheader,
    paragraphs: copy.paragraphs,
    cta: { label: copy.ctaLabel, href: resume },
    thumbnails: showAds ? imgs.slice(0, 3) : [],
    ...(showAds && run ? { ps: { text: "Your ads are saved in your account.", linkLabel: "See all your ads", href: utm(`${base}/ads/runs/${run.id}`, "ads") } } : {}),
    unsubscribeUrl,
  };
  if (dryRun) {
    log("info", "recovery email (dry run)", { userId: c.userId, step, source, reason, text: renderLifecycleText(input) });
    return "dry_run";
  }
  // Idempotency: one row per checkout + step; claim before sending.
  const dup = await d.db.adsEvent.findFirst({ where: { name: "recovery_email_sent", AND: [{ props: { path: ["checkoutKey"], equals: c.key } }, { props: { path: ["step"], equals: step } }] }, select: { id: true } });
  if (dup) return "skipped";
  const info = itemInfo(c.item);
  const claim = await d.db.adsEvent.create({
    data: { name: "recovery_email_sent", userId: c.userId, workspaceId: c.workspaceId, props: { system: RECOVERY_SYSTEM, billing: c.billing, step, checkoutKey: c.key, item: `${c.item.kind}:${c.item.key}`, itemName: info?.name ?? null, discount: isFinalStep(step) && Boolean(ctx.discounted), subject: copy.subject, source } },
  });
  try {
    await d.send({ to: user.email, subject: copy.subject, text: renderLifecycleText(input), html: renderLifecycleHtml(input), headers: unsubscribeHeaders(unsubscribeUrl) });
    log("info", "recovery email sent", { userId: c.userId, step, source, reason });
    return "sent";
  } catch (e) {
    await d.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
    log("warn", "recovery email failed", { userId: c.userId, step, error: errMsg(e) });
    return "failed";
  }
}

// ---------- tick ----------

export async function checkoutRecoveryTick(d: RecoveryDeps): Promise<RecoveryTickResult> {
  const env = d.env ?? process.env;
  const now = (d.now ?? (() => new Date()))();
  const out: RecoveryTickResult = { enabled: false, sent: 0, recovered: 0, synced: 0, due: 0 };
  if (!(await systemEnabled(d.db, RECOVERY_SYSTEM))) return out; // off: no cycle, no heartbeat
  out.enabled = true;
  const errors: string[] = [];
  try {
    if (!env.LIFECYCLE_EMAIL_SECRET) throw new Error("LIFECYCLE_EMAIL_SECRET unset");
    const days = backfillDays(env.RECOVERY_BACKFILL_DAYS);
    const since = new Date(now.getTime() - days * 86_400_000);
    if (now.getTime() - lastSyncAt >= STRIPE_SYNC_MS) {
      try {
        out.synced = await syncStripeCheckouts(d, since, now);
        lastSyncAt = now.getTime();
      } catch (e) {
        errors.push(`stripe sync: ${errMsg(e)}`);
      }
    }
    for (const row of await loadRecoveryRows(d.db, since)) {
      const c = row.checkout;
      const state = row.state;
      // Fallback attribution (the webhooks record it first): a purchase after a recovery email.
      if (row.paidAt && state.sent.length && !row.recovered) {
        const k = await recordCheckoutRecovered(d.db, { userId: c.userId, workspaceId: c.workspaceId, billing: c.billing, ref: "loop", paidAt: row.paidAt });
        if (k) out.recovered++;
      }
      const step = dueStep(state, now, days);
      if (!step) continue;
      out.due++;
      if (out.sent >= MAX_PER_TICK) continue;
      if (!(await systemEnabled(d.db, RECOVERY_SYSTEM))) break; // switched off mid-tick
      const r = await sendStep(d, c, step, row.user, now, env.RECOVERY_DRY_RUN === "1");
      if (r === "sent") out.sent++;
      if (r === "failed") errors.push(`send ${c.key}/${step} failed`);
    }
  } catch (e) {
    errors.push(errMsg(e));
  }
  await recordSystemRun(d.db, RECOVERY_SYSTEM, { ok: errors.length === 0, outputs: out.sent + out.recovered, error: errors.join("; ") || null }, now);
  if (out.sent || out.recovered || out.synced || errors.length) log(errors.length ? "warn" : "info", "checkout recovery tick", { ...out, errors });
  return out;
}

/** Starts the 15-min loop; returns a stop function. */
export function startCheckoutRecoveryLoop(deps: RecoveryDeps, everyMs = 15 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    checkoutRecoveryTick(deps)
      .catch((e) => log("warn", "checkout recovery tick failed", { error: errMsg(e) }))
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

/** Test hook: forget the last Stripe sync time. */
export function resetRecoverySync(): void {
  lastSyncAt = 0;
}
