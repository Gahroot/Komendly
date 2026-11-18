// Churn & failed-payment win-back loop (PRD #9, system winback). Every 60 min, single replica. Cases come from
// payment_failed / churned AdsEvents (webhooks); rules are pure (src/lib/growth/winback.ts). Failed payments: ~1h,
// day 3, day 7 with a signed one-click "update card" link (Billing Portal). Churn: day 3 (one-click reasons), day 14
// (their saved ads + fresh-ad link), day 30 (one-time 20% off via a signed come-back checkout; ads only).
// Claim (winback_email_sent) before sending; kill switch sys_winback each tick and before each send; heartbeat each tick.
// Copy: Codex Luna (WINBACK_TEXT_MODEL) with a deterministic fallback. Exempt from the lifecycle 24h cap, waits 6h after
// any other email.
import { z } from "zod";
import { recordSystemRun, systemEnabled, withSystemUtm } from "../../../src/lib/growth/systems";
import {
  buildWinbackPrompt, CHURN_REASONS, checkWinbackCopy, fallbackWinbackCopy, loadWinbackRows, recordWinbackPayment, signWinbackLink, WINBACK_COPY_SYSTEM, WINBACK_MAX_SUBJECT,
  WINBACK_SYSTEM, winbackBackfillDays, winbackCopyContext, winbackDue, winbackLinkFor, type ChurnReason, type WinbackCase, type WinbackCopyContext, type WinbackStep,
} from "../../../src/lib/growth/winback";
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

export interface WinbackDeps { db: Db; provider: AIProvider | null; send: SendMail; env?: NodeJS.ProcessEnv; now?: () => Date }
export interface WinbackTickResult { enabled: boolean; sent: number; recovered: number; due: number }

const appUrl = (env: NodeJS.ProcessEnv) => (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");

const CopySchema = z.object({ subject: z.string().min(3).max(WINBACK_MAX_SUBJECT), preheader: z.string().max(110), paragraphs: z.array(z.string().min(1).max(600)).min(2).max(4), ctaLabel: z.string().min(2).max(28) });

function codexLuna(p: AIProvider | null, env: NodeJS.ProcessEnv): AIProvider | null {
  if (!p || p.name !== "codex") return null;
  const model = env.WINBACK_TEXT_MODEL || "gpt-6.2-luna";
  const codexText = (p as { fallbackText?: AIProvider["text"] }).fallbackText ?? p.text.bind(p);
  return { name: "codex", text: (r: TextRequest) => codexText({ ...r, model }), image: (r) => p.image(r), health: () => p.health() };
}

export async function writeWinbackCopy(provider: AIProvider | null, ctx: WinbackCopyContext, env: NodeJS.ProcessEnv = process.env): Promise<{ copy: EmailCopy; source: "ai" | "fallback"; reason?: string }> {
  const fallback = fallbackWinbackCopy(ctx);
  const ai = codexLuna(provider, env);
  if (!ai) return { copy: fallback, source: "fallback", reason: "no codex provider" };
  try {
    const usage: UsageMeter[] = [];
    const out = await structured(ai, CopySchema, { system: WINBACK_COPY_SYSTEM, prompt: buildWinbackPrompt(ctx), reasoning: "low", signal: AbortSignal.timeout(90_000) }, usage);
    const bad = checkWinbackCopy(out, ctx);
    return bad ? { copy: fallback, source: "fallback", reason: bad } : { copy: out, source: "ai" };
  } catch (e) {
    return { copy: fallback, source: "fallback", reason: errMsg(e).slice(0, 200) };
  }
}

async function sendStep(d: WinbackDeps, c: WinbackCase, step: WinbackStep, user: { email: string; name: string | null }, now: Date, dryRun: boolean): Promise<"sent" | "dry_run" | "skipped" | "failed"> {
  const env = d.env ?? process.env;
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  const base = appUrl(env);
  const run = c.billing === "ads" && c.workspaceId
    ? await d.db.adRun.findFirst({ where: { workspaceId: c.workspaceId, kind: { not: "gift" }, completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { id: true } })
    : null;
  const brand = await brandContext(d.db, run?.id ?? null);
  const ctx = winbackCopyContext(c, step, { firstName: user.name?.trim().split(/\s+/)[0] ?? null, brandName: brand.brandName, readyAdCount: brand.headlines.length, headlines: brand.headlines });
  const { copy, source, reason } = await writeWinbackCopy(d.provider, ctx, env);
  const utm = (url: string, content: string) => withSystemUtm(url, WINBACK_SYSTEM, { campaign: step, medium: "email", content });
  const link = (a: "card" | "reason" | "resume", r?: ChurnReason) => utm(`${base}/api/winback/go?t=${signWinbackLink(winbackLinkFor(c, step, a, now, r), secret)}`, r ? `reason_${r}` : a);
  const home = c.billing === "ads" ? "/ads/app" : "/dashboard";
  const cta = c.kind === "failed" ? link("card") : step === "c3_d30" ? link("resume") : utm(`${base}${home}`, "cta");
  const expSec = Math.floor(now.getTime() / 1000) + IMG_TOKEN_TTL_DAYS * 86_400;
  const imgs = brand.thumbs
    .filter((t) => t.assetId && (!t.expiresAt || t.expiresAt > now))
    .map((t) => ({ src: `${base}/api/ads/email-img/${signEmailToken({ p: "img", a: t.assetId, e: t.expiresAt ? Math.min(expSec, Math.floor(t.expiresAt.getTime() / 1000)) : expSec }, secret)}`, alt: t.alt }));
  const showAds = (step === "f2_d3" || step === "c2_d14") && imgs.length > 0;
  const unsubscribeUrl = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: c.userId }, secret)}`;
  const input: LifecycleEmailInput = {
    appUrl: base,
    subject: copy.subject,
    preheader: copy.preheader,
    paragraphs: copy.paragraphs,
    cta: { label: copy.ctaLabel, href: cta },
    thumbnails: showAds ? imgs.slice(0, 3) : [],
    ...(step === "c1_d3" ? { blocks: [{ title: "What didn't work? (one click)", items: (Object.keys(CHURN_REASONS) as ChurnReason[]).map((r) => ({ text: "", linkLabel: CHURN_REASONS[r], href: link("reason", r) })) }] } : {}),
    ...(showAds && run ? { ps: { text: "Your ads are saved in your account.", linkLabel: "See your ads", href: utm(`${base}/ads/runs/${run.id}`, "ads") } } : {}),
    unsubscribeUrl,
  };
  if (dryRun) {
    log("info", "winback email (dry run)", { userId: c.userId, step, source, reason, text: renderLifecycleText(input) });
    return "dry_run";
  }
  const dup = await d.db.adsEvent.findFirst({ where: { name: "winback_email_sent", AND: [{ props: { path: ["caseKey"], equals: c.key } }, { props: { path: ["step"], equals: step } }] }, select: { id: true } });
  if (dup) return "skipped";
  const claim = await d.db.adsEvent.create({ data: { name: "winback_email_sent", userId: c.userId, workspaceId: c.workspaceId, props: { system: WINBACK_SYSTEM, kind: c.kind, billing: c.billing, step, caseKey: c.key, discount: ctx.discount, subject: copy.subject, source } } });
  try {
    await d.send({ to: user.email, subject: copy.subject, text: renderLifecycleText(input), html: renderLifecycleHtml(input), headers: unsubscribeHeaders(unsubscribeUrl) });
    log("info", "winback email sent", { userId: c.userId, step, source, reason });
    return "sent";
  } catch (e) {
    await d.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
    log("warn", "winback email failed", { userId: c.userId, step, error: errMsg(e) });
    return "failed";
  }
}

export async function winbackTick(d: WinbackDeps): Promise<WinbackTickResult> {
  const env = d.env ?? process.env;
  const now = (d.now ?? (() => new Date()))();
  const out: WinbackTickResult = { enabled: false, sent: 0, recovered: 0, due: 0 };
  if (!(await systemEnabled(d.db, WINBACK_SYSTEM))) return out;
  out.enabled = true;
  const errors: string[] = [];
  try {
    if (!env.LIFECYCLE_EMAIL_SECRET) throw new Error("LIFECYCLE_EMAIL_SECRET unset");
    const days = winbackBackfillDays(env.WINBACK_BACKFILL_DAYS);
    for (const row of await loadWinbackRows(d.db, new Date(now.getTime() - days * 86_400_000))) {
      const c = row.c;
      // Fallback attribution for churn (webhooks record it first): resolved after a winback email.
      if (c.kind === "churn" && row.state.resolved && row.state.sent.length && !row.recovered) {
        const r = await recordWinbackPayment(d.db, { userId: c.userId, workspaceId: c.workspaceId, billing: c.billing, ref: "loop", paidAt: now });
        if (r.winback) out.recovered++;
      }
      const step = winbackDue(row.state, now, days);
      if (!step) continue;
      out.due++;
      if (out.sent >= MAX_PER_TICK) continue;
      if (!(await systemEnabled(d.db, WINBACK_SYSTEM))) break;
      const r = await sendStep(d, c, step, row.user, now, env.WINBACK_DRY_RUN === "1");
      if (r === "sent") out.sent++;
      if (r === "failed") errors.push(`send ${c.key}/${step} failed`);
    }
  } catch (e) {
    errors.push(errMsg(e));
  }
  await recordSystemRun(d.db, WINBACK_SYSTEM, { ok: errors.length === 0, outputs: out.sent + out.recovered, error: errors.join("; ") || null }, now);
  if (out.sent || out.recovered || errors.length) log(errors.length ? "warn" : "info", "winback tick", { ...out, errors });
  return out;
}

export function startWinbackLoop(deps: WinbackDeps, everyMs = 60 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    winbackTick(deps)
      .catch((e) => log("warn", "winback tick failed", { error: errMsg(e) }))
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 120_000);
  const t = setInterval(tick, everyMs);
  return () => {
    clearTimeout(first);
    clearInterval(t);
  };
}
