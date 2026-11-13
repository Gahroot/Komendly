// "Remix any ad" ingest smoke on the DEV database + dev storage: for each URL, create a remix session/messages +
// pending StudioUpload, run studio_ingest in-process, print the upload row, then CANCEL the queued remix turn
// (so no AI turn runs). Usage: set -a; . ../.env.local; set +a; [YTDLP_PATH=...] npx tsx scripts/studio-ingest-smoke.ts <url>... [--email dev@komendly.dev]
import { randomUUID } from "node:crypto";
import { remixMessage, STUDIO_INGEST_JOB_TYPE, studioKeys } from "../../src/lib/studio/contracts";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import type { JobContext } from "../src/jobs/context";
import { createProvider } from "../src/providers/index";
import { completeJob } from "../src/queue/queue";
import { createStorage } from "../src/storage/s3";
import { studioIngestJob } from "../src/studio/ingest";

const args = process.argv.slice(2);
const ei = args.indexOf("--email");
const email = ei >= 0 ? (args[ei + 1] ?? "") : "dev@komendly.dev";
const urls = args.filter((a, i) => !a.startsWith("--") && (ei < 0 || i !== ei + 1));
const db = createDb();
const storage = createStorage();
const config = { ...loadConfig(), workerId: `worker:ingest-smoke:${process.pid}` };
const provider = createProvider(config.aiProvider);
const user = await db.user.findFirstOrThrow({ where: { email } });
const ws = await db.adsWorkspace.findFirstOrThrow({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });

for (const url of urls) {
  const session = await db.studioSession.create({ data: { workspaceId: ws.id, userId: user.id, title: "Ad remix (smoke)", starterId: "remix", status: "queued" } });
  const uploadId = randomUUID().replace(/-/g, "");
  await db.studioUpload.create({ data: { id: uploadId, workspaceId: ws.id, userId: user.id, sessionId: session.id, key: studioKeys.upload(ws.id, uploadId, "reference"), filename: "reference", mime: "video/mp4", bytes: 0, status: "pending" } });
  const um = await db.studioMessage.create({ data: { sessionId: session.id, role: "user", content: remixMessage({ url }), attachments: [{ uploadId, reference: true, sourceUrl: url }], status: "done" } });
  const am = await db.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
  const payload = { uploadId, url, sessionId: session.id, userMessageId: um.id, assistantMessageId: am.id };
  const job = await db.adJob.create({ data: { type: STUDIO_INGEST_JOB_TYPE, workspaceId: ws.id, payload, status: "running", lockedBy: config.workerId, lockedAt: new Date(), attempts: 1, maxAttempts: 1 } });
  await db.studioMessage.update({ where: { id: am.id }, data: { jobId: job.id } });
  const t0 = Date.now();
  const ctx: JobContext = { db, storage, provider, config, job: { id: job.id, type: STUDIO_INGEST_JOB_TYPE as never, runId: null, adId: null, workspaceId: ws.id, payload, attempts: 1, maxAttempts: 1 }, signal: new AbortController().signal, usage: [], now: () => new Date(), shared: { renderBrowser: () => Promise.reject(new Error("unused")) } };
  const result = (await studioIngestJob(ctx)) as { turnJobId?: string | null };
  await completeJob(db, job.id, { result, durationMs: Date.now() - t0, costMicros: 0 });
  if (result.turnJobId) await db.adJob.update({ where: { id: result.turnJobId }, data: { status: "canceled", finishedAt: new Date(), lastError: "ingest smoke: turn not run" } });
  await db.studioMessage.updateMany({ where: { id: am.id, status: "queued" }, data: { status: "cancelled" } });
  await db.studioSession.update({ where: { id: session.id }, data: { status: "idle" } });
  const up = await db.studioUpload.findUniqueOrThrow({ where: { id: uploadId } });
  const asst = await db.studioMessage.findUniqueOrThrow({ where: { id: am.id } });
  const head = up.status === "ready" ? (await storage.get(up.key)).byteLength : 0;
  console.log(JSON.stringify({ url, ms: Date.now() - t0, result, upload: { status: up.status, mime: up.mime, bytes: up.bytes, storedBytes: head, durationSec: up.durationSec, width: up.width, height: up.height, posterKey: up.posterKey }, assistant: { status: asst.status, content: asst.content } }));
}
await db.$disconnect();
