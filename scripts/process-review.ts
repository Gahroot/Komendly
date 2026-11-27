// Weekly process review: reads incident + owner_intervention events, writes one 'process_finding' AdsEvent per ranked finding
// (dedupe: skips a key already written in the last 6 days). Dry by default.  Run: set -a; . ./.env.local; set +a;
//   npx tsx scripts/process-review.ts            # prints the analysis
//   npx tsx scripts/process-review.ts --apply    # also records process_finding events
import { PrismaClient } from "@prisma/client";
import { loadProcessAnalysis } from "../src/lib/ops/qa/process-load";
import { PROCESS_FINDING_EVENT } from "../src/lib/ops/qa/process-improvement";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const a = await loadProcessAnalysis(db);
    console.log(`verdict: ${a.verdict}`);
    console.log("current :", JSON.stringify(a.current));
    console.log("previous:", JSON.stringify(a.previous));
    for (const f of a.findings.slice(0, 10)) console.log(`#${f.score} ${f.title} (${f.evidence})\n   fix: ${f.proposedFix}`);
    if (!apply) return console.log("\n(dry run: pass --apply to record process_finding events)");
    const since = new Date(Date.now() - 6 * 86_400_000);
    for (const f of a.findings.slice(0, 10)) {
      const dup = await db.adsEvent.findFirst({ where: { name: PROCESS_FINDING_EVENT, createdAt: { gte: since }, props: { path: ["key"], equals: f.key } }, select: { id: true } });
      if (!dup) await db.adsEvent.create({ data: { name: PROCESS_FINDING_EVENT, props: { ...f } } });
    }
    console.log("recorded.");
  } finally {
    await db.$disconnect();
  }
}
main();
