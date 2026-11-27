// Optimiser step (f): the weekly plain-English digest to the owner. Reads like a short human update, not a dashboard dump.
import type { Diagnosis } from "./diagnose";
import type { Decision } from "./actions";

export interface ActionOutcome { type: string; reason: string; result: string; ok: boolean; dryRun: boolean; evidence_level: string }
export interface DigestInput { week: string; diagnosis: Diagnosis; decision: Decision | null; outcomes: ActionOutcome[]; rejected: Array<{ type: string; reason: string }>; ownerItems: Array<{ title: string; detail: string }>; dryRun: boolean; adminUrl: string }

const STAGE_TEXT: Record<string, string> = { pre_revenue: "pre-revenue (no paying customers yet)", first_customers: "finding the first 10 customers", early_traction: "early traction", scaling: "scaling" };
const CONSTRAINT_LABEL: Record<string, string> = { volume: "not enough people reaching us" };

export function buildDigest(i: DigestInput): { subject: string; text: string } {
  const c = i.diagnosis.constraint;
  const label = CONSTRAINT_LABEL[c.name] ?? c.name.replace(/_to_/g, " to ").replace(/_/g, " ");
  const ran = i.outcomes.filter((o) => o.ok);
  const failed = i.outcomes.filter((o) => !o.ok);
  const L: string[] = [];
  L.push(`Hi Nolan, here is the week (${i.week}).${i.dryRun ? " DRY RUN: nothing below was actually changed." : ""}`, "");
  L.push(`Where we are: ${STAGE_TEXT[i.diagnosis.stage] ?? i.diagnosis.stage}. The one thing holding us back is ${label}. ${c.detail} (${c.level}, ${c.n} people behind it).`);
  if (i.diagnosis.cautions.length) L.push(`Caution: ${i.diagnosis.cautions.slice(0, 2).join(" ")}`);
  L.push("");
  if (ran.length) { L.push(i.dryRun ? "What I would have done:" : "What I did:"); for (const o of ran) L.push(`- ${o.result} (${o.evidence_level}: ${o.reason})`); }
  else L.push("What I did: nothing changed this week, which is fine when the evidence is thin.");
  if (failed.length) L.push(`${failed.length} action(s) failed and were skipped: ${failed.map((o) => o.type).join(", ")}.`);
  if (i.rejected.length) L.push(`${i.rejected.length} idea(s) were blocked by the safety rules (e.g. ${i.rejected[0]!.reason}).`);
  L.push("");
  const learnings = i.decision?.learnings ?? [];
  if (learnings.length) { L.push("What I learned:"); for (const l of learnings) L.push(`- [${l.kind === "evidence" ? "evidence" : "assumption, not yet proven"}] ${l.title}: ${l.note}`); L.push(""); }
  if (i.decision?.next_week) L.push(`Next week: ${i.decision.next_week}`, "");
  if (i.ownerItems.length) { L.push("Needs you:"); for (const o of i.ownerItems) L.push(`- ${o.title}: ${o.detail}`); L.push(""); }
  else L.push("Needs you: nothing this week.", "");
  L.push(`Every action and how to undo it: ${i.adminUrl}`);
  return { subject: `Weekly business update: ${label}${i.ownerItems.length ? `, ${i.ownerItems.length} for you` : ""}`, text: L.join("\n") };
}
