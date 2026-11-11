// LLM access: Codex CLI only (owner's ChatGPT subscription, $0). Paid APIs are never called.
import { codexBlock, runCodex, handleFailure, recordSuccess, recordUsage } from './codex.js';
import { codexOnly, DeferError } from './mode.js';

export const llmConfigured = (env = process.env) => codexOnly(env);

/** Runs one Codex call. Codex unavailable / usage limit / login problem -> DeferError; transient -> retryable error. */
export async function tryCodex(system, prompt, { db, env = process.env, job, now = new Date(), log = console, search = false, full = false } = {}) {
  const block = await codexBlock(db, job || 'adhoc', { env, now });
  if (block) throw new DeferError(`codex unavailable: ${block}`);
  try {
    const r = await runCodex(system ? `${system}\n\n---\n\n${prompt}` : prompt, { env, search });
    await recordUsage(db, { job: job || 'adhoc', provider: 'codex', model: env.CODEX_MODEL || 'codex-default', ...r.usage });
    await recordSuccess(db);
    return full ? r : r.text;
  } catch (e) {
    const h = await handleFailure(db, e, { env, now });
    log.error(`[codex] ${job} failed (${h.kind})`);
    if (h.kind === 'usage' || h.kind === 'auth') throw new DeferError(`codex ${h.kind === 'usage' ? 'usage limit' : 'login'} problem: ${String(e.message).slice(0, 200)}`);
    throw Object.assign(new Error(String(e.message).slice(0, 400)), { retryable: true });
  }
}

/** opts: { env, db, job, now, search } */
export async function complete(system, prompt, opts = {}) {
  const env = opts.env || process.env;
  if (!codexOnly(env)) throw Object.assign(new Error('LLM_PROVIDER_ORDER must be "codex" (paid APIs are not supported)'), { retryable: false });
  return tryCodex(system, prompt, { db: opts.db, env, job: opts.job, now: opts.now, search: Boolean(opts.search) });
}

export function extractJson(text) {
  try {
    const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const start = raw.search(/[[{]/);
    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (start < 0 || end < start) throw new Error('LLM did not return JSON');
    return JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { maxAttempts: 2 });
  }
}

export async function completeJson(system, prompt, opts) {
  return extractJson(await complete(system + '\nReply with JSON only.', prompt, opts));
}
