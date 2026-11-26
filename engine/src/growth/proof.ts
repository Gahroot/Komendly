// Proof, activation and retention loop (systems activation, proof, cancel_save, guarantee_watch). Every 15 min, single replica.
// Each system has its own kill switch (AdsFeatureFlag sys_<key>, default OFF) and heartbeat. Rules are pure (src/lib/growth/proof.ts);
// copy is fixed (Nolan), filled only with measured data, so nothing here is AI-written. Claim (AdsEvent) before every send,
// release the claim if the send fails. Test accounts and unsubscribed owners are skipped (except the alert to Nolan).
import { isTestEmail } from "../../../src/lib/ads/lifecycle/select";
import { founderFrom } from "../../../src/lib/ads/lifecycle/founder";
import { unsubscribeHeaders } from "../../../src/lib/ads/lifecycle/template";
import { signEmailToken } from "../../../src/lib/ads/lifecycle/tokens";
import { shareUrl } from "../../../src/lib/ads/referral-code";
import { recordSystemRun, systemEnabled, type SystemKey } from "../../../src/lib/growth/systems";
import {
  breachAlert, cancelSaveDue, cancelSaveNote, firstWinDue, firstWinNote, guaranteeBreach, measureWindow, nudgeDue, nudgeNote, NOLAN_ALERT_EMAIL,
  proofDayDue, proofWindow, resultsNote, signConsent, type Measured, type Note,
} from "../../../src/lib/growth/proof";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";

const MAX_PER_TICK = 20;
const TEAM_PLANS = ["autopilot", "agency"] as const;
const ACTIVE_STATUSES = ["active", "trialing", "past_due"];
const DAY = 86_400_000;
export interface ProofDeps { db: Db; send: SendMail; env?: NodeJS.ProcessEnv; now?: () => Date }
export interface ProofTickResult { sent: Record<string, number>; errors: string[] }

const appUrl = (env: NodeJS.ProcessEnv) => (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
const NAMES = ["team_hired", "live_nudge_sent", "first_win_email_sent", "proof_report_sent", "billing_portal_opened", "cancel_intent", "cancel_save_email_sent", "guarantee_breach_alerted", "email_unsubscribed", "payment_failed"];

interface Ctx {
  ws: { id: string; name: string; ownerId: string; adsPlan: string; subscriptionStatus: string; suspendedAt: Date | null };
  user: { id: string; email: string; name: string | null };
  events: Array<{ id: string; name: string; props: unknown; createdAt: Date }>;
  paidAt: Date | null; metaAt: Date | null; budgetAt: Date | null; liveAt: Date | null;
  currency: string;
}
const prop = (p: unknown, k: string): unknown => (p && typeof p === "object" ? (p as Record<string, unknown>)[k] : undefined);

export async function proofTick(d: ProofDeps): Promise<ProofTickResult> {
  const env = d.env ?? process.env;
  const now = (d.now ?? (() => new Date()))();
  const out: ProofTickResult = { sent: {}, errors: [] };
  const on = new Map<SystemKey, boolean>();
  for (const k of ["activation", "proof", "cancel_save", "guarantee_watch"] as SystemKey[]) on.set(k, await systemEnabled(d.db, k));
  if (![...on.values()].some(Boolean)) return out;
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  const base = appUrl(env);
  const dry = env.PROOF_DRY_RUN === "1";
  let budget = MAX_PER_TICK;
  const counted = (k: SystemKey) => (out.sent[k] = (out.sent[k] ?? 0) + 1);
  const errs: Partial<Record<SystemKey, string[]>> = {};

  try {
    const wss = await d.db.adsWorkspace.findMany({ where: { adsPlan: { in: [...TEAM_PLANS, "ad_department"] }, subscriptionStatus: { in: ACTIVE_STATUSES }, suspendedAt: null }, take: 500, select: { id: true, name: true, ownerId: true, adsPlan: true, subscriptionStatus: true, suspendedAt: true } });
    if (!wss.length) return await finish();
    const ids = wss.map((w) => w.id);
    const [users, events, conns, mandates, brands] = await Promise.all([
      d.db.user.findMany({ where: { id: { in: wss.map((w) => w.ownerId) } }, select: { id: true, email: true, name: true } }),
      d.db.adsEvent.findMany({ where: { workspaceId: { in: ids }, name: { in: NAMES } }, select: { id: true, name: true, props: true, createdAt: true, workspaceId: true, userId: true } }),
      d.db.metaConnection.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true, createdAt: true } }),
      d.db.marketingMandate.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true, authorizedAt: true, launchedAt: true, currency: true } }),
      d.db.brandProfile.findMany({ where: { workspaceId: { in: ids }, name: { not: null } }, orderBy: { updatedAt: "desc" }, select: { workspaceId: true, name: true } }),
    ]);
    const userBy = new Map(users.map((u) => [u.id, u]));
    const brandBy = new Map<string, string>();
    for (const b of brands) if (b.name && !brandBy.has(b.workspaceId)) brandBy.set(b.workspaceId, b.name.trim());

    const mail = async (system: SystemKey, c: Ctx, claim: { name: string; props: Record<string, unknown> }, note: Note, to = c.user.email, unsub?: string): Promise<boolean> => {
      if (budget <= 0) return false;
      if (!(await systemEnabled(d.db, system))) return false;
      if (dry) { log("info", "proof email (dry run)", { system, ws: c.ws.id, subject: note.subject, text: note.text }); return false; }
      const row = await d.db.adsEvent.create({ data: { name: claim.name, workspaceId: c.ws.id, userId: c.user.id, props: { system, ...claim.props } as object } });
      try {
        await d.send({ to, subject: note.subject, text: note.text, html: "", headers: unsub ? unsubscribeHeaders(unsub) : {}, from: unsub ? founderFrom() : undefined });
        budget--;
        counted(system);
        return true;
      } catch (e) {
        await d.db.adsEvent.delete({ where: { id: row.id } }).catch(() => undefined);
        (errs[system] ??= []).push(`${claim.name} ${c.ws.id}: ${errMsg(e)}`);
        return false;
      }
    };

    for (const ws of wss) {
      const user = userBy.get(ws.ownerId);
      if (!user) continue;
      const ev = events.filter((e) => e.workspaceId === ws.id);
      const count = (n: string) => ev.filter((e) => e.name === n);
      const conn = conns.find((x) => x.workspaceId === ws.id);
      const m = mandates.find((x) => x.workspaceId === ws.id);
      const c: Ctx = {
        ws, user, events: ev,
        paidAt: count("team_hired").map((e) => e.createdAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
        metaAt: conn?.createdAt ?? null, budgetAt: m?.authorizedAt ?? null, liveAt: m?.launchedAt ?? null, currency: m?.currency ?? "USD",
      };
      const isTeam = (TEAM_PLANS as readonly string[]).includes(ws.adsPlan);
      const unsubscribed = ev.some((e) => e.name === "email_unsubscribed") || (await d.db.adsEvent.count({ where: { userId: user.id, name: "email_unsubscribed" } })) > 0;
      const unsub = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: user.id }, secret)}`;
      const teamUrl = `${base}/ads/team?utm_source=activation&utm_medium=email`;
      const firstName = user.name?.trim().split(/\s+/)[0] ?? null;
      const business = brandBy.get(ws.id) ?? ws.name;
      const refCode = await d.db.adsReferralCode.findUnique({ where: { workspaceId: ws.id }, select: { code: true } });
      const referralUrl = refCode ? shareUrl(refCode.code) : null;
      const quiet = isTestEmail(user.email) || unsubscribed;

      if (isTeam && secret) {
        // Guarantee breach (alert to Nolan once; surfaces only, never refunds). Not gated by the owner's opt-out.
        if (on.get("guarantee_watch") && !isTestEmail(user.email) && !count("guarantee_breach_alerted").length) {
          const refunded = await d.db.adsRefund.count({ where: { workspaceId: ws.id } }).catch(() => 0);
          const breach = refunded ? null : guaranteeBreach({ paidAt: c.paidAt, metaAt: c.metaAt, budgetAt: c.budgetAt, liveAt: c.liveAt, now });
          if (breach) await mail("guarantee_watch", c, { name: "guarantee_breach_alerted", props: { cause: breach.cause, daysLate: breach.daysLate } }, breachAlert({ workspaceId: ws.id, businessName: business, ownerEmail: user.email, breach, adminUrl: `${base}/admin/ads/growth` }), NOLAN_ALERT_EMAIL);
        }
        if (quiet) continue;
        if (on.get("activation")) {
          const step = nudgeDue(c, count("live_nudge_sent").map((e) => String(prop(e.props, "step"))), now);
          if (step) await mail("activation", c, { name: "live_nudge_sent", props: { step } }, nudgeNote(step, { firstName, teamUrl, unsubscribeUrl: unsub }), user.email, unsub);
          const firstLead = await d.db.metaLead.findFirst({ where: { workspaceId: ws.id, deletedAt: null }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } });
          const win = firstWinDue({ liveAt: c.liveAt, firstLeadAt: firstLead?.receivedAt ?? null, sent: count("first_win_email_sent").map((e) => String(prop(e.props, "kind"))), now });
          if (win) await mail("activation", c, { name: "first_win_email_sent", props: { kind: win, at: (win === "first_lead" ? firstLead?.receivedAt : c.liveAt)?.toISOString() } }, firstWinNote(win, { firstName, businessName: business, teamUrl, referralUrl, unsubscribeUrl: unsub }), user.email, unsub);
        }
        if (on.get("proof") && c.liveAt) {
          const day = proofDayDue({ liveAt: c.liveAt, sentDays: count("proof_report_sent").map((e) => Number(prop(e.props, "day"))), now });
          if (day) {
            const w = proofWindow(c.liveAt, now);
            const [rows, received] = await Promise.all([
              d.db.adPerformanceDay.findMany({ where: { workspaceId: ws.id, day: { gte: w.from, lte: w.to } }, select: { day: true, spendMinor: true, leads: true } }),
              d.db.metaLead.count({ where: { workspaceId: ws.id, deletedAt: null, receivedAt: { gte: c.liveAt } } }),
            ]);
            const measured: Measured = measureWindow({ ...w, currency: c.currency, days: rows, leadsReceived: received });
            // Claim first so the consent links can reference the stored snapshot's id.
            if (budget > 0 && (await systemEnabled(d.db, "proof")) && !dry) {
              const row = await d.db.adsEvent.create({ data: { name: "proof_report_sent", workspaceId: ws.id, userId: user.id, props: { system: "proof", day, businessName: business, measured, method: "stored AdPerformanceDay + MetaLead" } as object } });
              const exp = Math.floor(now.getTime() / 1000) + 60 * 86_400;
              const link = (a: "yes" | "no") => `${base}/api/proof/consent?t=${signConsent({ u: user.id, w: ws.id, a, k: row.id, e: exp }, secret)}`;
              try {
                const note = resultsNote(day, measured, { firstName, teamUrl: `${base}/ads/team?utm_source=proof&utm_medium=email`, links: { yes: link("yes"), no: link("no") }, referralUrl, unsubscribeUrl: unsub });
                await d.send({ to: user.email, subject: note.subject, text: note.text, html: "", headers: unsubscribeHeaders(unsub), from: founderFrom() });
                budget--; counted("proof");
              } catch (e) {
                await d.db.adsEvent.delete({ where: { id: row.id } }).catch(() => undefined);
                (errs.proof ??= []).push(`report ${ws.id}: ${errMsg(e)}`);
              }
            } else if (dry) log("info", "proof report (dry run)", { ws: ws.id, day, measured });
          }
        }
      }
      if (on.get("cancel_save") && !quiet && secret) {
        const opened = count("billing_portal_opened").map((e) => e.createdAt).sort((a, b) => b.getTime() - a.getTime())[0];
        if (opened) {
          const lastSave = count("cancel_save_email_sent").map((e) => e.createdAt.getTime()).sort((a, b) => b - a)[0];
          const failedRecently = count("payment_failed").some((e) => now.getTime() - e.createdAt.getTime() < 14 * DAY);
          if (cancelSaveDue({ openedAt: opened, now, plan: ws.adsPlan, active: true, recentPaymentFailure: failedRecently, sentWithinDays: !!lastSave && now.getTime() - lastSave < 60 * DAY })) {
            if (!count("cancel_intent").some((e) => e.createdAt >= opened)) await d.db.adsEvent.create({ data: { name: "cancel_intent", workspaceId: ws.id, userId: user.id, props: { system: "cancel_save", plan: ws.adsPlan, openedAt: opened.toISOString() } } });
            await mail("cancel_save", c, { name: "cancel_save_email_sent", props: { plan: ws.adsPlan } }, cancelSaveNote({ firstName, unsubscribeUrl: unsub }), user.email, unsub);
          }
        }
      }
    }
  } catch (e) {
    out.errors.push(errMsg(e));
  }
  return await finish();

  async function finish(): Promise<ProofTickResult> {
    for (const k of ["activation", "proof", "cancel_save", "guarantee_watch"] as SystemKey[]) {
      if (!on.get(k)) continue;
      const e = [...(errs[k] ?? []), ...out.errors];
      await recordSystemRun(d.db, k, { ok: e.length === 0, outputs: out.sent[k] ?? 0, error: e.join("; ") || null }, now);
      out.errors.push(...(errs[k] ?? []));
    }
    if (Object.keys(out.sent).length || out.errors.length) log(out.errors.length ? "warn" : "info", "proof tick", { ...out });
    return out;
  }
}

export function startProofLoop(deps: ProofDeps, everyMs = 15 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    proofTick(deps).catch((e) => log("warn", "proof tick failed", { error: errMsg(e) })).finally(() => { running = false; });
  };
  const first = setTimeout(tick, 150_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
