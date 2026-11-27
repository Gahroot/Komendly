// Runs the revenue pipeline (loadEconomicsInput -> computeEconomics -> diagnoseConstraint -> businessStage) READ-ONLY against the real DB.
// Writes nothing (any non-read call throws). Usage: set -a; . ./.env.local; set +a; npx tsx scripts/revenue-dry-run.ts [--json]
// For production: DATABASE_URL=$(cat /tmp/.kdb) npx tsx scripts/revenue-dry-run.ts
import { PrismaClient } from "@prisma/client";
import { loadEconomicsInput } from "../src/lib/revenue/economics";
import { snapshotFromInput } from "../src/lib/revenue/snapshot";

const READ_ONLY = new Set(["findMany", "findFirst", "findUnique", "count", "groupBy", "aggregate"]);
function readOnly(db: PrismaClient): PrismaClient {
  const guard = (target: object): object => new Proxy(target, { get(t, k) { const v = (t as Record<string | symbol, unknown>)[k]; if (typeof v === "function" && typeof k === "string" && !READ_ONLY.has(k)) return () => { throw new Error(`dry-run: blocked write ${k}`); }; return v; } });
  return new Proxy(db, { get(t, k) { const v = (t as unknown as Record<string | symbol, unknown>)[k]; return v && typeof v === "object" && typeof k === "string" && !k.startsWith("$") ? guard(v as object) : typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v; } });
}

async function main() {
  const db = new PrismaClient();
  try {
    const input = await loadEconomicsInput(readOnly(db), new Date(), 90);
    const { economics: eco, constraints, stage } = snapshotFromInput(input);
    if (process.argv.includes("--json")) { console.log(JSON.stringify({ eco, constraints, stage }, null, 2)); return; }
    console.log(`payingCustomers=${eco.payingCustomers} subscribers=${input.subscribers.length} payments=${input.payments.length} revenue(all)=${eco.revenue.allTimeCents}c window=${eco.revenue.windowCents}c`);
    console.log(`funnel ${JSON.stringify(eco.funnel)}`);
    console.log(`cac=${JSON.stringify(eco.cacCents)} payback=${JSON.stringify(eco.payback30)}`);
    console.log(`costs ${JSON.stringify(eco.costs)} cash ${JSON.stringify(eco.cashFlow)}`);
    console.log(`stage ${JSON.stringify(stage)}`);
    console.log(`top constraints: ${constraints.slice(0, 3).map((c) => `${c.key} (${c.severity.toFixed(2)})`).join(" | ")}`);
  } finally { await db.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
