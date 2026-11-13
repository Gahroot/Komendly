// studio_turn job: one conversational turn of Ozzy Studio.
// Restore the session (project tar + agent session file from S3) -> run the EZ Motion agent for ONE turn in a
// child process (run-studio-agent.mjs) -> stream friendly StudioEvent rows -> deliver the newest MP4 the agent
// rendered (watermark + length cap by the engine) -> charge in one transaction -> persist the session.
import { spawn } from "node:child_process";
import { dropMissingAudio, isMissingAudioError } from "./missing-audio";
import { access, appendFile, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, extname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  STUDIO_MAX_SECONDS,
  StudioTurnPayloadSchema,
  isReferenceAttachment,
  studioKeys,
  type StudioPhase,
} from "../../../src/lib/studio/contracts";
import type { Db } from "../db";
import { JobAbortedError } from "../jobs/abort";
import { PermanentJobError, type JobContext, type JobHandler } from "../jobs/context";
import { errMsg, log } from "../log";
import { agentUsage } from "../modules/ezmotion/agent";
import { type RenderProgress, ffmpegPath, renderComposition } from "../modules/ezmotion/runtime";
import { Limiter } from "../providers/limiter";
import { pickStudioModel } from "./model-choice";
import { chooseStudioBrain, codexWeeklyPctSeen, isCodexLimitError, mimoAtPct, mimoAuth, MIMO_DEFAULT_MODEL, type StudioBrain } from "./brain";
import { type BriefUpload, cleanUploadNames, launchBrief, studioBrief, turnPrompt } from "./brief";
import { chargeAndRecord, decideCharge, isPaidStudioWorkspace } from "./charge";
import { type StudioEventRow, StudioEventMapper, finalReply, parseChildLine, userFacingText } from "./events";
import { finalizeDelivery, posterFrame, probeMedia, ratioOf } from "./media";
import { changedComposition, packProject, pickDelivered, unpackProject, videoFiles } from "./project";
import { livePublisher } from "./live";
import { type TurnTimer, turnTimer } from "./timing";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "modules", "ezmotion", "agent", "run-studio-agent.mjs");

const OPT_SHELL = "/opt/headless-shell";

/** Browser for the agent's snapshots: the engine's own Chrome (env), else the image's /opt/headless-shell. */
export function studioBrowserPath(env: NodeJS.ProcessEnv, optShellExists: boolean): string | null {
  return env.HYPERFRAMES_BROWSER_PATH?.trim() || env.PRODUCER_HEADLESS_SHELL_PATH?.trim() || (optShellExists ? OPT_SHELL : null);
}

/** Render progress -> StudioEvent `progress`, at most once per ~1s (forced rows always go out); ETA from frame rate. */
export function progressThrottle(write: (rows: StudioEventRow[]) => void, label: string, now: () => number, everyMs = 1_000) {
  let lastAt = -Infinity;
  let lastPct = -1;
  let firstFrame: { at: number; frame: number } | null = null;
  return {
    emit(p: RenderProgress, force = false): void {
      const t = now();
      if (p.frame !== undefined && p.total && !firstFrame) firstFrame = { at: t, frame: p.frame };
      if (!force && (t - lastAt < everyMs || p.pct <= lastPct)) return;
      let etaSec: number | undefined;
      if (firstFrame && p.frame !== undefined && p.total && p.frame > firstFrame.frame) {
        const perFrame = (t - firstFrame.at) / (p.frame - firstFrame.frame);
        etaSec = Math.max(1, Math.round(((p.total - p.frame) * perFrame) / 1000 + 2));
      }
      lastAt = t;
      lastPct = p.pct;
      write([{ type: "progress", data: { pct: Math.round(p.pct), label, ...(etaSec !== undefined && p.pct < 100 ? { etaSec } : {}) } }]);
    },
  };
}

export function studioTurnTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.STUDIO_TURN_TIMEOUT_MS) || 25 * 60_000;
}

/** Ordered event writer: rows are inserted in emit order, one insert at a time. */
export function eventWriter(db: Db, sessionId: string, messageId: string) {
  let chain: Promise<unknown> = Promise.resolve();
  const write = (rows: StudioEventRow[]) => {
    chain = chain
      .then(() => db.studioEvent.createMany({ data: rows.map((r) => ({ sessionId, messageId, type: r.type, data: r.data as object })) }))
      .catch((e) => log("warn", "studio event write failed", { error: errMsg(e) }));
  };
  return { write, drain: () => chain };
}

const kindOf = (mime: string): BriefUpload["kind"] => (mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "file");

function attachmentIds(attachments: unknown): string[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.flatMap((a) => (a && typeof a === "object" && typeof (a as { uploadId?: unknown }).uploadId === "string" ? [(a as { uploadId: string }).uploadId] : []));
}

/** StudioMessage.error prefix for a turn whose final render failed (the next turn re-renders). */
export const RENDER_FAILED = "final render failed";

/** Friendly words for a failure; never leaks internals. */
export function friendlyError(code: string): string {
  switch (code) {
    case "cancelled": return "Stopped. Tell me what you'd like instead.";
    case "timeout": return "That took longer than I'm allowed for one go. Try a simpler version, or ask me to continue.";
    case "no_login": return "My video tools are offline for a moment. Please try again in a few minutes.";
    case "render": return "Sorry, my video renderer hiccuped and your video didn't finish. Nothing was charged. Say \"try again\" and I'll render it now.";
    case "delivery": return "I built it but couldn't finish the video file. Please ask me to try the render again.";
    default: return "Something went wrong on my side. Please try again.";
  }
}

export function createStudioTurnHandler(maxConcurrent = Number(process.env.STUDIO_MAX_CONCURRENT) || 3): JobHandler {
  const limiter = new Limiter({ maxConcurrent: Math.max(1, maxConcurrent), maxPerWindow: 10_000, windowMs: 60_000 });
  return (ctx) => limiter.run(() => studioTurn(ctx), ctx.signal);
}

export async function studioTurn(ctx: JobContext): Promise<unknown> {
  const parsed = StudioTurnPayloadSchema.safeParse(ctx.job.payload);
  if (!parsed.success) throw new PermanentJobError("bad studio_turn payload");
  const { sessionId, userMessageId, assistantMessageId } = parsed.data;
  const { db, storage } = ctx;
  const session = await db.studioSession.findUnique({ where: { id: sessionId } });
  const userMsg = await db.studioMessage.findUnique({ where: { id: userMessageId } });
  const asstMsg = await db.studioMessage.findUnique({ where: { id: assistantMessageId } });
  if (!session || !userMsg || !asstMsg) throw new PermanentJobError("studio session or message not found");
  if (asstMsg.status === "cancelled" || asstMsg.status === "done") return { skipped: asstMsg.status };
  const ws = await db.adsWorkspace.findUniqueOrThrow({ where: { id: session.workspaceId } });
  const started = Date.now();
  const tm = turnTimer(Date.now);
  tm.phase("setup");
  const ev = eventWriter(db, sessionId, assistantMessageId);
  const mapper = new StudioEventMapper(ev.write, Date.now);
  await db.studioMessage.update({ where: { id: assistantMessageId }, data: { status: "streaming", jobId: ctx.job.id } });
  await db.studioSession.update({ where: { id: sessionId }, data: { status: "working", lastActivityAt: new Date() } });
  mapper.setPhase("thinking", "Thinking");

  const root = join(ctx.config.scratchDir, "studio", sessionId);
  const home = join(root, "home");
  const project = join(root, "project");
  const motionSessions = join(home, ".ezcoder", "motion-sessions", "studio");
  await rm(root, { recursive: true, force: true });
  await mkdir(motionSessions, { recursive: true });
  await mkdir(join(project, "uploads"), { recursive: true });
  await mkdir(join(project, "brand"), { recursive: true });
  await mkdir(join(project, "renders"), { recursive: true });

  const turnAbort = new AbortController();
  const onShutdown = () => turnAbort.abort("shutdown");
  ctx.signal.addEventListener("abort", onShutdown, { once: true });
  const timer = setTimeout(() => turnAbort.abort("timeout"), studioTurnTimeoutMs());
  const cancelPoll = setInterval(() => {
    db.studioMessage.findUnique({ where: { id: assistantMessageId }, select: { status: true } })
      .then((m) => { if (m?.status === "cancelled") turnAbort.abort("cancelled"); })
      .catch(() => undefined);
  }, 2_000);
  const tick = setInterval(() => mapper.tick(), 150);
  const creds = ctx.provider.agentCredentials;
  let leased: Awaited<ReturnType<NonNullable<typeof creds>["lease"]>> | null = null;
  // First video of a chat on Sol, edits of an existing video on Luna (see ./model-choice.ts).
  const { model, thinking, edit: editTurn } = pickStudioModel({ env: process.env, hasVideo: (await db.studioRender.count({ where: { sessionId } })) > 0 });
  let sessionFile: string | null = null;
  let deliveredRel: string | null = null;
  let liveTimer: ReturnType<typeof setInterval> | undefined;
  try {
    // 1. Restore the project and the agent session.
    tm.phase("restore");
    const firstTurn = !session.agentStateKey;
    if (session.projectKey) {
      const tgz = join(root, "project.tar.gz");
      await writeFile(tgz, await storage.get(session.projectKey));
      if (!(await unpackProject(tgz, project, turnAbort.signal))) throw new Error("project restore failed");
    }
    let resume: string | undefined;
    if (session.agentStateKey) {
      const buf = await storage.get(session.agentStateKey);
      resume = join(motionSessions, buf[0] === 0x1f && buf[1] === 0x8b ? `${sessionId}.jsonl.gz` : `${sessionId}.jsonl`);
      await writeFile(resume, buf);
    }
    tm.phase("brief");
    // 2. Uploads (this message's attachments + every earlier one in the session) and the brand.
    const msgs = await db.studioMessage.findMany({ where: { sessionId, role: "user", createdAt: { lte: userMsg.createdAt } }, select: { attachments: true } });
    const ids = [...new Set(msgs.flatMap((m) => attachmentIds(m.attachments)))];
    const referenceIds = new Set(msgs.flatMap((m) => (Array.isArray(m.attachments) ? m.attachments.flatMap((a: unknown) => (isReferenceAttachment(a) ? [a.uploadId] : [])) : [])));
    const uploads = await db.studioUpload.findMany({
      where: { workspaceId: session.workspaceId, status: { in: ["uploaded", "ready"] }, OR: [{ sessionId }, { id: { in: ids } }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const names = cleanUploadNames(uploads.map((u) => u.filename));
    const briefUploads: BriefUpload[] = [];
    const thisMsg = new Set(attachmentIds(userMsg.attachments));
    const attached: BriefUpload[] = [];
    for (const [i, u] of uploads.entries()) {
      const file = names[i] ?? `file-${i + 1}`;
      await writeFile(join(project, "uploads", file), await storage.get(u.key));
      const b: BriefUpload = { file, kind: kindOf(u.mime), durationSec: u.durationSec, width: u.width, height: u.height, ...(referenceIds.has(u.id) ? { reference: true } : {}) };
      briefUploads.push(b);
      if (thisMsg.has(u.id)) attached.push(b);
    }
    const bp = await db.brandProfile.findFirst({ where: { workspaceId: session.workspaceId }, orderBy: { updatedAt: "desc" } });
    let logoFile: string | null = null;
    if (bp?.logoKey) {
      logoFile = `logo${extname(bp.logoKey) || ".png"}`;
      await storage.get(bp.logoKey).then((b) => writeFile(join(project, "brand", logoFile as string), b)).catch(() => { logoFile = null; });
    }
    const paid = isPaidStudioWorkspace(ws);
    const brand = bp ? {
      name: bp.name, url: bp.url,
      colors: (Array.isArray(bp.colors) ? bp.colors : []).flatMap((c) => (c && typeof c === "object" && typeof (c as { hex?: unknown }).hex === "string" ? [{ hex: (c as { hex: string }).hex, role: (c as { role?: string }).role }] : [])).slice(0, 6),
      fonts: (Array.isArray(bp.fonts) ? bp.fonts : []).flatMap((f) => (f && typeof f === "object" && typeof (f as { family?: unknown }).family === "string" ? [{ family: (f as { family: string }).family, role: (f as { role?: string }).role }] : [])).slice(0, 3),
      logoFile,
    } : null;
    await writeFile(join(project, "studio.md"), studioBrief({ brand, uploads: briefUploads, paid }));
    // Launch video: real recorded footage + the launch structure (./launch.md stays in the project for revisions).
    const launch = parsed.data.launch;
    if (launch) {
      const byName = new Map<string, string>();
      uploads.forEach((u, i) => { if (!byName.has(u.filename)) byName.set(u.filename, names[i] ?? ""); });
      await writeFile(join(project, "launch.md"), launchBrief(launch, (n) => byName.get(n) || null));
    }
    if (await access(join(project, "launch.md")).then(() => true, () => false)) {
      await appendFile(join(project, "studio.md"), "\n## Launch video\n- This chat is a product launch video: read ./launch.md (what they shipped, the recorded footage of their product and the structure). Their recorded footage is the hero.\n");
    }
    const promptFile = join(root, "prompt.txt");
    await writeFile(promptFile, turnPrompt({ userText: userMsg.content, firstTurn, attached }));
    if (attached.some((a) => a.reference)) mapper.setPhase("looking", "Studying the ad");
    else if (attached.some((a) => a.kind === "video")) mapper.setPhase("looking", "Watching your footage");

    tm.phase("login");
    // 3. Login for the child (leased; a refreshed pair is adopted back after the run).
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, EZCODER_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1" };
    delete env.DATABASE_URL; delete env.POSTGRES_URL_NON_POOLING; delete env.S3_SECRET_ACCESS_KEY; delete env.STRIPE_SECRET_KEY; delete env.CODEX_AUTH_FILE;
    const browser = studioBrowserPath(process.env, await access(OPT_SHELL).then(() => true, () => false));
    if (browser) { env.HYPERFRAMES_BROWSER_PATH = browser; env.PRODUCER_HEADLESS_SHELL_PATH = browser; }
    const ff = await ffmpegPath();
    if (ff) env.PATH = `${dirname(ff)}${delimiter}${env.PATH ?? ""}`;
    // Brain: Codex unless its weekly window is nearly used up (then MiMo); see ./brain.ts.
    const mimo = mimoAuth();
    const hasCodex = Boolean(creds) || Boolean(process.env.OPENAI_API_KEY);
    let brain: StudioBrain = chooseStudioBrain({ forced: process.env.STUDIO_BRAIN ?? null, codexPct: mimo ? await codexWeeklyPctSeen(db) : null, atPct: mimoAtPct(), hasMimo: Boolean(mimo), hasCodex });
    const useMimo = async () => {
      await writeFile(join(home, ".ezcoder", "auth.json"), JSON.stringify({ xiaomi: mimo }), { mode: 0o600 });
      brain = "mimo";
    };
    if (brain === "mimo") await useMimo();
    else if (creds) {
      leased = await creds.lease(studioTurnTimeoutMs() + 5 * 60_000);
      await writeFile(join(home, ".ezcoder", "auth.json"), JSON.stringify({ openai: leased }), { mode: 0o600 });
    } else if (!process.env.OPENAI_API_KEY) {
      throw Object.assign(new Error("no Codex login for the studio agent"), { studioCode: "no_login" });
    }
    if (brain === "mimo") log("info", "studio turn on MiMo", { sessionId });
    else log("info", "studio turn model", { sessionId, model, thinking, edit: editTurn });
    // A refreshed Codex pair is adopted back (before any switch to MiMo rewrites auth.json).
    const adoptBack = async () => {
      if (!creds || !leased) return;
      try {
        const after = (JSON.parse(await readFile(join(home, ".ezcoder", "auth.json"), "utf8")) as { openai?: typeof leased }).openai;
        if (after?.refreshToken && after.refreshToken !== leased.refreshToken) await creds.adopt(after);
      } catch { /* unchanged */ }
    };
    const resumeSnapshot = resume ? await readFile(resume).catch(() => null) : null;

    // 4. Run one turn.
    const before = await videoFiles(project);
    const turnStart = Date.now() - 1_000;
    // The last turn's final render failed: render the saved composition this time even if the agent leaves it untouched.
    const lastReply = await db.studioMessage.findFirst({ where: { sessionId, role: "assistant", id: { not: assistantMessageId } }, orderBy: { createdAt: "desc" }, select: { status: true, error: true } });
    const rerender = lastReply?.status === "error" && (lastReply.error ?? "").startsWith(RENDER_FAILED);
    let lastTool = { name: "", arg: "" };
    let previews = 0;
    const previewSeen = new Set<string>();
    const scanPreviews = async () => {
      if (previews >= 8) return;
      const { readdir } = await import("node:fs/promises");
      const found: string[] = [];
      const walk = async (d: string, rel: string, depth: number): Promise<void> => {
        if (depth > 4) return;
        for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
          if (e.isDirectory()) { if (!["uploads", "brand", "node_modules", "assets", ".git"].includes(e.name)) await walk(join(d, e.name), `${rel}${e.name}/`, depth + 1); }
          else if (/\.(png|jpe?g)$/i.test(e.name)) found.push(`${rel}${e.name}`);
        }
      };
      await walk(project, "", 0);
      for (const rel of found.sort()) {
        if (previews >= 8 || previewSeen.has(rel)) continue;
        const s = await stat(join(project, rel)).catch(() => null);
        if (!s || s.mtimeMs < turnStart || s.size > 6_000_000) continue;
        previewSeen.add(rel);
        previews++;
        const name = `${assistantMessageId}-${previews}${extname(rel).toLowerCase()}`;
        const key = studioKeys.preview(session.workspaceId, sessionId, name);
        await storage.put(key, await readFile(join(project, rel)), /\.png$/i.test(rel) ? "image/png" : "image/jpeg");
        ev.write([{ type: "preview", data: { key, caption: /contact|sheet/i.test(rel) ? "Checking the frames" : "A look at the work in progress" } }]);
      }
    };
    // How many user turns came before this one (0 = first message of the session): Ozzy only asks the user in turn 0.
    const priorUserTurns = Math.max(0, (await db.studioMessage.count({ where: { sessionId, role: "user" } })) - 1);
    // Live preview: publish the playable composition as soon as it exists (and again when it changes, throttled).
    const live = livePublisher({ storage, workspaceId: session.workspaceId, sessionId, messageId: assistantMessageId, project, findComposition: () => changedComposition(project, turnStart), emit: (row) => ev.write([row]), now: Date.now });
    liveTimer = setInterval(() => void live.tick(), 3_000);
    const runAgent = () => new Promise<{ ok: boolean; error?: string; asked: boolean; usage?: { inputTokens: number; outputTokens: number; cacheRead: number } }>((resolve) => {
      const brainArgs = brain === "mimo" ? ["--provider", "xiaomi", "--model", process.env.STUDIO_MIMO_MODEL || MIMO_DEFAULT_MODEL] : ["--model", model];
      const child = spawn(process.execPath, [RUNNER, project, promptFile, ...brainArgs, "--thinking", thinking, "--turn", String(priorUserTurns), ...(resume ? ["--session", resume] : [])], { cwd: project, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
      // The agent's own preview/snapshot servers and background tasks share its process group: kill the whole group.
      const killGroup = (sig: NodeJS.Signals) => {
        try {
          if (child.pid && process.platform !== "win32") process.kill(-child.pid, sig);
          else child.kill(sig);
        } catch { /* already gone */ }
      };
      let done: { ok: boolean; error?: string; asked: boolean; usage?: { inputTokens: number; outputTokens: number; cacheRead: number } } = { ok: false, error: "agent exited without a result", asked: false };
      let stderr = "";
      child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4_000)));
      createInterface({ input: child.stdout }).on("line", (raw) => {
        const line = parseChildLine(raw);
        if (!line) return;
        if (line.type === "session") sessionFile = line.path;
        else if (line.type === "usage") done.usage = line;
        else if (line.type === "done") done = { ...done, ok: line.ok, error: line.error, asked: (line as { asked?: boolean }).asked === true };
        else {
          if (line.type === "tool_end" && (lastTool.name === "screenshot" || /contact-sheet/.test(lastTool.arg))) void scanPreviews().catch(() => undefined);
          if (line.type === "tool") { lastTool = { name: line.name, arg: line.arg }; tm.toolStart(line.name, line.arg); }
          else if (line.type === "tool_end") tm.toolEnd();
          mapper.handle(line);
        }
      });
      const kill = () => killGroup("SIGTERM");
      turnAbort.signal.addEventListener("abort", kill, { once: true });
      child.on("close", (code) => {
        turnAbort.signal.removeEventListener("abort", kill);
        // Leftover preview servers from this turn (so "too many preview sessions" can never build up).
        killGroup("SIGKILL");
        if (!done.ok && code !== 0) log("warn", "studio agent exited", { code, stderr: stderr.slice(-600) });
        setTimeout(() => resolve(done), 50);
      });
    });
    tm.phase("agent");
    let result = await runAgent();
    // Codex hit its plan limit mid-turn: put the session back as it was and run the same turn once on MiMo.
    if (!result.ok && !result.asked && brain === "codex" && mimo && !turnAbort.signal.aborted && isCodexLimitError(result.error)) {
      log("warn", "studio turn: Codex limit, retrying on MiMo", { sessionId, error: (result.error ?? "").slice(0, 200) });
      await adoptBack();
      if (resume && resumeSnapshot) await writeFile(resume, resumeSnapshot);
      await useMimo();
      result = await runAgent();
    }
    tm.phase("agent_after");
    mapper.flush();
    clearInterval(liveTimer);
    // The latest edit plays in the chat while the final video is made.
    if (!turnAbort.signal.aborted && !result.asked) await live.flush();
    await scanPreviews().catch(() => undefined);
    await adoptBack();
    const usage = await agentUsage(home, brain === "mimo" ? process.env.STUDIO_MIMO_MODEL || MIMO_DEFAULT_MODEL : model).catch(() => ({ costMicros: 0, inputTokens: 0, outputTokens: 0 }));
    ctx.usage.push({ costMicros: usage.costMicros, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, latencyMs: Date.now() - started });

    const reason = turnAbort.signal.aborted ? String(turnAbort.signal.reason) : null;
    if (reason === "shutdown") {
      await db.studioMessage.update({ where: { id: assistantMessageId }, data: { status: "queued" } });
      await db.studioSession.update({ where: { id: sessionId }, data: { status: "queued" } });
      throw new JobAbortedError("shutdown");
    }
    const asked = result.asked || mapper.questions.length > 0;
    // 5. Delivery (not after a question, a cancel or a timeout).
    const attachments: object[] = [];
    let delivered: { renderId: string; version: number } | null = null;
    let renderFailed = false;
    if (!reason && !asked) {
      const agentRel = pickDelivered(before, await videoFiles(project));
      const agentMtime = agentRel ? (before.get(agentRel) === undefined ? (await stat(join(project, agentRel)).catch(() => null))?.mtimeMs ?? 0 : 0) : 0;
      const comp = (await changedComposition(project, turnStart)) ?? (rerender ? await changedComposition(project, 0) : null);
      const compMtime = comp ? (await stat(join(comp, "index.html")).catch(() => null))?.mtimeMs ?? 0 : 0;
      let source: string | null = null;
      // The engine owns the final render; an agent MP4 wins only as a footage-only edit newer than any composition.
      if (agentRel && (!comp || agentMtime > compMtime)) {
        deliveredRel = agentRel;
        source = join(project, agentRel);
      } else if (comp) {
        tm.phase("render");
        mapper.setPhase("rendering", "Rendering your video");
        const out = join(root, "engine-render.mp4");
        const prog = progressThrottle(ev.write, "Rendering your video", Date.now);
        prog.emit({ pct: 0, stage: "start" }, true);
        let rr = await renderComposition(comp, out, { fps: 30, signal: turnAbort.signal, timeoutMs: 10 * 60_000, onProgress: (p) => prog.emit(p) });
        // Two retries with backoff: a background ffmpeg cut can still be landing, or the box is briefly out of
        // Chrome capacity; the last try uses one Chrome worker so it fits on a busy machine.
        for (const [i, waitMs] of [[1, 3_000], [2, 20_000]] as const) {
          if (rr.code === 0 || turnAbort.signal.aborted) break;
          log("warn", "studio render retry", { attempt: i, error: (rr.stderr || rr.stdout).slice(-300) });
          await new Promise((r) => setTimeout(r, waitMs));
          rr = await renderComposition(comp, out, { fps: 30, signal: turnAbort.signal, timeoutMs: 10 * 60_000, onProgress: (p) => prog.emit(p, p.pct === 0), ...(i === 2 ? { workers: 1 } : {}) });
        }
        // A dangling music/audio reference blocks the whole render: drop it and render once more.
        if (rr.code !== 0 && !turnAbort.signal.aborted && isMissingAudioError(rr.stderr || rr.stdout) && (await dropMissingAudio(comp)) > 0) {
          log("warn", "studio render: dropped missing audio, rendering again", {});
          rr = await renderComposition(comp, out, { fps: 30, signal: turnAbort.signal, timeoutMs: 10 * 60_000, onProgress: (p) => prog.emit(p, p.pct === 0) });
        }
        log("info", "studio render", { ms: rr.ms, code: rr.code });
        if (rr.code === 0 && (await stat(out).catch(() => null))?.size) { source = out; prog.emit({ pct: 100, stage: "done" }, true); }
        else log("warn", "studio render failed", { error: (rr.stderr || rr.stdout).slice(-300) });
        if (!source && agentRel) { deliveredRel = agentRel; source = join(project, agentRel); }
      }
      renderFailed = !source && Boolean(comp);
      if (source) {
        delivered = await deliver(ctx, { sessionId, assistantMessageId, workspaceId: session.workspaceId, source, root, costMicros: usage.costMicros, signal: turnAbort.signal, ev: ev.write, mapper, tm });
        if (delivered) attachments.push({ renderId: delivered.renderId });
      }
    }
    tm.phase("pack");
    // 6. Persist the session (project tar + agent session file).
    const tgz = join(root, "out.tar.gz");
    const packed = await packProject(project, tgz, new Set(deliveredRel ? [deliveredRel] : []));
    const update: { projectKey?: string; agentStateKey?: string } = {};
    if (packed.ok) {
      update.projectKey = studioKeys.project(session.workspaceId, sessionId);
      await storage.put(update.projectKey, await readFile(tgz), "application/gzip");
    } else log("warn", "studio pack failed", { error: packed.error });
    if (sessionFile && (await stat(sessionFile).catch(() => null))?.size) {
      update.agentStateKey = studioKeys.agentState(session.workspaceId, sessionId);
      await storage.put(update.agentStateKey, await readFile(sessionFile), "application/x-ndjson");
    }
    // Never end a "your video is ready" turn without a video: say so (nothing is charged); the project is saved above.
    if (renderFailed && !reason) throw Object.assign(new Error(RENDER_FAILED), { studioCode: "render" });
    tm.phase("finish");
    // 7. Finish the message.
    if (reason) {
      const code = reason === "cancelled" ? "cancelled" : "timeout";
      ev.write([{ type: "error", data: { message: friendlyError(code), code } }]);
      await db.studioMessage.update({ where: { id: assistantMessageId }, data: { status: code === "cancelled" ? "cancelled" : "error", content: userFacingText(mapper.finalText()), error: code, attachments } });
      await db.studioSession.update({ where: { id: sessionId }, data: { ...update, status: code === "cancelled" ? "idle" : "error", lastActivityAt: new Date() } });
      ev.write([{ type: "done", data: { messageId: assistantMessageId } }]);
      await ev.drain();
      return { ok: false, code };
    }
    if (!result.ok && !asked && !delivered) throw new Error(result.error ?? "agent failed");
    for (const q of mapper.questions) attachments.push({ question: q });
    let content = finalReply(mapper.finalText(), { delivered: Boolean(delivered), asked });
    if (!content && delivered) content = "Here's your video.";
    mapper.setPhase("done", "Done");
    await db.studioMessage.update({ where: { id: assistantMessageId }, data: { status: "done", content, attachments } });
    await db.studioSession.update({ where: { id: sessionId }, data: { ...update, status: asked ? "awaiting_user" : "idle", lastActivityAt: new Date() } });
    if (session.title === "New video") await nameSession(ctx, sessionId, userMsg.content, content).catch((e) => log("warn", "studio title failed", { error: errMsg(e) }));
    ev.write([{ type: "done", data: { messageId: assistantMessageId } }]);
    await ev.drain();
    const timing = tm.summary();
    log("info", "studio turn timing", { sessionId, model, ...timing });
    return { ok: true, asked, timing, renderId: delivered?.renderId ?? null, version: delivered?.version ?? null, ms: Date.now() - started, costMicros: usage.costMicros };
  } catch (e) {
    if (e instanceof JobAbortedError) throw e;
    const code = (e as { studioCode?: string }).studioCode ?? "failed";
    log("error", "studio turn failed", { sessionId, error: errMsg(e) });
    mapper.flush();
    ev.write([{ type: "status", data: { phase: "error" satisfies StudioPhase, label: "Something went wrong" } }, { type: "error", data: { message: friendlyError(code), code } }, { type: "done", data: { messageId: assistantMessageId } }]);
    // A failed render must not leave Ozzy's "it's ready" text standing as the answer.
    const content = code === "render" ? friendlyError(code) : userFacingText(mapper.finalText());
    await db.studioMessage.update({ where: { id: assistantMessageId }, data: { status: "error", error: errMsg(e).slice(0, 500), content } }).catch(() => undefined);
    await db.studioSession.update({ where: { id: sessionId }, data: { status: "error", lastActivityAt: new Date() } }).catch(() => undefined);
    await ev.drain();
    return { ok: false, error: errMsg(e).slice(0, 300) };
  } finally {
    clearTimeout(timer);
    clearInterval(cancelPoll);
    clearInterval(tick);
    clearInterval(liveTimer);
    ctx.signal.removeEventListener("abort", onShutdown);
    if (!process.env.STUDIO_KEEP_WORKDIR) await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Probe, watermark/cap, upload, then charge + record in one transaction. Null when nothing deliverable. */
async function deliver(ctx: JobContext, o: { sessionId: string; assistantMessageId: string; workspaceId: string; source: string; root: string; costMicros: number; signal: AbortSignal; ev: (rows: StudioEventRow[]) => void; mapper: StudioEventMapper; tm?: TurnTimer }): Promise<{ renderId: string; version: number } | null> {
  const { db, storage } = ctx;
  const info = await probeMedia(o.source, o.signal);
  if (!info?.hasVideo || !info.width || !info.height) throw Object.assign(new Error("delivered file is not a video"), { studioCode: "delivery" });
  o.mapper.setPhase("reviewing", "Finishing your video");
  o.tm?.phase("finalize");
  const ws = await db.adsWorkspace.findUniqueOrThrow({ where: { id: o.workspaceId } });
  const session = await db.studioSession.findUniqueOrThrow({ where: { id: o.sessionId }, select: { freeVideo: true, autopilotWeek: true } });
  const priorRenders = await db.studioRender.count({ where: { sessionId: o.sessionId } });
  const maxSeconds = isPaidStudioWorkspace(ws) ? STUDIO_MAX_SECONDS.paid : STUDIO_MAX_SECONDS.free;
  const seconds = Math.min(info.durationSec ?? 0, maxSeconds);
  let watermark = decideCharge(ws, { priorRenders, seconds, sessionFree: session.freeVideo, autopilot: session.autopilotWeek !== null }).watermark;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = join(o.root, `deliver-${attempt}.mp4`);
    o.ev([{ type: "progress", data: { pct: 0, label: "Finishing your video" } }]);
    const fin = await finalizeDelivery({ input: o.source, output: out, maxSeconds, watermark, width: info.width, height: info.height, hasAudio: info.hasAudio, pngPath: join(o.root, "wm.png"), signal: o.signal, info });
    if (!fin.ok) throw Object.assign(new Error(`finalize failed: ${fin.error}`), { studioCode: "delivery" });
    o.ev([{ type: "progress", data: { pct: 100, label: "Finishing your video" } }]);
    o.tm?.phase("upload");
    const final = await probeMedia(out, o.signal);
    const version = priorRenders + 1 + attempt;
    const key = studioKeys.render(o.workspaceId, o.sessionId, version);
    const posterKey = studioKeys.poster(o.workspaceId, o.sessionId, version);
    await storage.put(key, await readFile(out), "video/mp4");
    const jpg = join(o.root, `poster-${attempt}.jpg`);
    const hasPoster = await posterFrame(out, jpg, final?.durationSec ?? seconds, o.signal);
    if (hasPoster) await storage.put(posterKey, await readFile(jpg), "image/jpeg");
    o.tm?.phase("charge");
    const r = await chargeAndRecord(db, {
      sessionId: o.sessionId, messageId: o.assistantMessageId, workspaceId: o.workspaceId,
      key: () => key, posterKey: () => (hasPoster ? posterKey : null),
      ratio: ratioOf(info.width, info.height), seconds: final?.durationSec ?? seconds, width: info.width, height: info.height, costMicros: o.costMicros,
    }, watermark, ctx.now());
    if (!r.ok) { watermark = true; continue; }
    if (r.version !== version) log("warn", "studio render version moved", { expected: version, got: r.version });
    o.ev([
      { type: "render", data: { renderId: r.renderId, version: r.version, ratio: ratioOf(info.width, info.height), seconds: Math.round((final?.durationSec ?? seconds) * 10) / 10, watermarked: watermark, free: r.decision.useFreeVideo || session.freeVideo === true || r.decision.insufficient, ...(hasPoster ? { posterKey } : {}) } },
      { type: "charge", data: { renderId: r.renderId, credits: r.decision.deducted, free: r.decision.deducted === 0, balanceAfter: r.balanceAfter, freeVideosLeft: r.freeVideosLeft, ...(r.decision.insufficient ? { insufficient: true, neededCredits: r.decision.credits } : {}) } },
    ]);
    return { renderId: r.renderId, version: r.version };
  }
  throw Object.assign(new Error("charge state kept changing"), { studioCode: "delivery" });
}

/** A 3-6 word title from the first exchange (cheap call, low reasoning). */
async function nameSession(ctx: JobContext, sessionId: string, userText: string, reply: string): Promise<void> {
  const r = await ctx.provider.text({
    system: "You name video projects. Reply with a 3-6 word title in plain words, no quotes, no trailing punctuation.",
    prompt: `User's request: ${userText.slice(0, 600)}\nReply: ${reply.slice(0, 300)}`,
    reasoning: "low",
    signal: ctx.signal,
  });
  ctx.usage.push(r.usage);
  const title = r.text.trim().replace(/^["'“]+|["'”.]+$/g, "").split(/\s+/).slice(0, 6).join(" ").slice(0, 60);
  if (title) await ctx.db.studioSession.updateMany({ where: { id: sessionId, title: "New video" }, data: { title } });
}
