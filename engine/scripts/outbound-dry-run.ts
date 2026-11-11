// Outbound dry run against the DEV DB: find leads, make their hook ads (needs an engine processing jobs, e.g. a local
// `npm run dev`), then write each would-be email to OUTBOUND_DRY_RUN_DIR. Sends nothing, never touches SMTP.
//   set -a; . ../.env.local; set +a; OUTBOUND_DRY_RUN=1 OUTBOUND_DRY_RUN_DIR=/path npx tsx scripts/outbound-dry-run.ts --niche roofers --city "Denver, CO" --count 5
import { createDb } from "../src/db";
import { createProvider } from "../src/providers/index";
import { syncLeadAds, startHookAds } from "../src/outbound/hook";
import { processRunRequest } from "../src/outbound/loop";
import { outboundEnv, writeDryRun } from "../src/outbound/sender";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};

async function main(): Promise<void> {
  if (process.env.OUTBOUND_DRY_RUN !== "1") throw new Error("set OUTBOUND_DRY_RUN=1");
  const db = createDb();
  const cfg = outboundEnv();
  const niche = opt("--niche", "roofers");
  const city = opt("--city", "Denver, CO");
  const count = Number(opt("--count", "5"));
  const reuse = argv.includes("--reuse");
  let leadIds: string[];
  if (reuse) {
    leadIds = (await db.outboundLead.findMany({ where: { niche }, orderBy: { createdAt: "desc" }, take: count, select: { id: true } })).map((l) => l.id);
  } else {
    const run = await db.outboundRun.create({ data: { niche, cities: [city], count, createdBy: "dry-run" } });
    // processRunRequest takes the oldest pending run: make sure it is ours.
    await db.outboundRun.updateMany({ where: { status: "pending", id: { not: run.id } }, data: { status: "failed", result: { error: "superseded by dry run" } } });
    await processRunRequest(db);
    const done = await db.outboundRun.findUniqueOrThrow({ where: { id: run.id } });
    console.log(`finder: ${done.found} leads`, JSON.stringify(done.result));
    leadIds = (await db.outboundLead.findMany({ where: { runId: run.id }, select: { id: true } })).map((l) => l.id);
  }
  await startHookAds(db, { senderName: cfg.senderName, limit: count });
  const deadline = Date.now() + Number(opt("--wait-min", "40")) * 60_000;
  for (;;) {
    await syncLeadAds(db);
    const pending = await db.outboundLead.count({ where: { id: { in: leadIds }, status: "found" } });
    console.log(`${new Date().toISOString()} hook ads pending: ${pending}/${leadIds.length}`);
    if (pending === 0 || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 20_000));
  }
  const provider = argv.includes("--no-ai") ? null : createProvider(process.env.AI_PROVIDER === "openai" ? "openai" : "codex");
  const files = await writeDryRun(db, provider, cfg, { leadIds });
  console.log(files.join("\n"));
  await db.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
