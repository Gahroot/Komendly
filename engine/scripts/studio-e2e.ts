// Ozzy Studio end-to-end on the DEV database: session + uploaded clip + two turns (multi-turn resume).
// Usage: set -a; . ../.env.local; set +a; export CODEX_AUTH_FILE=$HOME/.ezcoder/auth.json EZMOTION_CLI_DIST=$(npm root -g)/@prestyj/cli/dist
//   npx tsx scripts/studio-e2e.ts [--email dev@komendly.dev] [--out ~/.ezcoder/goals/ezmotionkom/studio-e2e]
// Jobs are inserted already locked by this script, so no other worker can claim them.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { STUDIO_PROBE_JOB_TYPE, STUDIO_TURN_JOB_TYPE, studioKeys } from "../../src/lib/studio/contracts";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import type { JobContext } from "../src/jobs/context";
import { ffmpegPath, run } from "../src/modules/ezmotion/runtime";
import { createProvider } from "../src/providers/index";
import { completeJob } from "../src/queue/queue";
import { createStorage } from "../src/storage/s3";
import { studioProbeJob } from "../src/studio/probe";
import { studioTurn } from "../src/studio/turn";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? d) : d; };
const email = arg("email", "dev@komendly.dev");
const outDir = arg("out", join(homedir(), ".ezcoder/goals/ezmotionkom/studio-e2e"));
const db = createDb();
const storage = createStorage();
const config = { ...loadConfig(), workerId: `worker:studio-e2e:${process.pid}` };
const provider = createProvider(config.aiProvider);
await mkdir(outDir, { recursive: true });

const user = await db.user.findFirstOrThrow({ where: { email } });
const ws = await db.adsWorkspace.findFirstOrThrow({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
console.log("workspace", { id: ws.id, plan: ws.adsPlan, status: ws.subscriptionStatus, balance: ws.creditBalance, freeVideos: ws.studioFreeVideos });

async function runJob(type: string, payload: Record<string, unknown>, fn: (c: JobContext) => Promise<unknown>) {
  const job = await db.adJob.create({ data: { type, workspaceId: ws.id, payload: payload as object, status: "running", lockedBy: config.workerId, lockedAt: new Date(), attempts: 1, maxAttempts: 1 } });
  const usage: JobContext["usage"] = [];
  const t0 = Date.now();
  const result = await fn({ db, storage, provider, config, job: { id: job.id, type: type as never, runId: null, adId: null, workspaceId: ws.id, payload, attempts: 1, maxAttempts: 1 }, signal: new AbortController().signal, usage, now: () => new Date(), shared: { renderBrowser: () => Promise.reject(new Error("unused")) } });
  const costMicros = usage.reduce((a, u) => a + u.costMicros, 0);
  await completeJob(db, job.id, { result, durationMs: Date.now() - t0, costMicros });
  return { result, ms: Date.now() - t0, jobId: job.id };
}

// 1. A 12s sample clip (moving test pattern + tone), uploaded like the browser would, then probed.
const ff = await ffmpegPath();
if (!ff) throw new Error("ffmpeg missing");
const clip = join(tmpdir(), `studio-e2e-${process.pid}.mp4`);
const g = await run(ff, ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=12", "-f", "lavfi", "-i", "sine=frequency=330:duration=12", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", clip]);
if (g.code !== 0) throw new Error(g.stderr);
const session = await db.studioSession.create({ data: { workspaceId: ws.id, userId: user.id, model: "gpt-6.1-sol", thinking: "high" } });
const upload = await db.studioUpload.create({ data: { workspaceId: ws.id, userId: user.id, sessionId: session.id, key: `pending-${session.id}`, filename: "Product Demo Clip.mp4", mime: "video/mp4", bytes: 0, status: "uploaded" } });
const key = studioKeys.upload(ws.id, upload.id, upload.filename);
const body = await readFile(clip);
await storage.put(key, body, "video/mp4");
await db.studioUpload.update({ where: { id: upload.id }, data: { key, bytes: body.length } });
const probe = await runJob(STUDIO_PROBE_JOB_TYPE, { uploadId: upload.id }, studioProbeJob);
console.log("probe", probe.ms, "ms", JSON.stringify(probe.result));

let lastEventId = 0n;
async function turn(text: string, attachments: object[] = []) {
  const um = await db.studioMessage.create({ data: { sessionId: session.id, role: "user", content: text, attachments } });
  const am = await db.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
  console.log(`\n=== TURN: ${text}`);
  const r = await runJob(STUDIO_TURN_JOB_TYPE, { sessionId: session.id, userMessageId: um.id, assistantMessageId: am.id }, studioTurn);
  const events = await db.studioEvent.findMany({ where: { sessionId: session.id, id: { gt: lastEventId } }, orderBy: { id: "asc" } });
  lastEventId = events.at(-1)?.id ?? lastEventId;
  let text_ = "";
  for (const e of events) {
    if (e.type === "text_delta") { text_ += String((e.data as { text?: string }).text ?? ""); continue; }
    console.log(`  [${e.type}] ${JSON.stringify(e.data)}`);
  }
  console.log(`  text_delta rows: ${events.filter((e) => e.type === "text_delta").length}; streamed ${text_.length} chars`);
  const msg = await db.studioMessage.findUniqueOrThrow({ where: { id: am.id } });
  console.log(`  -> ${Math.round(r.ms / 1000)}s status=${msg.status} result=${JSON.stringify(r.result)}\n  content: ${msg.content.slice(0, 600)}`);
  return { msg, result: r.result as { asked?: boolean; renderId?: string | null }, seconds: Math.round(r.ms / 1000) };
}

const turns = [] as Array<Awaited<ReturnType<typeof turn>>>;
turns.push(await turn("Cut this clip into a punchy 10-second vertical ad with big captions saying Komendly makes ads in minutes", [{ uploadId: upload.id }]));
for (let i = 0; i < 2 && turns.at(-1)?.result.asked; i++) turns.push(await turn("Your call: go with what you recommend and make it now."));
turns.push(await turn("make the captions yellow"));

const s = await db.studioSession.findUniqueOrThrow({ where: { id: session.id } });
const renders = await db.studioRender.findMany({ where: { sessionId: session.id }, orderBy: { version: "asc" } });
const ws2 = await db.adsWorkspace.findUniqueOrThrow({ where: { id: ws.id } });
for (const r of renders) {
  const file = join(outDir, `v${r.version}.mp4`);
  await writeFile(file, await storage.get(r.key));
  for (const t of [1, 4, 8]) await run(ff, ["-y", "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=360:-2", join(outDir, `v${r.version}-t${t}.jpg`)]);
}
console.log("\nSUMMARY", JSON.stringify({
  sessionId: session.id, title: s.title, status: s.status, projectKey: s.projectKey, agentStateKey: s.agentStateKey,
  turns: turns.map((t) => ({ seconds: t.seconds, status: t.msg.status, asked: !!t.result.asked, renderId: t.result.renderId ?? null })),
  renders: renders.map((r) => ({ version: r.version, key: r.key, posterKey: r.posterKey, seconds: r.seconds, ratio: r.ratio, size: `${r.width}x${r.height}`, watermarked: r.watermarked, free: r.free, kind: r.kind, credits: r.creditsCharged })),
  balance: { before: ws.creditBalance, after: ws2.creditBalance }, freeVideos: { before: ws.studioFreeVideos, after: ws2.studioFreeVideos }, studioOfferReadyAt: ws2.studioOfferReadyAt, outDir,
}, null, 1));
await db.$disconnect();
process.exit(0);
