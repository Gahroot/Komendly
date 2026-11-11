// Mimics what the web app does for "Gift a pack": AdsGift (pending) + AdRun kind=gift (3 statics, 4:5, no credits)
// + the extract job, on the dev DB. With --run it also processes it in-process (like benchmark.ts) and waits.
// Usage: set -a; . ../.env.local; set +a; CODEX_AUTH_FILE=~/.ezcoder/auth.json \
//   npx tsx scripts/make-gift.ts --workspace <id> --url <url> --sender 'Sarah' [--run] [--timeout-min 15]
import crypto from "node:crypto";
import { chromium } from "playwright";
import { TRIAL_RATIOS } from "../../src/lib/ads/contracts";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import { createProvider } from "../src/providers/index";
import { Runner } from "../src/runner";
import { createStorage } from "../src/storage/s3";
import { sleep } from "../src/util/sleep";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const wsId = arg("workspace");
const url = arg("url");
const sender = arg("sender") ?? "Sarah";
if (!wsId || !url) {
  console.error("usage: make-gift.ts --workspace <id> --url <url> --sender <name> [--run]");
  process.exit(2);
}
const db = createDb();
const ws = await db.adsWorkspace.findUniqueOrThrow({ where: { id: wsId } });
const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
const gift = await db.$transaction(async (tx) => {
  const run = await tx.adRun.create({
    data: { workspaceId: ws.id, userId: ws.ownerId, url, kind: "gift", isTrial: false, status: "extracting", staticCount: 3, motionCount: 0, ratios: TRIAL_RATIOS, creditsReserved: 0 },
  });
  const g = await tx.adsGift.create({
    data: {
      token: crypto.randomBytes(12).toString("base64url"),
      senderWorkspaceId: ws.id,
      senderUserId: ws.ownerId,
      senderName: sender,
      recipientUrl: url,
      recipientDomainHash: crypto.createHmac("sha256", process.env.ADS_HASH_SALT ?? "").update(`domain:${domain}`).digest("hex") /* = hashIdentity("domain", domain) */,
      source: "trial_ready",
      runId: run.id,
    },
  });
  await tx.adJob.create({ data: { type: "extract", runId: run.id, workspaceId: ws.id, priority: 50, payload: { url } } });
  return g;
});
console.log(JSON.stringify({ giftId: gift.id, runId: gift.runId, token: gift.token }));

if (process.argv.includes("--run")) {
  const config = { ...loadConfig(), workerId: `worker:make-gift:${process.pid}` };
  const runner = new Runner({ db, storage: createStorage(), provider: createProvider(config.aiProvider), config, scopeRunId: gift.runId ?? undefined, launchBrowser: () => chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none"] }) });
  const t0 = Date.now();
  await runner.start();
  const deadline = t0 + Number(arg("timeout-min") ?? 15) * 60_000;
  let g = gift;
  while (Date.now() < deadline) {
    g = await db.adsGift.findUniqueOrThrow({ where: { id: gift.id } });
    if (g.status === "ready" || g.status === "failed") break;
    await sleep(3_000);
  }
  await runner.stop(5_000);
  const run = await db.adRun.findUniqueOrThrow({ where: { id: gift.runId ?? "" }, select: { status: true, costMicros: true, creditsCharged: true, brandProfileId: true } });
  const ads = await db.ad.groupBy({ by: ["status"], where: { runId: gift.runId ?? "" }, _count: true });
  const events = await db.adsEvent.findMany({ where: { runId: gift.runId }, select: { name: true, props: true } });
  console.log(JSON.stringify({ giftStatus: g.status, giftCostMicros: Number(g.costMicros), run: { ...run, costMicros: Number(run.costMicros) }, ads, events, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
}
await db.$disconnect();
process.exit(0);
