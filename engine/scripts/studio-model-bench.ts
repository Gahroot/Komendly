// Ozzy Studio model bench on the DEV database: one prompt, one model, a throwaway paid workspace (no brand), real turn.
// Usage: set -a; . ../.env.local; set +a; export CODEX_AUTH_FILE=$HOME/.ezcoder/auth.json EZMOTION_CLI_DIST=$(npm root -g)/@prestyj/cli/dist
//   STUDIO_AGENT_MODEL=gpt-6-luna STUDIO_AGENT_THINKING=high npx tsx scripts/studio-model-bench.ts --prompt-file p.txt --out dir
// Jobs are inserted already locked by this script, so no other worker can claim them. Everything it creates is deleted.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STUDIO_TURN_JOB_TYPE } from "../../src/lib/studio/contracts";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import type { JobContext } from "../src/jobs/context";
import { ffmpegPath, run } from "../src/modules/ezmotion/runtime";
import { createProvider } from "../src/providers/index";
import { completeJob } from "../src/queue/queue";
import { createStorage } from "../src/storage/s3";
import { studioTurn } from "../src/studio/turn";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); const v = i >= 0 ? process.argv[i + 1] : undefined; if (!v) throw new Error(`--${n} required`); return v; };
if (!/komendly-dev|localhost|dev/i.test(process.env.DATABASE_URL ?? "") && !process.env.BENCH_ALLOW) throw new Error("refusing: DATABASE_URL does not look like dev (set BENCH_ALLOW=1 if it is)");
const prompt = (await readFile(arg("prompt-file"), "utf8")).trim();
const outDir = arg("out");
const editIdx = process.argv.indexOf("--edit");
const editText = editIdx >= 0 ? process.argv[editIdx + 1] : undefined;
const model = `${process.env.STUDIO_AGENT_MODEL ?? "default"} / edit ${process.env.STUDIO_EDIT_MODEL ?? "default"}`;
await mkdir(outDir, { recursive: true });
const db = createDb();
const storage = createStorage();
const config = { ...loadConfig(), workerId: `worker:model-bench:${process.pid}` };
const provider = createProvider(config.aiProvider);

const tag = `bench-${Date.now()}-${process.pid}`;
const user = await db.user.create({ data: { email: `${tag}@example.org`, name: "Bench", passwordHash: "x" } as never });
const ws = await db.adsWorkspace.create({ data: { ownerId: user.id, name: tag, adsPlan: "ad_department", subscriptionStatus: "active", creditBalance: 0, studioFreeVideos: 0 } as never });
await db.adsWorkspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "owner" } as never }).catch(() => undefined);
const session = await db.studioSession.create({ data: { workspaceId: ws.id, userId: user.id, model, thinking: process.env.STUDIO_AGENT_THINKING ?? "high" } });

async function turn(text: string) {
  await db.studioMessage.create({ data: { sessionId: session.id, role: "user", content: text } });
  const um = await db.studioMessage.findFirstOrThrow({ where: { sessionId: session.id, role: "user" }, orderBy: { createdAt: "desc" } });
  const am = await db.studioMessage.create({ data: { sessionId: session.id, role: "assistant", status: "queued" } });
  const payload = { sessionId: session.id, userMessageId: um.id, assistantMessageId: am.id };
  const job = await db.adJob.create({ data: { type: STUDIO_TURN_JOB_TYPE, workspaceId: ws.id, payload, status: "running", lockedBy: config.workerId, lockedAt: new Date(), attempts: 1, maxAttempts: 1 } });
  const usage: JobContext["usage"] = [];
  const t0 = Date.now();
  const result = await studioTurn({ db, storage, provider, config, job: { id: job.id, type: STUDIO_TURN_JOB_TYPE as never, runId: null, adId: null, workspaceId: ws.id, payload, attempts: 1, maxAttempts: 1 }, signal: new AbortController().signal, usage, now: () => new Date(), shared: { renderBrowser: () => Promise.reject(new Error("unused")) } } as JobContext) as { asked?: boolean };
  const ms = Date.now() - t0;
  await completeJob(db, job.id, { result, durationMs: ms, costMicros: usage.reduce((a, u) => a + u.costMicros, 0) });
  const msg = await db.studioMessage.findUniqueOrThrow({ where: { id: am.id } });
  return { ms, result, usage, reply: msg.content, status: msg.status };
}

const out: Record<string, unknown> = { model, thinking: process.env.STUDIO_AGENT_THINKING ?? "high", prompt, turns: [] as unknown[] };
try {
  const turns = out.turns as Awaited<ReturnType<typeof turn>>[];
  turns.push(await turn(prompt));
  for (let i = 0; i < 2 && turns.at(-1)?.result.asked; i++) turns.push(await turn("Your call: go with what you recommend and make it now."));
  const firstCount = turns.length;
  if (editText) turns.push(await turn(editText));
  out.perTurn = turns.map((t, i) => ({ kind: i < firstCount ? "first" : "edit", ms: t.ms, timing: (t.result as { timing?: unknown }).timing, status: t.status, input: t.usage.reduce((a, u) => a + (u.inputTokens ?? 0), 0), output: t.usage.reduce((a, u) => a + (u.outputTokens ?? 0), 0), reply: t.reply.slice(0, 300) }));
  out.totalMs = turns.reduce((a, t) => a + t.ms, 0);
  out.inputTokens = turns.flatMap((t) => t.usage).reduce((a, u) => a + (u.inputTokens ?? 0), 0);
  out.outputTokens = turns.flatMap((t) => t.usage).reduce((a, u) => a + (u.outputTokens ?? 0), 0);
  const renders = await db.studioRender.findMany({ where: { sessionId: session.id }, orderBy: { version: "asc" } });
  out.renders = renders.map((r) => ({ version: r.version, seconds: r.seconds, ratio: r.ratio }));
  out.render = renders.at(-1) ? { seconds: renders.at(-1)!.seconds, ratio: renders.at(-1)!.ratio, width: renders.at(-1)!.width, height: renders.at(-1)!.height } : undefined;
  await writeFile(join(outDir, "events.json"), JSON.stringify(await db.studioEvent.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } }), (_k, v) => (typeof v === "bigint" ? String(v) : v), 1));
  const ff = await ffmpegPath();
  for (const r of renders) {
    const file = join(outDir, `v${r.version}.mp4`);
    await writeFile(file, await storage.get(r.key));
    if (ff) await run(ff, ["-y", "-v", "error", "-i", file, "-vf", "fps=8/15,scale=240:-2,tile=8x1", "-frames:v", "1", join(outDir, `v${r.version}-sheet.jpg`)]);
  }
} finally {
  await writeFile(join(outDir, "result.json"), JSON.stringify(out, null, 1));
  await db.studioEvent.deleteMany({ where: { sessionId: session.id } }).catch(() => undefined);
  await db.studioRender.deleteMany({ where: { sessionId: session.id } }).catch(() => undefined);
  await db.studioMessage.deleteMany({ where: { sessionId: session.id } }).catch(() => undefined);
  await db.studioSession.deleteMany({ where: { id: session.id } }).catch(() => undefined);
  await db.adJob.deleteMany({ where: { workspaceId: ws.id } }).catch(() => undefined);
  await db.creditLedger.deleteMany({ where: { workspaceId: ws.id } }).catch(() => undefined);
  await db.adsEvent.deleteMany({ where: { workspaceId: ws.id } }).catch(() => undefined);
  await db.adsWorkspaceMember.deleteMany({ where: { workspaceId: ws.id } }).catch(() => undefined);
  await db.adsWorkspace.delete({ where: { id: ws.id } }).catch((e) => console.warn("ws cleanup", e.message));
  await db.user.delete({ where: { id: user.id } }).catch((e) => console.warn("user cleanup", e.message));
  console.log("DONE", JSON.stringify({ model, perTurn: out.perTurn, renders: out.renders }));
  await db.$disconnect();
}
