// AI gateway loop (growth system `ai_gateway`, flag sys_ai_gateway): runs the web app's AI requests on the owner's Codex
// SUBSCRIPTION. Web writes AdsEvent `ai_request`; this loop claims it (`ai_claim`, under an advisory xact lock, so each
// request is handled at most once even across restarts), runs it through createProvider('codex'), writes `ai_result`.
// Requests older than 5 min are ignored. Hourly cap AI_GATEWAY_MAX_PER_HOUR (120); pauses when Codex weekly usage >= AI_GATEWAY_PAUSE_PCT (97).
// Docs: docs/ops/ai-policy.md.
import { CLAIM_EVENT, GATEWAY_SYSTEM, REQUEST_EVENT, RESULT_EVENT, STALE_MS, admit, maxPerHour, parseRequestProps, pausePct } from "../../../src/lib/ai-gateway/core";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import type { AIProvider } from "../providers/types";
import { codexWeeklyPctSeen } from "../studio/brain";

const BATCH = 5;

/** Claim one request exactly once. Returns true for the caller that wins. */
export async function claim(db: Db, id: string, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai_gateway:${id}`}))`;
    const done = await tx.adsEvent.findFirst({ where: { name: { in: [CLAIM_EVENT, RESULT_EVENT] }, props: { path: ["id"], equals: id } }, select: { id: true } });
    if (done) return false;
    await tx.adsEvent.create({ data: { name: CLAIM_EVENT, props: { id, at: now.toISOString() } } });
    return true;
  });
}

const writeResult = (db: Db, p: Record<string, unknown>) => db.adsEvent.create({ data: { name: RESULT_EVENT, props: JSON.parse(JSON.stringify(p)) } });

export async function aiGatewayTick(db: Db, provider: AIProvider, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<number> {
  if (!(await systemEnabled(db, GATEWAY_SYSTEM))) return 0;
  const since = new Date(now.getTime() - STALE_MS);
  const reqs = await db.adsEvent.findMany({ where: { name: REQUEST_EVENT, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 50, select: { props: true } });
  if (!reqs.length) return 0;
  const claimed = new Set((await db.adsEvent.findMany({ where: { name: { in: [CLAIM_EVENT, RESULT_EVENT] }, createdAt: { gte: since } }, select: { props: true }, take: 500 })).map((e) => String((e.props as { id?: unknown } | null)?.id)));
  let handled = 0;
  for (const row of reqs) {
    if (handled >= BATCH) break;
    const req = parseRequestProps(row.props);
    if (!req || claimed.has(req.id)) continue;
    try {
      if (!(await claim(db, req.id, now))) continue;
      handled++;
      const t0 = Date.now();
      const hourAgo = new Date(now.getTime() - 3_600_000);
      const [n, pct] = await Promise.all([db.adsEvent.count({ where: { name: CLAIM_EVENT, createdAt: { gte: hourAgo } } }), codexWeeklyPctSeen(db)]);
      const verdict = admit({ claimedLastHour: n - 1, maxHour: maxPerHour(env), codexPct: pct, pausePct: pausePct(env) });
      if (!verdict.ok) { await writeResult(db, { id: req.id, ok: false, text: "", json: null, error: verdict.error, ms: 0 }); continue; }
      try {
        const r = await provider.text({ system: req.system, prompt: req.prompt, ...(req.schema ? { jsonSchema: req.schema } : {}) });
        let json = r.json;
        if (req.schema && json === undefined) { try { json = JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1)); } catch { json = null; } }
        await writeResult(db, { id: req.id, ok: true, text: r.text, json: json ?? null, error: null, ms: Date.now() - t0, costMicros: r.usage.costMicros, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, purpose: req.purpose, requester: req.requester });
      } catch (e) {
        await writeResult(db, { id: req.id, ok: false, text: "", json: null, error: errMsg(e).slice(0, 300), ms: Date.now() - t0 });
      }
    } catch (e) {
      log("warn", "ai gateway request failed", { id: req.id, error: errMsg(e) });
    }
  }
  if (handled) await recordSystemRun(db, GATEWAY_SYSTEM, { ok: true, outputs: handled }, now);
  return handled;
}

export function startAiGatewayLoop(opts: { db: Db; env?: NodeJS.ProcessEnv }, everyMs = 2_000): () => void {
  const env = opts.env ?? process.env;
  // Codex subscription only, regardless of AI_PROVIDER / TEXT_BRAIN: never a pay-per-token key.
  const provider = createProvider("codex", { ...env, TEXT_BRAIN: "codex" }, { db: opts.db, by: "engine" });
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    aiGatewayTick(opts.db, provider, env)
      .catch((e) => log("warn", "ai gateway tick failed", { error: errMsg(e) }))
      .finally(() => { running = false; });
  };
  const first = setTimeout(tick, 10_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
