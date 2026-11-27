// Runs the executive strategic cycle in DRY-RUN against the real DB, READ-ONLY, and prints what it WOULD do. Writes nothing, sends nothing.
// Usage: set -a; . ./.env.local; set +a; npx tsx scripts/exec-dry-run.ts [--json]
import { PrismaClient } from "@prisma/client";
import { describe, strategicCycle } from "../src/lib/exec/strategic-cycle";
import { loadCycleInput } from "../src/lib/exec/load";
import { scoreboardSentence } from "../src/lib/exec/validation-mode";

const READ_ONLY = new Set(["findMany", "findFirst", "findUnique", "count", "groupBy", "aggregate"]);
function readOnly(db: PrismaClient): PrismaClient {
  const guard = (target: object): object => new Proxy(target, { get(t, k) { const v = (t as Record<string | symbol, unknown>)[k]; if (typeof v === "function" && typeof k === "string" && !READ_ONLY.has(k) && !k.startsWith("$") ) return () => { throw new Error(`dry-run: blocked write ${k}`); }; return v; } });
  return new Proxy(db, { get(t, k) { const v = (t as unknown as Record<string | symbol, unknown>)[k]; return v && typeof v === "object" && typeof k === "string" && !k.startsWith("$") ? guard(v as object) : typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v; } });
}

async function main() {
  const db = new PrismaClient();
  try {
    const { input, measured, blocked } = await loadCycleInput(readOnly(db), new Date(), "/admin/ads/executive");
    const out = strategicCycle(input);
    if (process.argv.includes("--json")) { console.log(JSON.stringify({ stage: out.stage, planned: out.planned, rejected: out.rejected, allocation: out.allocation, risks: out.risks, brief: out.brief }, null, 2)); return; }
    console.log(`DRY RUN (nothing written)\nStage: ${out.stage}  Mode: ${out.mode}  Strategy: ${out.strategy}\n${out.banner}\n`);
    console.log(`Measured: ${JSON.stringify(measured.metrics)}; overrides blocking: ${blocked.length}`);
    console.log("\nEvidence scoreboard:"); for (const l of out.scoreboard) console.log(`  - ${scoreboardSentence(l)}`);
    console.log(`\nObjectives (${out.tracked.length}):`); for (const t of out.tracked) console.log(`  - [${t.status}] ${t.title} | phase ${t.phase} | owner ${t.owner}${t.stalled ? " | STALLED" : ""}${t.duplicateOf ? ` | DUP of ${t.duplicateOf}` : ""}`);
    console.log(`\nWould dispatch (${out.planned.length}):`); for (const p of out.planned) console.log(`  - ${p.objectiveId}: ${describe(p.action)} (undo: ${p.undo})`);
    console.log(`\nWould reject (${out.rejected.length}):`); for (const r of out.rejected) console.log(`  - ${r.objectiveId}: ${r.reason}`);
    console.log("\nPerformance:"); for (const r of out.performance) console.log(`  ${r.rank}. ${r.title} -> ${r.recommendation} (${r.verdict}, ${r.confidence}): ${r.evidence}`);
    console.log("\nAllocation (spend $0):"); for (const l of out.allocation.lines) console.log(`  - ${l.label}: ${l.status}${l.allotted ? ` ${l.allotted} ${l.resource}` : ""}`);
    console.log("\nTop risks:"); for (const r of out.risks) console.log(`  - ${r.score} ${r.title}`);
    console.log("\nOrganisation findings:"); for (const f of out.org.findings.slice(0, 8)) console.log(`  - ${f.message}`);
    console.log(`\nWould email? ${out.brief.hasContent ? "yes (Monday)" : "no (no change, nothing needs you)"}\n---\n${out.brief.subject}\n${out.brief.text}`);
  } finally { await db.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
