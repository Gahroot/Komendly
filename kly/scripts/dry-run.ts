// Kly dry run: one cycle against the DB without sending. Finds + qualifies leads for one niche/city, starts their hook-ad
// gifts (the engine processing this DB makes them), judges them (regenerating once), then writes each would-be email
// to OUTBOUND_DRY_RUN_DIR. Never touches SMTP or IMAP.
//   set -a; . ../.env.local; set +a; OUTBOUND_DRY_RUN=1 OUTBOUND_DRY_RUN_DIR=/path npx tsx scripts/dry-run.ts --niche roofers --city "Denver, CO" --count 3 [--wait-min 20] [--reuse]
import { createKlyAI } from "../src/ai";
import { seededRng } from "../src/arms";
import { createDb } from "../src/db";
import { findLeads } from "../src/finder";
import { startHookAds, syncLeadAds } from "../src/hook";
import { qualifierFor } from "../src/loop";
import { outboundEnv, writeDryRun } from "../src/sender";
import { getSettings } from "../src/settings";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};

async function main(): Promise<void> {
  if (process.env.OUTBOUND_DRY_RUN !== "1") throw new Error("set OUTBOUND_DRY_RUN=1");
  const db = createDb();
  const cfg = outboundEnv();
  const s = await getSettings(db);
  const ai = createKlyAI(db);
  if (!ai) console.warn("no Codex login: leads are not qualified, ads are not judged (they stay pending)");
  const rng = seededRng(Date.now() & 0xffffffff);
  const niche = opt("--niche", "roofers");
  const city = opt("--city", "Denver, CO");
  const count = Number(opt("--count", "3"));
  let leadIds: string[];
  if (argv.includes("--reuse")) {
    leadIds = (await db.outboundLead.findMany({ where: { niche, status: { in: ["found", "ad_made"] } }, orderBy: { createdAt: "desc" }, take: count, select: { id: true } })).map((l) => l.id);
  } else {
    const run = await db.outboundRun.create({ data: { niche, cities: [city], count, createdBy: "dry-run", status: "running" } });
    const r = await findLeads({ db, qualify: qualifierFor(ai, niche), minScore: s.minLeadScore }, { runId: run.id, niche, cities: [city], count });
    await db.outboundRun.update({ where: { id: run.id }, data: { status: "done", found: r.created.length, result: { skipped: r.skipped } } });
    console.log(`finder: ${r.created.length} qualified leads; skipped ${JSON.stringify(r.skipped)}`);
    const all = await db.outboundLead.findMany({ where: { runId: run.id }, select: { businessName: true, domain: true, score: true, status: true } });
    for (const l of all) console.log(`  ${l.businessName} (${l.domain}) score=${l.score ?? "-"} ${l.status}`);
    leadIds = r.created;
  }
  const deadline = Date.now() + Number(opt("--wait-min", "20")) * 60_000;
  for (;;) {
    await startHookAds(db, { limit: count, senderName: cfg.senderName, minScore: s.minLeadScore, rng, explorationPct: s.explorationPct, leadIds });
    const r = await syncLeadAds({ db, provider: ai?.provider ?? null, base: cfg.base, minQualityScore: s.minQualityScore, followUpDays: s.followUpDays, leadIds });
    const pending = await db.outboundLead.count({ where: { id: { in: leadIds }, status: "found" } });
    console.log(`${new Date().toISOString()} gifts: made ${r.made} rejected ${r.rejected} retried ${r.retried} failed ${r.failed}; pending ${pending}/${leadIds.length}`);
    if (pending === 0 || Date.now() > deadline) break;
    await new Promise((res) => setTimeout(res, 20_000));
  }
  const leads = await db.outboundLead.findMany({ where: { id: { in: leadIds } }, select: { businessName: true, status: true, qualityScore: true, qualityNotes: true, giftAttempts: true, error: true } });
  for (const l of leads) console.log(`  ${l.businessName}: ${l.status} quality=${l.qualityScore ?? "-"} attempts=${l.giftAttempts} ${l.error ?? ""} ${l.qualityNotes ?? ""}`);
  const files = await writeDryRun(db, ai?.provider ?? null, cfg, { leadIds, rng, explorationPct: s.explorationPct });
  console.log(`dry-run files:\n${files.join("\n") || "(none)"}`);
  await db.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
