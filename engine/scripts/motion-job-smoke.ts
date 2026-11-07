// Runs one real render_motion job through the job handler (renderJob) for a clone of an existing motion ad.
// Usage: set -a; . ../.env.local; set +a; npx tsx scripts/motion-job-smoke.ts <domain>
// The clone ad, its job rows and stored files stay in the dev DB/bucket for inspection (tagged "smoke").
import { chromium } from "playwright";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import { renderJob } from "../src/jobs/render";
import { createProvider } from "../src/providers/index";
import { createStorage } from "../src/storage/s3";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const domain = process.argv[2] ?? "back2sleepnow.com";
const auth = join(homedir(), ".ezcoder/auth.json");
if (!process.env.CODEX_AUTH_JSON && !process.env.CODEX_AUTH_FILE && existsSync(auth)) process.env.CODEX_AUTH_FILE = auth;
const config = loadConfig();
const db = createDb();
const profiles = await db.brandProfile.findMany({ where: { domain }, select: { id: true } });
const src = await db.ad.findFirst({ where: { kind: "motion", run: { brandProfileId: { in: profiles.map((p) => p.id) } } }, orderBy: { createdAt: "desc" } });
if (!src) throw new Error(`no motion ad for ${domain}`);
const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src as typeof src & { createdAt?: Date; updatedAt?: Date };
const maxIdx = await db.ad.aggregate({ where: { runId: src.runId }, _max: { index: true } });
const clone = await db.ad.create({ data: { ...(rest as Record<string, unknown>), index: (maxIdx._max.index ?? 0) + 1, status: "planned", angle: `${src.angle} (smoke)` } as never });
const job = await db.adJob.create({ data: { type: "render_motion", runId: src.runId, adId: clone.id, workspaceId: src.workspaceId, status: "running", lockedBy: "smoke", lockedAt: new Date() } });
let browser: import("playwright").Browser | null = null;
const t0 = Date.now();
try {
  const out = await renderJob({
    db, storage: createStorage(), provider: createProvider(config.aiProvider), config,
    job: { id: job.id, type: "render_motion", runId: src.runId, adId: clone.id, workspaceId: src.workspaceId, payload: {}, attempts: 1, maxAttempts: 3 },
    signal: AbortSignal.timeout(15 * 60_000), usage: [], now: () => new Date(),
    shared: { renderBrowser: async () => (browser ??= await chromium.launch()) },
  });
  const ad = await db.ad.findUniqueOrThrow({ where: { id: clone.id } });
  console.log(JSON.stringify({ ok: true, ms: Date.now() - t0, adId: clone.id, status: ad.status, out }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, adId: clone.id, error: e instanceof Error ? e.message.slice(0, 500) : String(e) }));
  process.exitCode = 1;
} finally {
  await db.adJob.update({ where: { id: job.id }, data: { status: "succeeded", lockedBy: null, finishedAt: new Date() } }).catch(() => undefined);
  await (browser as import("playwright").Browser | null)?.close();
  await db.$disconnect();
}
