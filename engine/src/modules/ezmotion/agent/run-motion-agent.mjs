#!/usr/bin/env node
// Headless EZ Motion agent run (the same agent as EZ Coder's Motion mode, from @prestyj/cli).
// Usage: node run-motion-agent.mjs <projectDir> <briefFile> [--model gpt-6.1-sol] [--thinking medium]
// Auth: the openai entry of $HOME/.ezcoder/auth.json (the caller writes a per-run HOME).
// Writes a JSON line per tool call to stderr; prints {"ok":true} or {"ok":false,"error"} last on stdout.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const [projectDir, briefFile] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!projectDir || !briefFile) { console.log(JSON.stringify({ ok: false, error: "usage: run-motion-agent.mjs <projectDir> <briefFile>" })); process.exit(2); }

const require = createRequire(import.meta.url);
let cliDist;
try {
  cliDist = dirname(require.resolve("@prestyj/cli"));
} catch {
  cliDist = process.env.EZMOTION_CLI_DIST;
}
if (!cliDist) { console.log(JSON.stringify({ ok: false, error: "@prestyj/cli not installed" })); process.exit(3); }
const { createMotionAgentSession } = await import(pathToFileURL(join(cliDist, "motion-agent", "motion-agent.js")).href);

const ac = new AbortController();
process.on("SIGTERM", () => ac.abort());
process.on("SIGINT", () => ac.abort());
const brief = await readFile(briefFile, "utf8");
const home = process.env.HOME ?? "";
let session;
try {
  session = await createMotionAgentSession({
    provider: "openai",
    model: opt("--model", "gpt-6.1-sol"),
    thinkingLevel: opt("--thinking", "medium"),
    cwd: resolve(projectDir),
    signal: ac.signal,
    sessionsDir: join(home, ".ezcoder", "sessions"),
    backgroundMcpConnect: true,
  });
  const started = Date.now();
  session.eventBus.on("tool_call_start", ({ name, args: a }) => {
    const brief = typeof a?.command === "string" ? a.command : typeof a?.path === "string" ? a.path : typeof a?.file_path === "string" ? a.file_path : "";
    process.stderr.write(`${JSON.stringify({ t: Math.round((Date.now() - started) / 1000), tool: name, arg: String(brief).slice(0, 200) })}\n`);
  });
  session.eventBus.on("error", ({ error }) => process.stderr.write(`${JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) })}\n`));
  let text = "";
  session.eventBus.on("text_delta", ({ text: t }) => { text += t; });
  // The agent's background tasks (renders) hold unref'd handles: keep the loop alive until it finishes.
  const keepAlive = setInterval(() => undefined, 1000);
  try {
    await session.initialize();
    await session.prompt(brief);
  } finally {
    clearInterval(keepAlive);
  }
  console.log(JSON.stringify({ ok: true, message: text.slice(-1500) }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message.slice(0, 600) : String(e) }));
  process.exitCode = 1;
} finally {
  await session?.dispose?.().catch?.(() => undefined);
}
