// Plan-prompt hook for customer memory. Behind AdsFeatureFlag sys_customer_memory (default OFF); returns "" otherwise.
// Used by jobs/plan.ts. The block is appended to the (untrusted-wrapped) brand-history memory, so it is data, not instructions.
import { customerMemoryPrompt } from "../../../src/lib/customer-intel/server";
import type { Db } from "../db";

export async function memoryPromptForRun(db: Db, run: { workspaceId: string; brandProfileId?: string | null }): Promise<string> {
  return customerMemoryPrompt(db, run.workspaceId, run.brandProfileId ?? null);
}

import { memoryEnabled, recordWeeklyLearned } from "../../../src/lib/customer-intel/server";

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
