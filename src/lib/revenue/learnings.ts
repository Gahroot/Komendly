// Node-only helper: append one entry to docs/revenue/learnings.md (append-only; run from scripts/tooling, not on Vercel).
// Format is shared with the growth ecosystem log (formatLearning). Never rewrites existing text.
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { formatLearning, type LearningEntry } from "../growth/ecosystem";

export const REVENUE_LEARNINGS_PATH = path.join(process.cwd(), "docs", "revenue", "learnings.md");

export async function appendRevenueLearning(e: LearningEntry, file = REVENUE_LEARNINGS_PATH): Promise<void> {
  const existing = await readFile(file, "utf8").catch(() => "");
  const sep = existing.trim() ? (existing.endsWith("\n") ? "\n" : "\n\n") : "";
  await appendFile(file, sep + formatLearning(e), "utf8");
}
