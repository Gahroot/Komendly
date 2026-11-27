// READ-ONLY live audit of the product-intel analyzers (SELECTs via Prisma findMany only; no writes).
// Usage: DATABASE_URL="$(cat /tmp/.kdb)" npx tsx scripts/audit-product-live.ts [email]
import { PrismaClient } from "@prisma/client";
import { scorePackPure, type AdCopy } from "../src/lib/product-intel/creative";
import { computeDeliveryEcon, loadEconInput } from "../src/lib/product-intel/delivery-econ";
import { loadOutcomes } from "../src/lib/product-intel/load";
import { buildReliabilitySnapshot, loadReliabilityInput } from "../src/lib/product-intel/reliability";

const db = new PrismaClient();
const now = new Date();
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
async function main() {
  const email = process.argv[2] ?? "mtplanton@comcast.net";
  const win = 30;
  const snap = buildReliabilitySnapshot(await loadReliabilityInput(db as never, now, win));
  console.log("RELIABILITY", JSON.stringify({ windowDays: win, slo: snap.slo, ttf: snap.timeToFirstAdMs, ttp: snap.timeToPackMs, stages: snap.failureByStage?.slice(0, 6) }));
  const econ = computeDeliveryEcon(await loadEconInput(db as never, now, win));
  console.log("ECON", JSON.stringify({ perPack: econ.costPerPackUsd, perAd: econ.costPerAdUsd, perVideo: econ.costPerVideoUsd, perCredit: econ.costPerCreditUsd, freePack: econ.freePackAcquisitionCostUsd, confidence: econ.confidence, hot: econ.hotspots.slice(0, 4) }));
  // creative copy checks over real recent finished (non-gift) packs; image metrics need S3 so they are skipped (metrics: null).
  const runs = await db.adRun.findMany({ where: { kind: { not: "gift" }, status: { in: ["completed", "partial"] }, completedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, orderBy: { completedAt: "desc" }, take: 25, select: { id: true, workspaceId: true, brandProfileId: true } });
  const tally: Record<string, number> = {}; const scores: number[] = []; let ads = 0;
  for (const r of runs) {
    const [brand, list] = await Promise.all([
      r.brandProfileId ? db.brandProfile.findUnique({ where: { id: r.brandProfileId }, select: { name: true, mainOffer: true, logoKey: true } }) : null,
      db.ad.findMany({ where: { runId: r.id, status: "ready", kind: "static" }, orderBy: { index: "asc" }, take: 30, select: { id: true, index: true, kind: true, awareness: true, angle: true, hook: true, headline: true, body: true, cta: true, claims: true, visualBrief: true } }),
    ]);
    const main = list.filter((a) => !rec(a.visualBrief).bonusKind);
    if (!main.length) continue;
    const items = main.map((a) => ({ copy: { id: a.id, index: a.index, kind: a.kind, awareness: a.awareness, angle: a.angle, hook: a.hook, headline: a.headline, body: a.body, cta: a.cta, claimCount: arr(a.claims).length, template: null } as unknown as AdCopy, metrics: null }));
    const s = scorePackPure(r.id, items, { trade: null, city: null, offer: brand?.mainOffer ?? null, brandName: brand?.name ?? null, hasLogo: Boolean(brand?.logoKey) } as never);
    scores.push(s.packScore); ads += s.ads.length;
    for (const a of s.ads) for (const i of a.issues) tally[`${i.code}:${i.severity}`] = (tally[`${i.code}:${i.severity}`] ?? 0) + 1;
    for (const i of s.packIssues) tally[`pack:${i.code}:${i.severity}`] = (tally[`pack:${i.code}:${i.severity}`] ?? 0) + 1;
  }
  scores.sort((a, b) => a - b);
  console.log("CREATIVE_COPY_CHECKS", JSON.stringify({ packs: scores.length, ads, min: scores[0], median: scores[Math.floor(scores.length / 2)], max: scores[scores.length - 1], issues: tally }));
  const outs = await loadOutcomes(db as never, now, 60, 400);
  const mine = outs.find((o) => o.email.toLowerCase() === email.toLowerCase());
  console.log("OUTCOME_CUSTOMERS", outs.length, "target found:", Boolean(mine));
  if (mine) console.log("OUTCOME", JSON.stringify({ plan: mine.plan, health: mine.outcome.health, reasons: mine.outcome.reasons, tooEarly: mine.outcome.tooEarly, failures: mine.outcome.failures, tiers: mine.outcome.tiers.map((t) => `${t.key}=${t.state}${t.at ? "@" + t.at.slice(0, 16) : ""}`) }));
}
main().finally(() => db.$disconnect());
