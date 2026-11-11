// LLM routing. The blog engine is Codex-only by default (owner: "use codex subscription for it all"): every AI call runs on
// the owner's ChatGPT/Codex subscription and no paid API is ever called. When Codex is temporarily unavailable, jobs are
// deferred and retried hourly.
export function codexOnly(env = process.env) {
  const order = String(env.LLM_PROVIDER_ORDER ?? 'codex').split(',').map((s) => s.trim()).filter(Boolean);
  return order.length === 1 && order[0] === 'codex';
}

/** A job that must wait (Codex backing off, logged out, weekly cap, daytime...): not a failure, retried next hour. */
export class DeferError extends Error {
  constructor(message) {
    super(message);
    this.defer = true;
    this.retryable = false;
  }
}
