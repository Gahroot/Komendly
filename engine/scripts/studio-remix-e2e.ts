// "Remix any ad" end to end on the DEV database: remix session -> studio_ingest (real download) -> the remix
// studio_turn it queues (real EZ Motion agent on the dev Codex login) -> delivered MP4. Saves the reference, the
// output and contact sheets of both. Usage:
//   set -a; . ../.env.local; set +a; export CODEX_AUTH_FILE=$HOME/.ezcoder/auth.json EZMOTION_CLI_DIST=$(npm root -g)/@prestyj/cli/dist
//   YTDLP_PATH=/tmp/ytdlp/yt-dlp npx tsx scripts/studio-remix-e2e.ts <ad-url> [--email dev@komendly.dev] [--out dir] [--notes "..."]
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { remixMessage, STUDIO_INGEST_JOB_TYPE, STUDIO_TURN_JOB_TYPE, studioKeys } from "../../src/lib/studio/contracts";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import type { JobContext } from "../src/jobs/context";
import { ffmpegPath, run } from "../src/modules/ezmotion/runtime";
import { createProvider } from "../src/providers/index";
import { completeJob } from "../src/queue/queue";
import { createStorage } from "../src/storage/s3";
import { studioIngestJob } from "../src/studio/ingest";
import { studioTurn } from "../src/studio/turn";

const argv = process.argv.slice(2);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? (argv[i + 1] ?? d) : d; };
const url = argv[0] ?? "";
const email = flag("email", "dev@komendly.dev");
const outDir = flag("out", join(homedir(), ".ezcoder/goals/ezmotionkom/remix"));
const notes = flag("notes", "");
const db = createDb();
const storage = createStorage();
const config = { ...loadConfig(), workerId: `worker:remix-e2e:${process.pid}` };
const provider = createProvider(config.aiProvider);
await mkdir(outDir, { recursive: true });
const ff = await ffmpegPath();
if (!ff) throw new Error("ffmpeg missing");

const user = await db.user.findFirstOrThrow({ where: { email } });
const ws = await db.adsWorkspace.findFirstOrThrow({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
const ctxFor = (id: string, type: string, payload: Record<string, unknown>, usage: JobContext["usage"]): JobContext => ({ db, storage, provider, config, job: { id, type: type as never, runId: null, adId: null, workspaceId: ws.id, payload, attempts: 1, maxAttempts: 1 }, signal: new AbortController().signal, usage, now: () => new Date(), shared: { renderBrowser: () => Promise.reject(new Error("unused")) } });

const session = await db.studioSession.create({ data: { workspaceId: ws.id, userId: user.id, title: "Ad remix", starterId: "remix", status: "queued", freeVideo: ws.studioFreeVideos > 0 } });
const uploadId = randomUUID().replace(/-/g, "");
await db.studioUpload.create({ data: { id: uploadId, workspaceId: ws.id, userId: user.id, sessionId: session.id, key: studioKeys.upload(ws.id, uploadId, "reference"), filename: "reference", mime: "video/mp4", bytes: 0, status: "pending" } });
const um = await db.studioMessage.create({ data: { sessionId: session.id, role: "user", content: remixMessage({ url, notes }), attachments: [{ uploadId, reference: true, sourceUrl: url }], status: "done" } });
const am = await db.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
const payload = { uploadId, url, sessionId: session.id, userMessageId: um.id, assistantMessageId: am.id };

// 1. Ingest (locked by this script).
const ij = await db.adJob.create({ data: { type: STUDIO_INGEST_JOB_TYPE, workspaceId: ws.id, payload, status: "running", lockedBy: config.workerId, lockedAt: new Date(), attempts: 1, maxAttempts: 1 } });
await db.studioMessage.update({ where: { id: am.id }, data: { jobId: ij.id } });
let t0 = Date.now();
const ingest = (await studioIngestJob(ctxFor(ij.id, STUDIO_INGEST_JOB_TYPE, payload, []))) as { ok: boolean; turnJobId?: string | null };
const ingestMs = Date.now() - t0;
await completeJob(db, ij.id, { result: ingest, durationMs: ingestMs, costMicros: 0 });
console.log("ingest", ingestMs, "ms", JSON.stringify(ingest));
if (!ingest.turnJobId) throw new Error("ingest did not queue a turn");

// 2. Take the queued turn job (so no other worker claims it) and run it here.
const took = await db.adJob.updateMany({ where: { id: ingest.turnJobId, status: "queued" }, data: { status: "running", lockedBy: config.workerId, lockedAt: new Date(), attempts: 1 } });
if (took.count !== 1) throw new Error("another worker took the turn job");
const turnPayload = { sessionId: session.id, userMessageId: um.id, assistantMessageId: am.id };
const usage: JobContext["usage"] = [];
t0 = Date.now();
const turn = await studioTurn(ctxFor(ingest.turnJobId, STUDIO_TURN_JOB_TYPE, turnPayload, usage));
const turnMs = Date.now() - t0;
await completeJob(db, ingest.turnJobId, { result: turn, durationMs: turnMs, costMicros: usage.reduce((a, u) => a + u.costMicros, 0) });

// 3. Save reference, output and contact sheets.
const up = await db.studioUpload.findUniqueOrThrow({ where: { id: uploadId } });
const refFile = join(outDir, `reference.${up.mime.split("/")[1] === "quicktime" ? "mov" : up.mime.split("/")[1]}`);
await writeFile(refFile, await storage.get(up.key));
const render = await db.studioRender.findFirst({ where: { sessionId: session.id }, orderBy: { version: "desc" } });
const sheet = async (file: string, name: string, seconds: number) => {
  const fps = Math.max(0.5, 12 / Math.max(1, seconds));
  await run(ff, ["-y", "-v", "error", "-i", file, "-vf", `fps=${fps.toFixed(3)},scale=270:-2,tile=6x2`, "-frames:v", "1", join(outDir, name)]);
};
await sheet(refFile, "reference-sheet.jpg", up.durationSec ?? 12);
if (render) {
  const out = join(outDir, `remix-v${render.version}.mp4`);
  await writeFile(out, await storage.get(render.key));
  await sheet(out, "remix-sheet.jpg", render.seconds);
}
const msg = await db.studioMessage.findUniqueOrThrow({ where: { id: am.id } });
const tools = await db.studioEvent.findMany({ where: { sessionId: session.id, type: { in: ["tool", "status", "error"] } }, orderBy: { id: "asc" } });
console.log("\nSUMMARY", JSON.stringify({
  sessionId: session.id, ingestMs, turnMs, turn,
  reference: { mime: up.mime, seconds: up.durationSec, size: `${up.width}x${up.height}` },
  render: render ? { seconds: render.seconds, ratio: render.ratio, size: `${render.width}x${render.height}`, free: render.free, credits: render.creditsCharged } : null,
  reply: msg.content, status: msg.status, error: msg.error,
  steps: tools.map((e) => `${e.type}: ${JSON.stringify(e.data)}`).slice(0, 40), outDir,
}, null, 1));
await db.$disconnect();
process.exit(0);
