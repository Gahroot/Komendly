// Revenue lifecycle loop (systems nurture, activation_rescue, reactivation, expansion, success_agent). Every 30 min,
// single replica. Each system has its own kill switch (AdsFeatureFlag sys_<key>, default OFF) and heartbeat. Rules are
// pure (src/lib/revenue-lifecycle/*); copy is fixed. Claim (rl_email_sent) before every send and release it if the send
// fails. All emails: founderFrom, Reply-To nolan@prestyj.com, unsubscribe link, global caps + test/unsub/reply/paid stops.
import { founderFrom } from "../../../src/lib/ads/lifecycle/founder";
import { unsubscribeHeaders } from "../../../src/lib/ads/lifecycle/template";
import { signEmailToken } from "../../../src/lib/ads/lifecycle/tokens";
import { recordSystemRun, systemEnabled, type SystemKey } from "../../../src/lib/growth/systems";
import { checkNote, NOLAN_REPLY_TO, RL_SENT_EVENT, type Note, type Suppression } from "../../../src/lib/revenue-lifecycle/core";
import { localExperiments } from "../../../src/lib/revenue-lifecycle/experiments-adapter";
import { expansionDue, expansionNote, EXPANSION_SYSTEM, type ExpansionInput, type ExpansionKind } from "../../../src/lib/revenue-lifecycle/expansion";
import { nurtureDue, nurtureNote, NURTURE_SYSTEM, type BridgeVariant, type NurtureInput, type NurtureKind, type Objection } from "../../../src/lib/revenue-lifecycle/nurture";
import { cancelledDue, cancelledNote, CANCEL_FEEDBACK_DAY, dormantDue, dormantNote, REACTIVATION_SYSTEM, type ReactivationStep } from "../../../src/lib/revenue-lifecycle/reactivation";
import { bugAlertNote, detectStuck, OUR_BUG_ALERT_EMAIL, pickRescueEmail, rescueMayEmail, rescueNote, RESCUE_SYSTEM, type StuckCause } from "../../../src/lib/revenue-lifecycle/rescue";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import type { AIProvider } from "../providers/types";
import { first, has, hasPurchase, isPaying, last, loadPeople, packFinishedAt, rlSent, sendsOf, unlockPaidAt, type Person } from "./load";
import { successTick } from "./success";

const MAX_PER_TICK = 20;
const DAY = 86_400_000;
export interface CsDeps { db: Db; provider: AIProvider | null; send: SendMail; env?: NodeJS.ProcessEnv; now?: () => Date }
export interface CsTickResult { sent: Partial<Record<SystemKey, number>>; stuck: number; alerts: number; errors: string[] }

const appUrl = (env: NodeJS.ProcessEnv) => (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
const firstName = (p: Person) => p.user.name?.trim().split(/\s+/)[0] || null;
const prop = (e: { props: Record<string, unknown> }, k: string) => e.props[k];

function suppression(p: Person): Suppression {
  return { test: p.test || p.ws.suspendedAt !== null, unsubscribed: p.events.some((e) => e.name === "email_unsubscribed"), replied: p.events.some((e) => e.name === "email_replied"), paid: hasPurchase(p) };
}
function firstTouchSource(p: Person): string | null {
  const s = p.events.find((e) => e.name === "signed_up");
  const ft = s ? (s.props.firstTouch as Record<string, unknown> | undefined) : undefined;
  const v = ft && (ft.utm_source ?? ft.source);
  return typeof v === "string" ? v : null;
}
function tradeOf(p: Person): string | null {
  const t = p.events.find((e) => e.name === "trade_tagged") ?? p.events.find((e) => e.name === "signed_up" && typeof e.props.trade === "string");
  return t && typeof t.props.trade === "string" ? t.props.trade : null;
}

export async function csTick(d: CsDeps): Promise<CsTickResult> {
  const env = d.env ?? process.env;
  const now = (d.now ?? (() => new Date()))();
  const out: CsTickResult = { sent: {}, stuck: 0, alerts: 0, errors: [] };
  const keys: SystemKey[] = ["nurture", "activation_rescue", "reactivation", "expansion", "success_agent"];
  const on = new Map<SystemKey, boolean>();
  for (const k of keys) on.set(k, await systemEnabled(d.db, k));
  if (![...on.values()].some(Boolean)) return out;
  const secret = env.LIFECYCLE_EMAIL_SECRET ?? "";
  const base = appUrl(env);
  const dry = env.CS_DRY_RUN === "1";
  let budget = MAX_PER_TICK;
  const errs: Partial<Record<SystemKey, string[]>> = {};
  const fail = (k: SystemKey, m: string) => (errs[k] ??= []).push(m);

  async function mail(key: SystemKey, p: Person, kind: string, note: Note, extra: Record<string, unknown> = {}): Promise<boolean> {
    const bad = checkNote(note);
    if (bad) { fail(key, `${kind}: ${bad}`); return false; }
    if (dry) { log("info", "revenue lifecycle email (dry run)", { key, kind, text: note.text }); return false; }
    if (!(await systemEnabled(d.db, key))) return false;
    const dup = await d.db.adsEvent.findFirst({ where: { name: RL_SENT_EVENT, userId: p.user.id, AND: [{ props: { path: ["system"], equals: key } }, { props: { path: ["kind"], equals: kind } }, ...(extra.dupKey ? [{ props: { path: ["dupKey"], equals: String(extra.dupKey) } }] : [])] }, select: { id: true } });
    if (dup && !extra.repeatable) return false;
    const claim = await d.db.adsEvent.create({ data: { name: RL_SENT_EVENT, userId: p.user.id, workspaceId: p.ws.id, props: { system: key, kind, subject: note.subject, ...extra } } });
    try {
      await d.send({ to: p.user.email, subject: note.subject, text: note.text, html: "", headers: unsubscribeHeaders(unsubUrl(p)), from: founderFrom(), replyTo: NOLAN_REPLY_TO });
      budget--;
      out.sent[key] = (out.sent[key] ?? 0) + 1;
      return true;
    } catch (e) {
      await d.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined);
      fail(key, `send ${kind}: ${errMsg(e)}`);
      return false;
    }
  }
  const unsubUrl = (p: Person) => `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: p.user.id }, secret)}`;

  let people: Person[] = [];
  try {
    if (!secret) throw new Error("LIFECYCLE_EMAIL_SECRET unset");
    people = await loadPeople(d.db, now);
  } catch (e) {
    for (const k of keys) if (on.get(k)) fail(k, errMsg(e));
  }

  // ---- 1 nurture ----
  if (on.get("nurture")) {
    try {
      for (const p of people) {
        if (budget <= 0) break;
        const fin = packFinishedAt(p);
        if (!fin) continue;
        const ret = p.events.some((e) => ["ad_downloaded", "pricing_viewed", "begin_checkout", "launch_guide_opened"].includes(e.name) && e.createdAt.getTime() > fin.getTime() + 12 * 3_600_000);
        const input: NurtureInput = {
          userId: p.user.id, firstName: firstName(p), trade: tradeOf(p), isBusiness: p.events.find((e) => e.name === "signed_up")?.props.is_business === true, source: firstTouchSource(p),
          packFinishedAt: fin, packFailed: false, downloaded: has(p, "export_downloaded") || has(p, "ad_downloaded"), returned: ret, adInsight: null, brandName: p.brandName,
          suppression: suppression(p), sends: sendsOf(p),
          nurtureSent: rlSent(p, NURTURE_SYSTEM).map((e) => ({ kind: String(prop(e, "kind")) as NurtureKind, at: e.createdAt, objection: prop(e, "objection") as Objection | undefined })),
          autopilotUsed: p.events.some((e) => e.name === "purchased" && e.props.key === "autopilot_launch"), appUrl: base, unsubscribeUrl: unsubUrl(p),
        };
        const due = nurtureDue(input, now);
        if (!due) continue;
        const variant = (due.kind === "n2_bridge" ? localExperiments.assign("nurture_bridge_subject", p.user.id, ["a", "b"]) : "a") as BridgeVariant;
        const sent = await mail("nurture", p, due.kind, nurtureNote(input, due, now, variant), { objection: due.objection, ...(due.kind === "n2_bridge" ? { variant } : {}) });
        if (sent && due.kind === "n2_bridge") await localExperiments.exposure(d.db, "nurture_bridge_subject", variant, p.user.id, { workspaceId: p.ws.id }).catch(() => undefined);
      }
    } catch (e) { fail("nurture", errMsg(e)); }
  }

  // ---- 2 activation rescue ----
  if (on.get("activation_rescue")) {
    try {
      for (const p of people) {
        if (p.test) continue;
        const run = p.runs[0] ?? null;
        const stuck = detectStuck({
          now, signedUpAt: p.user.createdAt, hasRun: p.runs.length > 0,
          run: run ? { id: run.id, status: run.status, completedAt: run.completedAt, createdAt: run.createdAt, ready: run.ready, error: run.error } : null,
          downloadedAt: last(p, "export_downloaded") ?? last(p, "ad_downloaded"), lockedRefusedAt: last(p, "locked_asset_refused"), unlockPaidAt: unlockPaidAt(p), subscribed: isPaying(p),
          autopilot: p.ws.adsPlan === "autopilot" && isPaying(p) ? { paidAt: first(p, "paid_converted") ?? first(p, "purchased") ?? p.ws.createdAt, metaConnected: p.metaConnected } : null,
        });
        const seen = new Set(p.events.filter((e) => e.name === "activation_stuck").map((e) => String(prop(e, "cause"))));
        for (const s of stuck) {
          if (!seen.has(s.cause) && !dry) {
            await d.db.adsEvent.create({ data: { name: "activation_stuck", userId: p.user.id, workspaceId: p.ws.id, runId: run?.id ?? null, props: { cause: s.cause, ourBug: s.ourBug, hoursStuck: Math.round((now.getTime() - s.since.getTime()) / 3_600_000), runStatus: run?.status ?? null, error: run?.error?.slice(0, 200) ?? null, system: RESCUE_SYSTEM } } });
            out.stuck++;
          }
          const alerted = p.events.some((e) => e.name === "rl_alert_sent" && prop(e, "cause") === s.cause);
          if (s.ourBug && !alerted && !dry && (await systemEnabled(d.db, "activation_rescue"))) {
            // Alert Nolan (deduped). No auto-credit/refund: adminAdjustCredits is web-only (Prisma + ledger); decide in admin.
            const claim = await d.db.adsEvent.create({ data: { name: "rl_alert_sent", userId: p.user.id, workspaceId: p.ws.id, props: { cause: s.cause } } });
            const n = bugAlertNote({ cause: s.cause, workspaceId: p.ws.id, userEmail: p.user.email, runId: run?.id ?? null, detail: run?.error?.slice(0, 200) ?? null, adminUrl: `${base}/admin/ads/workspaces/${p.ws.id}` });
            try { await d.send({ to: OUR_BUG_ALERT_EMAIL, subject: n.subject, text: n.text, html: "", headers: {} }); out.alerts++; } catch (e) { await d.db.adsEvent.delete({ where: { id: claim.id } }).catch(() => undefined); fail("activation_rescue", `alert: ${errMsg(e)}`); }
          }
        }
        if (budget <= 0) continue;
        const emailed = new Set(rlSent(p, RESCUE_SYSTEM).map((e) => String(prop(e, "kind")) as StuckCause));
        const pick = pickRescueEmail(stuck, emailed);
        if (pick && rescueMayEmail(pick, { suppression: suppression(p), sends: sendsOf(p), now })) {
          const runUrl = run ? `${base}/ads/runs/${run.id}` : `${base}/ads/app`;
          await mail("activation_rescue", p, pick.cause, rescueNote(pick.cause, { firstName: firstName(p), runUrl, pricingUrl: `${base}/ads/pricing`, unsubscribeUrl: unsubUrl(p) }), { ourBug: pick.ourBug });
        }
      }
    } catch (e) { fail("activation_rescue", errMsg(e)); }
  }

  // ---- 3 reactivation ----
  if (on.get("reactivation")) {
    try {
      for (const p of people) {
        if (budget <= 0) break;
        const sup = suppression(p);
        const sends = sendsOf(p);
        const fin = packFinishedAt(p);
        const sentSteps = rlSent(p, REACTIVATION_SYSTEM).filter((e) => typeof prop(e, "step") === "number").map((e) => prop(e, "step") as ReactivationStep);
        const dormant = { firstName: firstName(p), packFinishedAt: fin, suppression: sup, sends, reactivationSent: sentSteps, appUrl: base, unsubscribeUrl: unsubUrl(p) };
        const step = dormantDue(dormant, now);
        if (step) { await mail("reactivation", p, `dormant_d${step}`, dormantNote(dormant, step, now), { step }); continue; }
        const winbackRecent = p.events.some((e) => e.name === "winback_email_sent" && now.getTime() - e.createdAt.getTime() < 14 * DAY);
        const cancelled = { firstName: firstName(p), canceledAt: p.ws.canceledAt, active: isPaying(p), suppression: sup, sends, sentFeedback: rlSent(p, REACTIVATION_SYSTEM).some((e) => prop(e, "kind") === "cancelled_feedback"), winbackRecent, appUrl: base, unsubscribeUrl: unsubUrl(p) };
        if (cancelledDue(cancelled, now)) await mail("reactivation", p, "cancelled_feedback", cancelledNote(cancelled), { dayAfterCancel: CANCEL_FEEDBACK_DAY });
      }
    } catch (e) { fail("reactivation", errMsg(e)); }
  }

  // ---- 4 expansion ----
  if (on.get("expansion")) {
    try {
      for (const p of people) {
        if (budget <= 0) break;
        const dl = p.events.filter((e) => e.name === "export_downloaded");
        const input: ExpansionInput = {
          firstName: firstName(p), plan: p.ws.adsPlan, active: isPaying(p), firstDownloadAt: dl[0]?.createdAt ?? null,
          downloads14d: dl.filter((e) => now.getTime() - e.createdAt.getTime() < 14 * DAY).length, distinctBrandDomains: p.brandDomains,
          paidSince: first(p, "paid_converted") ?? first(p, "purchased"), referralUrl: p.referralUrl, suppression: suppression(p), sends: sendsOf(p),
          expansionSent: rlSent(p, EXPANSION_SYSTEM).map((e) => ({ kind: String(prop(e, "kind")) as ExpansionKind, at: e.createdAt })), appUrl: base, unsubscribeUrl: unsubUrl(p),
        };
        const kind = expansionDue(input, now);
        if (kind) await mail("expansion", p, kind, expansionNote(kind, input));
      }
    } catch (e) { fail("expansion", errMsg(e)); }
  }

  // ---- 5 success agent (daily) ----
  if (on.get("success_agent") && !dry) {
    try { await successTick(d, now); } catch (e) { fail("success_agent", errMsg(e)); }
  }

  for (const k of keys) {
    if (!on.get(k)) continue;
    const e = errs[k] ?? [];
    if (e.length) out.errors.push(...e.map((m) => `${k}: ${m}`));
    await recordSystemRun(d.db, k, { ok: e.length === 0, outputs: (out.sent[k] ?? 0) + (k === "activation_rescue" ? out.stuck + out.alerts : 0), error: e.join("; ") || null }, now);
  }
  if (Object.keys(out.sent).length || out.stuck || out.errors.length) log(out.errors.length ? "warn" : "info", "customer success tick", { ...out });
  return out;
}

export function startCustomerSuccessLoop(deps: CsDeps, everyMs = 30 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    csTick(deps).catch((e) => log("warn", "customer success tick failed", { error: errMsg(e) })).finally(() => { running = false; });
  };
  const first = setTimeout(tick, 150_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
