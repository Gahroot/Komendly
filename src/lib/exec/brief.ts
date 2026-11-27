// Weekly executive brief (pure): ONE Monday email, <= 15 lines, plain English, only changes + decisions + what is next + what was learned.
// Absorbs the revenue digest / optimiser digest / ops brief when sys_exec_brief is on (see digest-dedupe.ts).
import type { EvidenceLine } from "./validation-mode";
import { scoreboardSentence } from "./validation-mode";

export interface ExecBriefInput {
  weekLabel: string; adminUrl: string; stage: string; modeBanner: string;
  constraint: { label: string; confidence: string } | null; previousConstraint: string | null;
  objectiveChanges: string[]; learned: string[]; decisions: Array<{ question: string; recommended: string }>; next: string[];
  topRisk: { title: string; isNew: boolean } | null; scoreboardGap: EvidenceLine | null; absorbedDigests?: string[];
  ownerWaitingOnSystem?: string[];
}
export const BRIEF_MAX_LINES = 15;

export function buildExecBrief(i: ExecBriefInput): { subject: string; text: string; lines: string[]; hasContent: boolean } {
  const L: string[] = [];
  const changedConstraint = i.constraint && i.constraint.label !== i.previousConstraint;
  if (changedConstraint) L.push(`The one thing in the way is now: ${i.constraint!.label} (${i.constraint!.confidence} confidence).`);
  for (const c of i.objectiveChanges.slice(0, 3)) L.push(c);
  for (const x of i.learned.slice(0, 2)) L.push(`Learned: ${x}`);
  if (i.topRisk?.isNew) L.push(`New risk: ${i.topRisk.title}.`);
  if (i.decisions.length) { L.push("Needs you:"); for (const d of i.decisions.slice(0, 3)) L.push(`- ${d.question} I recommend: ${d.recommended}.`); if (i.decisions.length > 3) L.push(`- (+${i.decisions.length - 3} more on the page)`); }
  const hasChange = L.length > 0;
  if (i.next.length) L.push(`Next: ${i.next.slice(0, 2).join("; ")}.`);
  if (i.scoreboardGap && !i.scoreboardGap.met) L.push(`Waiting on evidence: ${scoreboardSentence(i.scoreboardGap)}.`);
  const body = L.slice(0, BRIEF_MAX_LINES - 3);
  const footer = [i.modeBanner.split(":")[0] + ` (${i.stage}).`, `Details: ${i.adminUrl}`];
  if (i.absorbedDigests?.length) footer.unshift(`This replaces the separate ${i.absorbedDigests.join(", ")}.`);
  const needs = i.decisions.length;
  const text = [...(body.length ? body : ["No change this week and nothing needs you: operations are running and evidence is accumulating."]), "", ...footer].slice(0, BRIEF_MAX_LINES).join("\n");
  return { subject: `Executive brief ${i.weekLabel}${needs ? `: ${needs} decision${needs === 1 ? "" : "s"} for you` : hasChange ? ": what changed" : ": no change"}`, text, lines: body, hasContent: hasChange };
}
