// Adapter: strategy-engine ObjectiveState (src/lib/exec/objectives.ts) -> the coordinator's ObjectiveLite + concrete dispatch actions.
// The strategy engine decides WHAT (outcome, acceptance, authority); the coordinator derives HOW from the objective type, always inside the
// allow-list. Code changes are never executed: type "build" becomes a build_request.
import type { DispatchAction, ObjectiveLite } from "./coordinator";
import type { ObjectiveState } from "./objectives";

const crit = (c: { metric: string; comparator: string; target: number | null; windowDays: number }) => `${c.metric} ${c.comparator} ${c.target ?? "(observe)"} within ${c.windowDays} days`;

export function actionsForObjective(s: ObjectiveState, ctx: { approvedTemplates: readonly string[] }): DispatchAction[] {
  const sp = s.spec, out: DispatchAction[] = [];
  const first = sp.acceptance[0];
  if (first) out.push({ type: "checkpoint", metric: first.metric, dueInDays: Math.max(1, Math.min(first.windowDays || 14, 30)), question: `Has "${sp.title}" produced a readable signal on ${first.metric}?` });
  const allowed = sp.authority.actions;
  if (sp.type === "build") {
    out.push({ type: "build_request", title: sp.title, kind: sp.strategy, spec: [sp.outcome, "", `Why: ${sp.justification}`, ...(sp.verification.length ? ["", "Verification:", ...sp.verification] : [])].join("\n"), acceptance: sp.acceptance.length ? sp.acceptance.map(crit) : ["Owner confirms the outcome is met"] });
  } else if (sp.type === "evidence_gathering" && allowed.includes("ask_customers")) {
    const t = ctx.approvedTemplates[0];
    out.push(t ? { type: "evidence_task", templateId: t, note: sp.title }
      : { type: "owner_decision", question: `Approve a short customer-interview email so "${sp.title}" can ask real customers?`, options: [{ id: "approve", label: "Approve (I will add the template)" }, { id: "skip", label: "Skip, rely on replies" }], recommended: "approve", why: "Conversations with buyers are the highest-value evidence while pre-revenue." });
  } else if ((sp.type === "experiment" || sp.type === "operate") && allowed.includes("optimizer_run_request")) {
    out.push({ type: "optimizer_run_request", focus: sp.constraintId ?? sp.strategy, reason: sp.title });
  }
  return out;
}

export function toLite(s: ObjectiveState, ctx: { approvedTemplates: readonly string[] }): ObjectiveLite {
  const sp = s.spec;
  return { id: sp.id, title: sp.title, status: s.status, kind: sp.strategy, metric: sp.acceptance[0]?.metric, constraint: sp.constraintId, createdAt: s.updatedAt ?? new Date(0).toISOString(), updatedAt: s.updatedAt, actions: actionsForObjective(s, ctx), approvedBy: s.approval };
}
