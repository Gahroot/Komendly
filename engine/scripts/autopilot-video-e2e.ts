// DEV DB ONLY: prove one real Ozzy Autopilot weekly video + the weekly email (dry run and captured render).
// Throwaway user + Ad Department workspace copying a real dev brand; startAutopilotVideo creates the session + job,
// the job is immediately locked by this script's worker id (no other engine claims it), studioTurn renders/delivers.
// Usage: set -a; . ../.env.local; set +a; export CODEX_AUTH_FILE=$HOME/.ezcoder/auth.json EZMOTION_CLI_DIST=$(npm root -g)/@prestyj/cli/dist
//   npx tsx scripts/autopilot-video-e2e.ts --brand <brandProfileId> --run <runWithReadyAds> --out <dir> [--keep]
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STUDIO_TURN_JOB_TYPE } from "../../src/lib/studio/contracts";
import { renderLifecycleHtml } from "../../src/lib/ads/lifecycle/template";
import { loadConfig } from "../src/config";
import { createDb, type Db } from "../src/db";
import type { JobContext } from "../src/jobs/context";
import { startAutopilotVideo } from "../src/jobs/autopilot-video";
import { startWeeklyRun, weeklyEmailTick } from "../src/jobs/weekly";
import { createProvider } from "../src/providers/index";
import { completeJob } from "../src/queue/queue";
import { createStorage } from "../src/storage/s3";
import { studioTurn } from "../src/studio/turn";
import { isoWeekKey } from "../../src/lib/ads/weekly-drop";

const arg = (n: string, d = "") => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? d) : d; };
const FOCUS = "push our Black Friday offer";
if (!/rlwy|localhost/.test(process.env.DATABASE_URL ?? "")) throw new Error("dev DB only");
const outDir = arg("out");
await mkdir(outDir, { recursive: true });
const db = createDb();
const storage = createStorage();
const config = { ...loadConfig(), workerId: `worker:autopilot-e2e:${process.pid}` };
const provider = createProvider(config.aiProvider);
const now = new Date();
const week = isoWeekKey(now);

const bp = await db.brandProfile.findUniqueOrThrow({ where: { id: arg("brand") } });
const srcRun = await db.adRun.findUniqueOrThrow({ where: { id: arg("run") }, include: { ads: { where: { status: "ready" }, include: { assets: true } } } });
const user = await db.user.create({ data: { email: `autopilot-e2e-${process.pid}@example.org`, passwordHash: "x", name: "Ana" } });
const ws = await db.adsWorkspace.create({ data: { name: "autopilot video e2e", ownerId: user.id, adsPlan: "ad_department", subscriptionStatus: "active", creditBalance: 7, studioFreeVideos: 1 } });
await db.adsWorkspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "owner" } });
const summary: Record<string, unknown> = { workspaceId: ws.id, week, focus: FOCUS, before: { creditBalance: 7, studioFreeVideos: 1 } };
try {
  const { id: _i, workspaceId: _w, createdAt: _c, updatedAt: _u, ...bpData } = bp;
  const nbp = await db.brandProfile.create({ data: { ...bpData, workspaceId: ws.id } as never });
  await db.adsAutopilot.create({ data: { workspaceId: ws.id, focus: FOCUS } });
  // Earlier normal run so startWeeklyRun finds the brand.
  await db.adRun.create({ data: { workspaceId: ws.id, userId: user.id, brandProfileId: nbp.id, url: srcRun.url, goal: srcRun.goal, status: "completed", extraction: srcRun.extraction as never, staticCount: 0, motionCount: 0, creditsReserved: 0, ratios: ["4:5"] } });
  const wr = await startWeeklyRun(db, ws, week, now, FOCUS);
  if (!wr.created) throw new Error(`weekly run not created: ${wr.reason}`);
  // Keep the engine's planner away from it: the ads part is NOT regenerated here (copied below for the email only).
  await db.adJob.deleteMany({ where: { runId: wr.runId } });

  const v = await startAutopilotVideo(db, ws, { week, focus: FOCUS, tz: null, now });
  if (!v.created) throw new Error(`video not created: ${v.reason}`);
  const job = await db.adJob.update({ where: { id: v.jobId }, data: { status: "running", lockedBy: config.workerId, lockedAt: new Date(), attempts: 1 } });
  summary.job = { id: job.id, type: job.type, priority: job.priority };
  const payload = job.payload as Record<string, unknown>;
  const usage: JobContext["usage"] = [];
  const t0 = Date.now();
  const result = await studioTurn({ db, storage, provider, config, job: { id: job.id, type: STUDIO_TURN_JOB_TYPE as never, runId: null, adId: null, workspaceId: ws.id, payload, attempts: 1, maxAttempts: 2 }, signal: new AbortController().signal, usage, now: () => new Date(), shared: { renderBrowser: () => Promise.reject(new Error("unused")) } });
  const costMicros = usage.reduce((a, u) => a + u.costMicros, 0);
  await completeJob(db, job.id, { result, durationMs: Date.now() - t0, costMicros });
  summary.turn = { seconds: Math.round((Date.now() - t0) / 1000), result, costMicros };
  const msgs = await db.studioMessage.findMany({ where: { sessionId: v.sessionId }, orderBy: { createdAt: "asc" }, select: { role: true, status: true, content: true, error: true } });
  summary.messages = msgs;
  const renders = await db.studioRender.findMany({ where: { sessionId: v.sessionId } });
  summary.renders = renders.map((r) => ({ id: r.id, version: r.version, ratio: r.ratio, seconds: r.seconds, width: r.width, height: r.height, watermarked: r.watermarked, free: r.free, kind: r.kind, creditsCharged: r.creditsCharged }));
  for (const r of renders) {
    await writeFile(join(outDir, `autopilot-video-v${r.version}.mp4`), await storage.get(r.key));
    if (r.posterKey) await writeFile(join(outDir, `autopilot-video-v${r.version}-poster.jpg`), await storage.get(r.posterKey));
  }
  const after = await db.adsWorkspace.findUniqueOrThrow({ where: { id: ws.id }, select: { creditBalance: true, studioFreeVideos: true } });
  summary.after = after;
  summary.ledger = await db.creditLedger.findMany({ where: { workspaceId: ws.id }, select: { delta: true, reason: true } });
  summary.chargeEvents = (await db.studioEvent.findMany({ where: { sessionId: v.sessionId, type: { in: ["charge", "render", "error", "question"] } }, orderBy: { id: "asc" }, select: { type: true, data: true } }));

  // Weekly email: give the weekly run the source run's ready ads (same stored files) and mark it completed.
  for (const a of srcRun.ads) {
    const { id: _a, runId: _r, workspaceId: _ws, createdAt: _ac, updatedAt: _au, assets, ...ad } = a;
    await db.ad.create({ data: { ...ad, runId: wr.runId, workspaceId: ws.id, assets: { create: assets.map(({ id: _x, adId: _y, createdAt: _z, ...as }) => as) } } as never });
  }
  await db.adRun.update({ where: { id: wr.runId }, data: { status: "completed", completedAt: new Date() } });
  // Dev has no lifecycle_email flag: pretend it's on for this call only (never flip the shared dev flag).
  const flagDb = new Proxy(db, { get: (t, p) => (p === "adsFeatureFlag" ? { findUnique: async () => ({ key: "lifecycle_email", enabled: true }) } : Reflect.get(t, p)) }) as Db;
  const env = { ...process.env, LIFECYCLE_EMAIL_SECRET: randomBytes(16).toString("hex"), LIFECYCLE_APP_URL: "https://www.komendly.com" };
  const lines: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((s: string) => { lines.push(String(s)); return true; }) as typeof process.stdout.write;
  const dry = await weeklyEmailTick({ db: flagDb, send: async () => undefined, env: { ...env, LIFECYCLE_DRY_RUN: "1" } }).finally(() => { process.stdout.write = origWrite; });
  summary.emailDryRun = dry.filter((d) => d.runId === wr.runId);
  const dryLine = lines.map((l) => { try { return JSON.parse(l) as { msg?: string; runId?: string; text?: string }; } catch { return null; } }).find((l) => l?.msg === "weekly drop email (dry run)" && l.runId === wr.runId);
  await writeFile(join(outDir, "weekly-email-dry-run.txt"), dryLine?.text ?? "(no dry-run line)\n" + lines.join(""));
  // Same tick with a capture-only sender (nothing leaves the machine) to get the exact HTML.
  let html = "", subject = "";
  await weeklyEmailTick({ db: flagDb, env, send: async (m) => { if (m.to === user.email) { html = m.html; subject = m.subject; } } });
  await writeFile(join(outDir, "weekly-email.html"), html);
  summary.emailSubject = subject;
  void renderLifecycleHtml;
} finally {
  await writeFile(join(outDir, "autopilot-video-e2e.json"), JSON.stringify(summary, (_k, val) => (typeof val === "bigint" ? Number(val) : val), 2));
  if (!process.argv.includes("--keep")) {
    await db.adJob.deleteMany({ where: { workspaceId: ws.id } });
    await db.adsEvent.deleteMany({ where: { workspaceId: ws.id } });
    await db.adsWorkspace.delete({ where: { id: ws.id } });
    await db.adsEvent.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
}
