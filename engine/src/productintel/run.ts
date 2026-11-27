// Product-intelligence loops (growth systems reliability, delivery_econ, competitive, product_loop; each default OFF via
// AdsFeatureFlag sys_<key>). Single replica, hourly tick. Writes ONLY AdsEvents + heartbeats, plus (product_loop) the
// allow-listed config actions in src/lib/product-intel/backlog.ts, each recorded with its previous value so it is reversible.
// Never changes models, prices, customer-facing copy or any money flag. Reads AdJob/AdRun/Ad/AdsEvent only.
import { z } from "zod";
import { AUTO_APPLIED_EVENT, BACKLOG_EVENT, type LoopOutput, SIGNAL_EVENTS, THRESHOLD_EVENT, buildBacklog, currentBacklog, dedupeSignals, digestText, loopPrompt, rankSignals, toSignal, validateAutoAction } from "../../../src/lib/product-intel/backlog";
import { PROPOSAL_EVENT, proposeDifferentiators } from "../../../src/lib/product-intel/competitive";
import { DELIVERY_EVENT, computeDeliveryEcon, loadEconInput } from "../../../src/lib/product-intel/delivery-econ";
import { FINDING_EVENT, RELIABILITY_EVENT, buildReliabilitySnapshot, clampSlo, loadReliabilityInput, type Finding, type ReliabilitySnapshot } from "../../../src/lib/product-intel/reliability";
import { recordSystemRun, systemEnabled, type SystemKey } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import { structured } from "../providers/structured";
import type { AIProvider } from "../providers/types";

const DAY = 86_400_000;
const LoopOutputSchema = z.object({
  items: z.array(z.object({ signalIds: z.array(z.string().max(160)).min(1).max(6), title: z.string().max(140), why: z.string().max(400), effort: z.number().int().min(1).max(5), action: z.unknown().optional() })).max(15),
  whatToBuildNext: z.string().max(1200),
});
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const alertTo = (env: NodeJS.ProcessEnv) => env.ADS_ALERT_EMAIL || "nolan@prestyj.com";
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

async function eventExists(db: Db, name: string, path: string, equals: string): Promise<boolean> {
  return Boolean(await db.adsEvent.findFirst({ where: { name, props: { path: [path], equals } }, select: { id: true } }));
}

/** Latest owner/loop-set SLO thresholds (clamped into bounds). */
async function sloConfig(db: Db) {
  const rows = await db.adsEvent.findMany({ where: { name: THRESHOLD_EVENT }, orderBy: { createdAt: "asc" }, take: 50 });
  const o: { target?: number; packWithinMs?: number } = {};
  for (const r of rows) { const p = obj(r.props); if (p.key === "slo.target") o.target = Number(p.value); if (p.key === "slo.packWithinMs") o.packWithinMs = Number(p.value); }
  return clampSlo(o);
}

export const ENGINE_PROVIDER_EVENT = "engine_provider";
const LLM_STAGES = new Set(["extract", "plan", "qc", "render_static", "render_motion", "bonus", "bonus_generate", "coach_review"]);
export const engineProvider = (env: NodeJS.ProcessEnv) => ({ provider: env.TEXT_BRAIN || "codex", model: env.CODEX_TEXT_MODEL || "gpt-6.2-sol" });

export async function reliabilityTick(db: Db, send: SendMail | undefined, env: NodeJS.ProcessEnv, now = new Date()): Promise<{ enabled: boolean; snapshot: ReliabilitySnapshot | null; alerts: number }> {
  if (!(await systemEnabled(db, "reliability"))) return { enabled: false, snapshot: null, alerts: 0 };
  try {
    const day = dayOf(now);
    const input = await loadReliabilityInput(db, now, 7);
    // AdJob does not record provider/model (runner.ts is off-limits). The engine runs ONE configured text provider per process,
    // so stamp LLM-stage jobs with it, labelled "(engine-configured)": a configuration fact, not a per-job measurement.
    const cfg = engineProvider(env);
    for (const j of input.jobs) if (LLM_STAGES.has(j.type)) j.payload = { provider: `${cfg.provider} (engine-configured)`, model: cfg.model };
    if (!(await eventExists(db, ENGINE_PROVIDER_EVENT, "day", day))) await db.adsEvent.create({ data: { name: ENGINE_PROVIDER_EVENT, props: { day, ...cfg } } });
    const snap = buildReliabilitySnapshot(input, await sloConfig(db));
    let outputs = 0, alerts = 0;
    if (!(await eventExists(db, RELIABILITY_EVENT, "day", day))) { await db.adsEvent.create({ data: { name: RELIABILITY_EVENT, props: JSON.parse(JSON.stringify(snap)) } }); outputs++; }
    const fresh: Finding[] = [];
    for (const f of snap.findings) {
      const key = `${f.key}:${day}`;
      if (await eventExists(db, FINDING_EVENT, "dedupe", key)) continue;
      await db.adsEvent.create({ data: { name: FINDING_EVENT, props: { ...f, dedupe: key, day } } });
      fresh.push(f); outputs++;
    }
    const urgent = fresh.filter((f) => f.severity === 3);
    const first = urgent[0];
    if (urgent.length && send) {
      await send({ to: alertTo(env), subject: `Reliability alert: ${first?.title ?? "finding"}`, text: `${urgent.map((f) => `${f.title}\n${f.detail}`).join("\n\n")}\n\nSee /admin/ads/product. Recommendations are read-only: nothing was changed.`, html: `<p>${urgent.map((f) => `<b>${f.title}</b><br>${f.detail}`).join("</p><p>")}</p><p>See /admin/ads/product. Read-only: nothing was changed.</p>`, headers: {} }).then(() => { alerts = urgent.length; }).catch((e) => log("warn", "reliability alert email failed", { error: errMsg(e) }));
    }
    await recordSystemRun(db, "reliability", { ok: true, outputs }, now);
    return { enabled: true, snapshot: snap, alerts };
  } catch (e) {
    await recordSystemRun(db, "reliability", { ok: false, error: errMsg(e) }, now);
    throw e;
  }
}

export async function deliveryEconTick(db: Db, now = new Date()): Promise<{ enabled: boolean; wrote: boolean }> {
  if (!(await systemEnabled(db, "delivery_econ"))) return { enabled: false, wrote: false };
  const day = dayOf(now);
  try {
    if (await eventExists(db, DELIVERY_EVENT, "day", day)) { await recordSystemRun(db, "delivery_econ", { ok: true, outputs: 0 }, now); return { enabled: true, wrote: false }; }
    const econ = computeDeliveryEcon(await loadEconInput(db, now, 30));
    await db.adsEvent.create({ data: { name: DELIVERY_EVENT, props: JSON.parse(JSON.stringify(econ)) } });
    await recordSystemRun(db, "delivery_econ", { ok: true, outputs: 1 }, now);
    return { enabled: true, wrote: true };
  } catch (e) {
    await recordSystemRun(db, "delivery_econ", { ok: false, error: errMsg(e) }, now);
    throw e;
  }
}

/** Weekly: turn the scorecard's differentiator ideas into product_proposal events (deduped per ISO week). Proposals only. */
export async function competitiveTick(db: Db, now = new Date()): Promise<{ enabled: boolean; wrote: number }> {
  if (!(await systemEnabled(db, "competitive"))) return { enabled: false, wrote: 0 };
  const week = `${now.getUTCFullYear()}-W${Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * DAY))}`;
  try {
    let wrote = 0;
    for (const p of proposeDifferentiators()) {
      const key = `${p.id}:${week}`;
      if (await eventExists(db, PROPOSAL_EVENT, "dedupe", key)) continue;
      await db.adsEvent.create({ data: { name: PROPOSAL_EVENT, props: { ...p, dedupe: key, source: "competitive" } } });
      wrote++;
    }
    await recordSystemRun(db, "competitive", { ok: true, outputs: wrote }, now);
    return { enabled: true, wrote };
  } catch (e) {
    await recordSystemRun(db, "competitive", { ok: false, error: errMsg(e) }, now);
    throw e;
  }
}

/** Apply one validated allow-listed action; returns what was done (previous value recorded for rollback). */
export async function applyAutoAction(db: Db, raw: unknown, now: Date): Promise<{ applied: boolean; detail: string }> {
  const v = validateAutoAction(raw);
  if (!v.ok) return { applied: false, detail: v.reason };
  const a = v.action;
  if (a.kind === "set_flag") {
    const prev = await db.adsFeatureFlag.findUnique({ where: { key: a.key } });
    if (prev?.enabled) return { applied: false, detail: "already on" };
    await db.adsFeatureFlag.upsert({ where: { key: a.key }, create: { key: a.key, enabled: true }, update: { enabled: true } });
    await db.adsEvent.create({ data: { name: AUTO_APPLIED_EVENT, props: { action: a, previous: { enabled: prev?.enabled ?? false }, at: now.toISOString(), rollback: `set ${a.key} OFF in /admin/ads/flags` } } });
    return { applied: true, detail: `${a.key} ON` };
  }
  if (a.kind === "set_threshold") {
    const rows = await db.adsEvent.findMany({ where: { name: THRESHOLD_EVENT }, orderBy: { createdAt: "desc" }, take: 20 });
    const prev = rows.map((r) => obj(r.props)).find((p) => p.key === a.key)?.value ?? null;
    await db.adsEvent.create({ data: { name: THRESHOLD_EVENT, props: { key: a.key, value: a.value, previous: prev, at: now.toISOString(), by: "product_loop" } } });
    await db.adsEvent.create({ data: { name: AUTO_APPLIED_EVENT, props: { action: a, previous: prev, at: now.toISOString(), rollback: "write a new product_threshold event with the previous value" } } });
    return { applied: true, detail: `${a.key}=${a.value}` };
  }
  return { applied: false, detail: "copy-variant activation is owner/offer-intel territory: recorded as a suggestion only" };
}

async function topConstraint(db: Db): Promise<string | null> {
  const s = await db.adsEvent.findFirst({ where: { name: "revenue_snapshot" }, orderBy: { createdAt: "desc" } });
  const c = obj(s?.props).constraints;
  const key = Array.isArray(c) ? String(obj(c[0]).key ?? "") : "";
  return key || null;
}

export async function productLoopCycle(opts: { db: Db; provider: AIProvider; send?: SendMail; env: NodeJS.ProcessEnv; now: Date }): Promise<{ items: number; applied: number }> {
  const { db, provider, send, env, now } = opts;
  const since = new Date(now.getTime() - 30 * DAY);
  const rows = await db.adsEvent.findMany({ where: { name: { in: [...SIGNAL_EVENTS] }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 1500 });
  const constraint = await topConstraint(db);
  const ranked = rankSignals(dedupeSignals(rows.flatMap((r) => { const s = toSignal(r); return s ? [s] : []; })), constraint);
  let out: LoopOutput | null = null;
  if (ranked.length) {
    const { system, prompt } = loopPrompt(ranked, constraint);
    try { out = await structured(provider, LoopOutputSchema, { system, prompt, reasoning: "medium" }, []); }
    catch (e) { log("warn", "product loop model failed; deterministic ranking only", { error: errMsg(e) }); }
  }
  const backlog = buildBacklog(ranked, out, now, { topConstraintArea: constraint });
  const existing = new Map(currentBacklog(await db.adsEvent.findMany({ where: { name: BACKLOG_EVENT }, orderBy: { createdAt: "desc" }, take: 500 })).map((r) => [r.id, r]));
  let applied = 0;
  for (const r of backlog) {
    const prev = existing.get(r.id);
    // owner decisions (approved/in_progress/done/rejected) are never overwritten: only re-score proposed rows
    await db.adsEvent.create({ data: { name: BACKLOG_EVENT, props: JSON.parse(JSON.stringify({ ...r, status: prev?.status ?? "proposed", proposedAt: prev?.proposedAt ?? r.proposedAt })) } });
    if (r.autoAction && !prev) { const res = await applyAutoAction(db, r.autoAction, now); if (res.applied) applied++; }
  }
  const digest = digestText(backlog, out?.whatToBuildNext ?? null);
  await db.adsEvent.create({ data: { name: "product_digest", props: { day: dayOf(now), subject: digest.subject, text: digest.text, items: backlog.length } } });
  const digestOn = send ? await systemEnabled(db, "product_loop") : false;
  if (send && digestOn) await send({ to: alertTo(env), subject: digest.subject, text: digest.text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${digest.text.replace(/</g, "&lt;")}</pre>`, headers: {} }).catch((e) => log("warn", "product digest email failed", { error: errMsg(e) }));
  return { items: backlog.length, applied };
}

export function startProductEngineLoop(opts: { db: Db; send?: SendMail; env?: NodeJS.ProcessEnv }): () => void {
  const env = opts.env ?? process.env;
  let busy = false, provider: AIProvider | null = null;
  const tick = async () => {
    if (busy) return;
    busy = true;
    const now = new Date();
    try {
      await reliabilityTick(opts.db, opts.send, env, now).catch((e) => log("warn", "reliability tick failed", { error: errMsg(e) }));
      await deliveryEconTick(opts.db, now).catch((e) => log("warn", "delivery econ tick failed", { error: errMsg(e) }));
      const weekly = async (key: SystemKey, event: string) => {
        if (!(await systemEnabled(opts.db, key))) return false;
        const last = await opts.db.adsEvent.findFirst({ where: { name: event }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        return !last || now.getTime() - last.createdAt.getTime() > 7 * DAY - 3_600_000;
      };
      if (await weekly("competitive", PROPOSAL_EVENT)) await competitiveTick(opts.db, now).catch((e) => log("warn", "competitive tick failed", { error: errMsg(e) }));
      if (await weekly("product_loop", "product_digest")) {
        try {
          provider ??= createProvider("codex", { ...env, TEXT_BRAIN: "codex" }, { db: opts.db, by: "engine" });
          const r = await productLoopCycle({ db: opts.db, provider, send: opts.send, env, now });
          await recordSystemRun(opts.db, "product_loop", { ok: true, outputs: r.items }, now);
        } catch (e) {
          await recordSystemRun(opts.db, "product_loop", { ok: false, error: errMsg(e) }, now);
          log("warn", "product loop failed", { error: errMsg(e) });
        }
      }
    } finally { busy = false; }
  };
  const t = setInterval(() => void tick(), 60 * 60_000);
  const first = setTimeout(() => void tick(), 240_000);
  return () => { clearInterval(t); clearTimeout(first); };
}
