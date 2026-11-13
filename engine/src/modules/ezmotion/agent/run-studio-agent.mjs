#!/usr/bin/env node
// Ozzy Studio: ONE conversational turn of the real EZ Motion agent (@prestyj/cli Motion mode), headless.
// Usage: node run-studio-agent.mjs <projectDir> <promptFile> [--provider openai|xiaomi] [--model m] [--thinking t] [--session <file>]
// --session resumes a prior Motion session file (must live under $HOME/.ezcoder/motion-sessions).
// Auth: the openai (or xiaomi) entry of $HOME/.ezcoder/auth.json (the engine writes a per-run HOME).
// stdout: one JSON line per event: text_delta | tool | tool_end | question | session | usage | done (last).
// ask_user: the question is printed, the tool tells the agent the user's next message is the answer,
// and the run stops at the next step boundary (after the tool result is persisted) so the turn ends cleanly.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const [projectDir, promptFile] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
if (!projectDir || !promptFile) { out({ type: "done", ok: false, error: "usage: run-studio-agent.mjs <projectDir> <promptFile>" }); process.exit(2); }

const require = createRequire(import.meta.url);
let cliDist;
try { cliDist = dirname(require.resolve("@prestyj/cli")); } catch { cliDist = process.env.EZMOTION_CLI_DIST; }
if (!cliDist) { out({ type: "done", ok: false, error: "@prestyj/cli not installed" }); process.exit(3); }
const load = (p) => import(pathToFileURL(join(cliDist, p)).href);
const { createMotionAgentSession } = await load("motion-agent/motion-agent.js");
const { createAskUserTool } = await load("tools/ask-user.js");
const { decideAsk } = await import(new URL("./ask-filter.mjs", import.meta.url).href);
const { findBlankFrames, findLayoutProblems, qaFixPrompt, hasAudio, wantsSilence, newestCompositionHtml } = await import(new URL("./blank-check.mjs", import.meta.url).href);

const ac = new AbortController();
process.on("SIGTERM", () => ac.abort());
process.on("SIGINT", () => ac.abort());
const prompt = await readFile(promptFile, "utf8");
const home = process.env.HOME ?? "";
let asked = false;
let stoppedForQuestion = false;
const turnIndex = Number(opt("--turn", "0")) || 0;
let building = false;
const askUserTool = createAskUserTool(async (request) => {
  const { forward, answers } = decideAsk(request.questions ?? [], { turnIndex, building, askedBefore: asked });
  if (!forward.length) {
    process.stderr.write(`${JSON.stringify({ askFiltered: (request.questions ?? []).map((q) => String(q.question).slice(0, 120)) })}\n`);
    return { action: "answer", answers: { ...answers, _note: "The user is not a technician: decide technical things yourself and keep going. Don't ask them again this turn." } };
  }
  for (const q of forward) {
    const options = (q.options ?? []).map((o) => ({ label: String(o.label ?? ""), value: o.value ?? o.label, hint: o.hint, recommended: o.recommended }));
    if (q.kind === "confirm" && !options.length) options.push({ label: "Yes", value: "yes" }, { label: "No", value: "no" });
    out({ type: "question", question: [q.question, q.detail].filter(Boolean).join(" — "), options, allowOther: q.allowOther ?? true });
  }
  asked = true;
  // The answer arrives as the user's next chat message (a new turn).
  return { action: "cancel", superseded: true };
});

let session;
let usage = { inputTokens: 0, outputTokens: 0, cacheRead: 0 };
try {
  session = await createMotionAgentSession({
    // --provider xiaomi: MiMo fallback when the Codex weekly window is nearly used up (studio/brain.ts).
    provider: opt("--provider", "openai"),
    model: opt("--model", "gpt-6.1-sol"),
    thinkingLevel: opt("--thinking", "high"),
    cwd: resolve(projectDir),
    signal: ac.signal,
    sessionsDir: join(home, ".ezcoder", "sessions"),
    sessionId: opt("--session", undefined),
    backgroundMcpConnect: true,
    additionalTools: [askUserTool],
  });
  const names = new Map();
  session.eventBus.on("text_delta", ({ text }) => { if (!stoppedForQuestion) out({ type: "text_delta", text }); });
  session.eventBus.on("tool_call_start", ({ toolCallId, name, args: a }) => {
    names.set(toolCallId, name);
    if (name === "write" || name === "edit" || name === "bash") building = true;
    const arg = typeof a?.command === "string" ? a.command : typeof a?.path === "string" ? a.path : typeof a?.file_path === "string" ? a.file_path : typeof a?.url === "string" ? a.url : typeof a?.pattern === "string" ? a.pattern : "";
    out({ type: "tool", name, arg: String(arg).slice(0, 400) });
  });
  session.eventBus.on("tool_call_end", ({ toolCallId }) => out({ type: "tool_end", name: names.get(toolCallId) ?? "" }));
  session.eventBus.on("turn_end", ({ usage: u }) => {
    usage = { inputTokens: usage.inputTokens + (u?.inputTokens ?? 0), outputTokens: usage.outputTokens + (u?.outputTokens ?? 0), cacheRead: usage.cacheRead + (u?.cacheRead ?? 0) };
  });
  // Step boundary after the ask_user result: its messages are flushed to the session file; stop here.
  session.eventBus.on("checkpoint", () => { if (asked && !stoppedForQuestion) { stoppedForQuestion = true; ac.abort(); } });
  session.eventBus.on("error", ({ error }) => process.stderr.write(`${JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) })}\n`));
  const keepAlive = setInterval(() => undefined, 1000);
  try {
    await session.initialize();
    const promptStart = Date.now();
    await session.prompt(prompt);
    // Quality gate (one fix round at most): blank frames, stacked/covered text, missing music.
    // STUDIO_QA=0 turns it all off; STUDIO_BLANK_CHECK / STUDIO_LAYOUT_CHECK / STUDIO_MUSIC_CHECK=0 turn off one check.
    if (!asked && !ac.signal.aborted && process.env.STUDIO_QA !== "0") {
      const dir = resolve(projectDir);
      const since = promptStart - 1000;
      const [blank, layout, html] = await Promise.all([
        process.env.STUDIO_BLANK_CHECK === "0" ? [] : findBlankFrames(dir, { sinceMs: since }).catch(() => []),
        process.env.STUDIO_LAYOUT_CHECK === "0" ? [] : findLayoutProblems(dir, { sinceMs: since }).catch(() => []),
        newestCompositionHtml(dir, since).catch(() => null),
      ]);
      const music = process.env.STUDIO_MUSIC_CHECK !== "0" && !wantsSilence(prompt) && html !== null && !hasAudio(html);
      process.stderr.write(`${JSON.stringify({ qa: { blank, layout: layout.length, music: !music } })}\n`);
      if (blank.length || layout.length || music) {
        out({ type: "qa", blank, layout: layout.length, music: !music });
        await session.prompt(qaFixPrompt({ blank, layout, music }));
      }
    }
  } finally {
    clearInterval(keepAlive);
  }
  const st = session.getState?.();
  if (st?.sessionPath) out({ type: "session", path: st.sessionPath });
  out({ type: "usage", ...usage });
  out({ type: "done", ok: true, asked });
} catch (e) {
  const st = session?.getState?.();
  if (st?.sessionPath) out({ type: "session", path: st.sessionPath });
  if (stoppedForQuestion) out({ type: "done", ok: true, asked: true });
  else out({ type: "done", ok: false, error: e instanceof Error ? e.message.slice(0, 600) : String(e) });
  process.exitCode = stoppedForQuestion ? 0 : 1;
} finally {
  await session?.dispose?.().catch?.(() => undefined);
}
