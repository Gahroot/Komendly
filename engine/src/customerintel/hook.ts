// Plan-prompt hook for customer memory.
// Two flags, both default OFF: sys_customer_memory (build the memory + weekly "what we learned") and
// sys_customer_memory_planner (let the planner see a STYLE-ONLY block). Earlier blind tests showed planner-side memory
// lowered quality, so when the planner flag is on it is A/B-guarded: a deterministic 50% holdout per run, and every
// decision is logged as AdsEvent `memory_ab` {arm} so creative_score can be compared by arm before anyone trusts it.
// The block is appended to the (untrusted-wrapped) brand-history memory, so it is data, not instructions.
import { formatStyleContext } from "../../../src/lib/customer-intel/memory";
import { getCustomerMemory, memoryEnabled } from "../../../src/lib/customer-intel/server";
import type { Db } from "../db";

export const PLANNER_FLAG = "sys_customer_memory_planner";
export const AB_EVENT = "memory_ab";

/** Deterministic arm from the run id (stable across retries). */
export function memoryArm(runId: string): "treatment" | "holdout" {
  let h = 0;
  for (const c of runId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 2 === 0 ? "treatment" : "holdout";
}

async function plannerEnabled(db: Db): Promise<boolean> {
  try { return Boolean((await db.adsFeatureFlag.findUnique({ where: { key: PLANNER_FLAG } }))?.enabled); } catch { return false; }
}

export async function memoryPromptForRun(db: Db, run: { id?: string; workspaceId: string; brandProfileId?: string | null }): Promise<string> {
  try {
    if (!(await memoryEnabled(db)) || !(await plannerEnabled(db))) return "";
    const arm = memoryArm(run.id ?? run.workspaceId);
    const block = arm === "treatment" ? formatStyleContext(await getCustomerMemory(db, run.workspaceId, run.brandProfileId ?? null)) : "";
    if (run.id && !(await db.adsEvent.findFirst({ where: { name: AB_EVENT, runId: run.id }, select: { id: true } })))
      await db.adsEvent.create({ data: { name: AB_EVENT, workspaceId: run.workspaceId, runId: run.id, props: { arm, injected: Boolean(block) } } });
    return block;
  } catch {
    return "";
  }
}

import { recordWeeklyLearned } from "../../../src/lib/customer-intel/server";

/** Weekly email paragraphs: measured "what we learned" lines (flag sys_customer_memory; [] when off, empty or on any error). */
export async function learnedParagraphs(db: Db, workspaceId: string, brandId: string | null, now = new Date()): Promise<string[]> {
  try {
    if (!(await memoryEnabled(db))) return [];
    const l = await recordWeeklyLearned(db, workspaceId, brandId, now);
    return l && l.measured ? ["What we've learned about your business so far:", ...l.lines.slice(0, 3).map((x) => `• ${x}`)] : [];
  } catch {
    return [];
  }
}
