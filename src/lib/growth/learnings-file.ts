// Node-only wrapper: append one entry to docs/growth-ecosystem/learnings.md (run from scripts or tooling, not on Vercel:
// the deployed filesystem is read-only). Pure logic lives in ecosystem.ts.
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { formatLearning, type LearningEntry } from "./ecosystem";

export const LEARNINGS_PATH = path.join(process.cwd(), "docs", "growth-ecosystem", "learnings.md");

export async function readLearnings(file = LEARNINGS_PATH): Promise<string> {
  return readFile(file, "utf8").catch(() => "");
}

/** Appends with fs.appendFile so existing content can never be rewritten. */
export async function appendLearningToFile(e: LearningEntry, file = LEARNINGS_PATH): Promise<void> {
  const existing = await readLearnings(file);
  const sep = existing.trim() ? (existing.endsWith("\n") ? "\n" : "\n\n") : "";
  await appendFile(file, sep + formatLearning(e), "utf8");
}
