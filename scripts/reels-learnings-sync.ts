// Append the weekly reel learnings (AdsEvent reel_learning, written by kly's weekly insights job) to docs/growth-ecosystem/learnings.md.
// Usage: npx tsx --env-file=.env.local scripts/reels-learnings-sync.ts   (idempotent: skips weeks already in the file)
import { PrismaClient } from "@prisma/client";
import { appendLearningToFile, readLearnings } from "../src/lib/growth/learnings-file";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const rows = await prisma.adsEvent.findMany({ where: { name: "reel_learning" }, orderBy: { createdAt: "asc" }, take: 60 });
  const existing = await readLearnings();
  let n = 0;
  for (const r of rows) {
    const p = r.props as { week?: string; title?: string; note?: string; unavailable?: boolean };
    if (!p.week || !p.title || !p.note || existing.includes(p.title)) continue;
    await appendLearningToFile({ date: r.createdAt.toISOString().slice(0, 10), kind: p.unavailable ? "assumption" : "evidence", title: p.title, note: p.note, source: `AdsEvent reel_learning ${p.week} (Graph insights via kly reelInsightsTick)` });
    n++;
  }
  console.log(`appended ${n} learning(s)`);
  await prisma.$disconnect();
}
void main();
