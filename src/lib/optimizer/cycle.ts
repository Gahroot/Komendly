// The weekly optimiser cycle, pure orchestration with injected I/O (engine/src/optimizer/run.ts supplies the real deps).
// gather -> diagnose (code) -> decide (Codex, strict JSON) -> validate (guardrails) -> execute (per-action try/catch) -> learn -> report.
import { DECISION_JSON_SCHEMA, isoWeekKey, parseDecision, shouldRunCycle, validateActions, type Decision, type GuardContext, type ValidAction } from "./actions";
import { buildDigest, type ActionOutcome } from "./digest";
import { diagnose, type Diagnosis, type SnapshotView } from "./diagnose";
import { buildOptimizerPrompt, OPTIMIZER_SYSTEM } from "./prompt";

export const DEFAULT_MAX_CALLS = 12;

export interface Gathered { snapshot: SnapshotView | null; payingCustomers: number | null; facts: Record<string, unknown>; guard: Omit<GuardContext, "now"> }
export interface CycleDeps {
  now: Date;
  env: { OPTIMIZER_MAX_CALLS?: string; OPTIMIZER_DRY_RUN?: string };
  forced: boolean;
  /** Kill switch (flag sys_optimizer). */
  enabled(): Promise<boolean>;
  lastWeek(): Promise<string | null>;
  gather(): Promise<Gathered>;
  decide(req: { system: string; prompt: string; jsonSchema: Record<string, unknown> }): Promise<{ json?: unknown; text: string }>;
  execute(a: ValidAction, ctx: { dryRun: boolean; week: string }): Promise<string>;
  /** Writes AdsEvent rows (optimizer_action, optimizer_learning, optimizer_cycle...). */
  record(name: string, props: Record<string, unknown>): Promise<void>;
  sendDigest?(mail: { subject: string; text: string }): Promise<void>;
  digestEnabled?(): Promise<boolean>;
  adminUrl: string;
}
export type CycleResult =
  | { status: "skipped"; reason: "disabled" | "already_ran" }
  | { status: "failed"; error: string; calls: number }
  | { status: "ok"; week: string; calls: number; dryRun: boolean; executed: number; failed: number; rejected: number; diagnosis: Diagnosis; digestSent: boolean };

export const maxCalls = (env: CycleDeps["env"]) => { const n = Number(env.OPTIMIZER_MAX_CALLS); return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_CALLS; };

export async function runOptimizerCycle(d: CycleDeps): Promise<CycleResult> {
  if (!(await d.enabled())) return { status: "skipped", reason: "disabled" };
  const week = isoWeekKey(d.now);
  if (!shouldRunCycle(await d.lastWeek(), d.now, d.forced)) return { status: "skipped", reason: "already_ran" };
  const dryRun = d.env.OPTIMIZER_DRY_RUN === "1";
  const budget = maxCalls(d.env);
  let calls = 0;
  try {
    const g = await d.gather();
    const diag = diagnose(g.snapshot, { payingCustomers: g.payingCustomers });
    const ctx: GuardContext = { ...g.guard, now: d.now };
    let decision: Decision | null = null;
    // One call, one retry on malformed output; both count against the budget. Malformed twice = fail closed (no actions).
    for (let attempt = 0; attempt < 2 && !decision; attempt++) {
      if (calls >= budget) throw new Error(`inference budget exhausted (${budget} calls)`);
      calls++;
      const r = await d.decide({
        system: OPTIMIZER_SYSTEM,
        prompt: buildOptimizerPrompt(diag, g.facts, { experiments: ctx.experiments, proposals: ctx.proposals, arms: ctx.arms.filter((a) => a.status !== "retired").slice(0, 40), suspendCandidates: ctx.channels.filter((c) => c.flag) }),
        jsonSchema: DECISION_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      decision = parseDecision(r.json ?? r.text);
    }
    if (!decision) throw new Error("model output malformed twice: no actions taken (fail closed)");

    const { valid, rejected } = validateActions(decision, ctx);
    const outcomes: ActionOutcome[] = [];
    const ownerItems: Array<{ title: string; detail: string }> = [];
    for (const v of valid) {
      const base = { type: v.type, reason: v.action.reason, evidence: v.action.evidence, evidence_level: v.action.evidence_level, sample_size: v.action.sample_size, reversible: v.reversible, params: v.params, week, dryRun };
      try {
        const result = await d.execute(v, { dryRun, week });
        await d.record("optimizer_action", { ...base, ok: true, result: dryRun ? `DRY RUN: would ${result}` : result });
        outcomes.push({ type: v.type, reason: v.action.reason, result: dryRun ? `would ${result}` : result, ok: true, dryRun, evidence_level: v.action.evidence_level });
        if (v.type === "owner_decision") ownerItems.push({ title: v.action.title, detail: v.action.detail });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await d.record("optimizer_action", { ...base, ok: false, result: `failed: ${msg}` }).catch(() => undefined);
        outcomes.push({ type: v.type, reason: v.action.reason, result: msg, ok: false, dryRun, evidence_level: v.action.evidence_level });
      }
    }
    for (const r of rejected) await d.record("optimizer_action", { type: r.action.type, reason: r.action.reason, rejected: true, result: `rejected: ${r.reason}`, week, dryRun, reversible: "n/a (not executed)" }).catch(() => undefined);

    for (const l of decision.learnings) {
      await d.record("optimizer_learning", { claim: l.title, note: l.note, level: l.kind === "evidence" ? "measured" : "assumed", source: l.source || "optimizer", sampleSize: 0, week, stage: diag.stage, constraint: diag.constraint.name }).catch(() => undefined);
    }

    let digestSent = false;
    if (d.sendDigest && d.digestEnabled && (await d.digestEnabled())) {
      try {
        await d.sendDigest(buildDigest({ week, diagnosis: diag, decision, outcomes, rejected: rejected.map((r) => ({ type: r.action.type, reason: r.reason })), ownerItems, dryRun, adminUrl: d.adminUrl }));
        digestSent = true;
      } catch { /* digest failure never fails the cycle */ }
    }
    const failed = outcomes.filter((o) => !o.ok).length;
    await d.record("optimizer_cycle", { week, ok: true, dryRun, calls, executed: outcomes.length - failed, failed, rejected: rejected.length, stage: diag.stage, constraint: diag.constraint.name, digestSent, forced: d.forced });
    return { status: "ok", week, calls, dryRun, executed: outcomes.length - failed, failed, rejected: rejected.length, diagnosis: diag, digestSent };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await d.record("optimizer_cycle", { week, ok: false, error, calls, dryRun, forced: d.forced }).catch(() => undefined);
    return { status: "failed", error, calls };
  }
}
