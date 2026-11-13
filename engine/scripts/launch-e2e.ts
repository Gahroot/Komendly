// Launch video end-to-end on the DEV database: a launch session shaped like POST /api/studio/launch, then the
// studio_capture job (records the real site) and the launch studio_turn it queues, both run in-process.
// Jobs are inserted already locked by this script (and the queued turn is claimed here), so no worker can take them.
// Usage: set -a; . ../.env.local; set +a; export CODEX_AUTH_FILE=$HOME/.ezcoder/auth.json EZMOTION_CLI_DIST=$(npm root -g)/@prestyj/cli/dist
//   npx tsx scripts/launch-e2e.ts <url> [--aspect 16:9|9:16] [--notes "..."] [--email dev@komendly.dev] [--out dir]
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { launchMessage, launchTitle, STUDIO_CAPTURE_JOB_TYPE, STUDIO_TURN_JOB_TYPE, type StudioLaunchAspect } from "../../src/lib/studio/contracts";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import type { JobContext } from "../src/jobs/context";
import { ffmpegPath, run } from "../src/modules/ezmotion/runtime";
import { createProvider } from "../src/providers/index";
import { completeJob } from "../src/queue/queue";
import { createStorage } from "../src/storage/s3";
import { studioCaptureJob } from "../src/studio/capture";
import { studioTurn } from "../src/studio/turn";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? d) : d; };
const url = process.argv[2] ?? "https://www.komendly.com";
const aspect = arg("aspect", "16:9") as StudioLaunchAspect;
const notes = arg("notes", "We just launched Ozzy Remix: paste any ad, get yours");
const email = arg("email", "dev@komendly.dev");
const outDir = arg("out", join(homedir(), ".ezcoder/goals/ezmotionkom/launch/e2e"));
const db = createDb();
const storage = createStorage();
// Own scratch dir so parallel local engines don't collide.
const config = { ...loadConfig(), scratchDir: await mkdtemp(join(tmpdir(), "launch-e2e-")), workerId: `worker:launch-e2e:${process.pid}` };
const provider = createProvider(config.aiProvider);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-dev-shm-usage"] });

const user = await db.user.findFirstOrThrow({ where: { email } });
const ws = await db.adsWorkspace.findFirstOrThrow({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
const session = await db.studioSession.create({ data: { workspaceId: ws.id, userId: user.id, title: launchTitle(url), starterId: "launch", status: "queued", lastActivityAt: new Date() } });
const um = await db.studioMessage.create({ data: { sessionId: session.id, role: "user", content: launchMessage({ url, notes }), attachments: [], status: "done" } });
const am = await db.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
console.log("session", session.id, session.title);

async function runLocked(jobId: string, type: string, payload: Record<string, unknown>, fn: (c: JobContext) => Promise<unknown>) {
  const usage: JobContext["usage"] = [];
  const t0 = Date.now();
  const result = await fn({ db, storage, provider, config, job: { id: jobId, type: type as never, runId: null, adId: null, workspaceId: ws.id, payload, attempts: 1, maxAttempts: 1 }, signal: new AbortController().signal, usage, now: () => new Date(), shared: { renderBrowser: async () => browser } as JobContext["shared"] });
  await completeJob(db, jobId, { result, durationMs: Date.now() - t0, costMicros: usage.reduce((a, u) => a + u.costMicros, 0) });
  return { result, ms: Date.now() - t0 };
}

// 1. Capture (exactly the payload the route queues).
const capPayload = { sessionId: session.id, userMessageId: um.id, assistantMessageId: am.id, url, aspect, notes };
const cap = await db.adJob.create({ data: { type: STUDIO_CAPTURE_JOB_TYPE, workspaceId: ws.id, payload: capPayload, status: "running", lockedBy: config.workerId, lockedAt: new Date(), attempts: 1, maxAttempts: 1 } });
await db.studioMessage.update({ where: { id: am.id }, data: { jobId: cap.id } });
const c = await runLocked(cap.id, STUDIO_CAPTURE_JOB_TYPE, capPayload, studioCaptureJob);
console.log("capture", Math.round(c.ms / 1000), "s", JSON.stringify(c.result));
await browser.close();
const turnJobId = (c.result as { turnJobId?: string | null }).turnJobId;
if (!turnJobId) throw new Error("capture did not queue a turn");

// 2. Claim the queued launch turn atomically (only if still queued), then run it here.
const claimed = await db.adJob.updateMany({ where: { id: turnJobId, status: "queued" }, data: { status: "running", lockedBy: config.workerId, lockedAt: new Date(), attempts: 1 } });
if (claimed.count !== 1) throw new Error("turn job was taken by another worker");
const turnJob = await db.adJob.findUniqueOrThrow({ where: { id: turnJobId } });
console.log("turn payload", JSON.stringify(turnJob.payload).slice(0, 1500));
const t = await runLocked(turnJobId, STUDIO_TURN_JOB_TYPE, turnJob.payload as Record<string, unknown>, studioTurn);
const msg = await db.studioMessage.findUniqueOrThrow({ where: { id: am.id } });
console.log("turn", Math.round(t.ms / 1000), "s", JSON.stringify(t.result), "\nreply:", msg.status, msg.content.slice(0, 1200));

// 3. Save the render + a contact sheet.
const ff = await ffmpegPath();
const renders = await db.studioRender.findMany({ where: { sessionId: session.id }, orderBy: { version: "asc" } });
for (const r of renders) {
  const file = join(outDir, `launch-v${r.version}.mp4`);
  await writeFile(file, await storage.get(r.key));
  if (ff) await run(ff, ["-y", "-v", "error", "-i", file, "-vf", "fps=1/2,scale=480:-2,tile=4x5", "-frames:v", "1", join(outDir, `launch-v${r.version}-contact.jpg`)]);
  console.log("render", JSON.stringify({ file, version: r.version, seconds: r.seconds, ratio: r.ratio, size: `${r.width}x${r.height}`, watermarked: r.watermarked }));
}
const ups = await db.studioUpload.findMany({ where: { sessionId: session.id }, select: { filename: true, mime: true, durationSec: true, width: true, height: true, status: true } });
console.log("uploads", JSON.stringify(ups));
await db.$disconnect();
process.exit(0);
