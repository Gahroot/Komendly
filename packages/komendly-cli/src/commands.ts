import { homedir } from "node:os";
import type { Readable } from "node:stream";
import { flagBool, flagString, parseArgs, type ParsedArgs } from "./args.js";
import { Api, ApiError, upgradeUrl, type FetchLike } from "./client.js";
import { loadConfig, looksLikeKey, saveConfig } from "./config.js";
import { downloadTo, uploadFile } from "./files.js";
import { commandHelp, mainHelp, VERSION } from "./help.js";
import { runMcpBridge } from "./mcp.js";
import {
  createSession,
  getRun,
  getThread,
  sendMessage,
  summarizeRun,
  summarizeThread,
  waitForRun,
  waitForSession,
  type RunSummary,
  type SessionSummary,
  type StudioAccount,
} from "./ozzy.js";

export interface Deps {
  fetch: FetchLike;
  env: Record<string, string | undefined>;
  home?: string;
  stdin: Readable;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Reads one line from the user (login prompt). */
  prompt?: (question: string) => Promise<string>;
}

export const EXIT = { ok: 0, error: 1, usage: 2, auth: 3, payment: 4 } as const;

const COMMANDS = new Set(["login", "whoami", "video", "say", "sessions", "session", "upload", "pack", "runs", "run", "download", "mcp", "help"]);

class UsageError extends Error {}

interface Ctx {
  args: ParsedArgs;
  deps: Deps;
  json: boolean;
  log: (line: string) => void;
  print: (human: string, data: unknown) => void;
}

function need(args: ParsedArgs, index: number, what: string): string {
  const v = args.positionals[index];
  if (!v || !v.trim()) throw new UsageError(`Missing ${what}. Run \`komendly ${args.command ?? ""} --help\`.`);
  return v;
}

function limitOf(args: ParsedArgs, def: number): number {
  const raw = flagString(args, "limit");
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new UsageError("--limit must be a whole number from 1 to 100.");
  return n;
}

function timeoutMs(args: ParsedArgs, defSeconds: number): number {
  const raw = flagString(args, "timeout");
  if (raw === undefined) return defSeconds * 1000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError("--timeout must be a number of seconds.");
  return n * 1000;
}

async function apiFor(ctx: Ctx): Promise<Api> {
  const cfg = await loadConfig({ env: ctx.deps.env, home: ctx.deps.home ?? homedir(), keyFlag: flagString(ctx.args, "key"), baseUrlFlag: flagString(ctx.args, "base-url") });
  if (!cfg.apiKey) {
    throw new ApiError(`No API key yet. Create one at ${cfg.baseUrl}/dashboard/api, then run \`komendly login\` or set KOMENDLY_API_KEY.`, 401, "no_key");
  }
  return new Api({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, fetch: ctx.deps.fetch });
}

interface WorkspaceView {
  email: string;
  plan: string;
  isPaid: boolean;
  trialAvailable: boolean;
  balance: number;
}

async function login(ctx: Ctx): Promise<void> {
  let key = flagString(ctx.args, "key") ?? ctx.deps.env.KOMENDLY_API_KEY;
  if (!key) {
    if (!ctx.deps.prompt) throw new UsageError("Pass your key with --key kmd_...");
    key = (await ctx.deps.prompt("Paste your Komendly API key (from /dashboard/api): ")).trim();
  }
  if (!looksLikeKey(key)) throw new UsageError("That doesn't look like a Komendly API key (it starts with kmd_).");
  const cfg = await loadConfig({ env: ctx.deps.env, home: ctx.deps.home ?? homedir(), keyFlag: key, baseUrlFlag: flagString(ctx.args, "base-url") });
  const api = new Api({ baseUrl: cfg.baseUrl, apiKey: key, fetch: ctx.deps.fetch });
  const me = await api.json<WorkspaceView>("GET", "/api/ads/me");
  const baseOverride = flagString(ctx.args, "base-url");
  await saveConfig(cfg.path, { apiKey: key, ...(baseOverride ? { baseUrl: cfg.baseUrl } : {}) });
  ctx.print(`Signed in as ${me.email}. Key saved to ${cfg.path}.`, { ok: true, email: me.email, plan: me.plan, config_path: cfg.path });
}

async function whoami(ctx: Ctx): Promise<void> {
  const api = await apiFor(ctx);
  const [me, studio] = await Promise.all([
    api.json<WorkspaceView>("GET", "/api/ads/me"),
    api.json<{ account: StudioAccount }>("GET", "/api/studio/sessions").catch(() => null),
  ]);
  const data = {
    email: me.email,
    plan: me.plan,
    paid: me.isPaid,
    credits: me.balance,
    free_studio_videos_left: studio?.account.freeVideosLeft ?? null,
    free_pack_available: me.trialAvailable,
    upgrade_url: upgradeUrl(api.baseUrl),
  };
  ctx.print(
    [
      `${me.email}`,
      `Plan: ${me.plan}${me.isPaid ? "" : " (free)"}`,
      `Credits: ${me.balance}`,
      ...(data.free_studio_videos_left === null ? [] : [`Free Studio videos left: ${data.free_studio_videos_left}`]),
      `Free ad pack: ${me.trialAvailable ? "available" : "used"}`,
      ...(me.isPaid ? [] : [`Upgrade: ${data.upgrade_url}`]),
    ].join("\n"),
    data,
  );
}

async function uploadAll(ctx: Ctx, api: Api, sessionId: string | undefined): Promise<string[]> {
  if (ctx.args.files.length > 6) throw new UsageError("Up to 6 files per message.");
  const ids: string[] = [];
  for (const file of ctx.args.files) ids.push((await uploadFile(api, file, { ...(sessionId ? { sessionId } : {}), log: ctx.log })).upload_id);
  return ids;
}

async function studioTurn(ctx: Ctx, api: Api, sessionId: string, message: string): Promise<void> {
  const uploadIds = await uploadAll(ctx, api, sessionId);
  await sendMessage(api, sessionId, message, uploadIds);
  const out = flagString(ctx.args, "out");
  const wait = flagBool(ctx.args, "wait") || out !== undefined;
  if (!wait) {
    const result = summarizeThread(api.baseUrl, await getThread(api, sessionId));
    ctx.print(`Ozzy is on it. Session ${sessionId}\nWatch: ${result.view_url}\nCheck later: komendly session ${sessionId}`, result);
    return;
  }
  ctx.log("Ozzy is working on it. This usually takes a few minutes…");
  const { thread, timedOut } = await waitForSession(api, sessionId, { sleep: ctx.deps.sleep, now: ctx.deps.now, timeoutMs: timeoutMs(ctx.args, 30 * 60), intervalMs: 3000 }, ctx.log);
  const result = summarizeThread(api.baseUrl, thread);
  if (timedOut) result.timed_out = true;
  if (out !== undefined && result.video) {
    const saved = await downloadTo(api, `/api/studio/media?render=${encodeURIComponent(result.video.render_id)}&kind=video&download=1`, out, `ozzy-${result.video.render_id}.mp4`);
    result.files = [saved.path];
  }
  const lines = [
    timedOut ? `Still working after the wait limit. Check again with: komendly session ${sessionId}` : `Ozzy finished (${result.status}).`,
    ...(result.error ? [`Problem: ${result.error}`] : []),
    ...(result.reply ? [`Ozzy: ${result.reply}`] : []),
    ...(result.video ? [`Video: ${result.video.ratio}, ${result.video.seconds}s${result.video.watermarked ? " (watermarked)" : ""} · render ${result.video.render_id}`] : []),
    ...(result.files ?? []).map((f) => `Saved ${f}`),
    `Session: ${sessionId} · ${result.view_url}`,
  ];
  ctx.print(lines.join("\n"), result);
}

async function video(ctx: Ctx): Promise<void> {
  const prompt = need(ctx.args, 0, "the video prompt");
  const api = await apiFor(ctx);
  const session = await createSession(api, prompt);
  ctx.log(`Started session ${session.id}`);
  await studioTurn(ctx, api, session.id, prompt);
}

async function say(ctx: Ctx): Promise<void> {
  const sessionId = need(ctx.args, 0, "the session id");
  const message = need(ctx.args, 1, "the message");
  await studioTurn(ctx, await apiFor(ctx), sessionId, message);
}

async function sessions(ctx: Ctx): Promise<void> {
  const api = await apiFor(ctx);
  const res = await api.json<{ sessions: SessionSummary[] }>("GET", "/api/studio/sessions");
  const list = res.sessions.slice(0, limitOf(ctx.args, 20)).map((s) => ({ session_id: s.id, title: s.title, status: s.status, last_activity_at: s.lastActivityAt, view_url: `${api.baseUrl}/studio/${s.id}` }));
  ctx.print(list.length ? list.map((s) => `${s.session_id}  ${s.status.padEnd(13)} ${s.title}`).join("\n") : "No Studio sessions yet. Start one: komendly video \"...\"", { sessions: list });
}

async function session(ctx: Ctx): Promise<void> {
  const api = await apiFor(ctx);
  const result = summarizeThread(api.baseUrl, await getThread(api, need(ctx.args, 0, "the session id")));
  ctx.print(
    [
      `${result.title} (${result.status})`,
      ...(result.reply ? [`Ozzy: ${result.reply}`] : []),
      ...(result.error ? [`Problem: ${result.error}`] : []),
      ...result.renders.map((r) => `v${r.version}  ${r.ratio} ${r.seconds}s  render ${r.render_id}`),
      `View: ${result.view_url}`,
    ].join("\n"),
    result,
  );
}

async function upload(ctx: Ctx): Promise<void> {
  const file = need(ctx.args, 0, "the file");
  const api = await apiFor(ctx);
  const sessionId = flagString(ctx.args, "session");
  const res = await uploadFile(api, file, { ...(sessionId ? { sessionId } : {}), log: ctx.log });
  ctx.print(`Uploaded ${res.filename}: upload_id ${res.upload_id}`, res);
}

async function pack(ctx: Ctx): Promise<void> {
  const website = need(ctx.args, 0, "the website URL");
  const api = await apiFor(ctx);
  const started = await api.json<{ runId: string; resumed: boolean }>("POST", "/api/ads/runs", { url: website, ...(flagBool(ctx.args, "animated") ? { motion: true } : {}) });
  ctx.log(`${started.resumed ? "Resumed" : "Started"} Ad Pack ${started.runId}`);
  const out = flagString(ctx.args, "out");
  const wait = flagBool(ctx.args, "wait") || out !== undefined;
  if (!wait) {
    const result = summarizeRun(api.baseUrl, await getRun(api, started.runId));
    ctx.print(`Ozzy is reading ${website}. Pack ${result.run_id}\nWatch: ${result.view_url}\nCheck later: komendly run ${result.run_id}`, result);
    return;
  }
  const { run, timedOut } = await waitForRun(api, started.runId, { sleep: ctx.deps.sleep, now: ctx.deps.now, timeoutMs: timeoutMs(ctx.args, 45 * 60), intervalMs: 4000 }, ctx.log);
  const result = summarizeRun(api.baseUrl, run);
  if (timedOut) result.timed_out = true;
  if (out !== undefined && result.progress.ready > 0) {
    const saved = await downloadTo(api, `/api/ads/runs/${encodeURIComponent(run.id)}/download`, out, `${run.id}-ads.zip`);
    result.files = [saved.path];
  }
  ctx.print(runLines(result, timedOut).join("\n"), result);
}

function runLines(result: ReturnType<typeof summarizeRun>, timedOut = false): string[] {
  return [
    timedOut ? `Still working after the wait limit. Check again with: komendly run ${result.run_id}` : `Pack ${result.status.replace(/_/g, " ")}: ${result.progress.ready}/${result.progress.total} ads ready`,
    ...(result.error ? [`Problem: ${result.error}`] : []),
    ...result.ads.map((a) => `${a.kind === "motion" ? "animated" : "static  "} ${a.status.padEnd(9)} ${a.headline}${a.locked ? " (locked)" : ""}${a.assets.length ? `  [${a.assets.map((s) => `${s.ratio} ${s.asset_id}`).join(", ")}]` : ""}`),
    ...(result.files ?? []).map((f) => `Saved ${f}`),
    `View: ${result.view_url}`,
  ];
}

async function runs(ctx: Ctx): Promise<void> {
  const api = await apiFor(ctx);
  const res = await api.json<{ runs: RunSummary[] }>("GET", "/api/ads/runs");
  const list = res.runs.slice(0, limitOf(ctx.args, 20)).map((r) => ({ run_id: r.id, website: r.url, status: r.status, ready: r.readyCount, total: r.totalCount, created_at: r.createdAt, view_url: `${api.baseUrl}/ads/runs/${r.id}` }));
  ctx.print(list.length ? list.map((r) => `${r.run_id}  ${r.status.padEnd(16)} ${r.ready}/${r.total}  ${r.website}`).join("\n") : "No Ad Packs yet. Make one: komendly pack https://your-site.com", { runs: list });
}

async function runCmd(ctx: Ctx): Promise<void> {
  const api = await apiFor(ctx);
  const result = summarizeRun(api.baseUrl, await getRun(api, need(ctx.args, 0, "the run id")));
  ctx.print(runLines(result).join("\n"), result);
}

const NOT_THIS_KIND = new Set([403, 404]);

async function download(ctx: Ctx): Promise<void> {
  const id = need(ctx.args, 0, "the render, asset or run id");
  const out = flagString(ctx.args, "out") ?? ".";
  const type = flagString(ctx.args, "type");
  if (type && !["render", "asset", "run"].includes(type)) throw new UsageError("--type must be render, asset or run.");
  const api = await apiFor(ctx);
  const enc = encodeURIComponent(id);
  const attempts: Array<{ kind: "run" | "asset" | "render"; path: string; name: string }> = [
    { kind: "run", path: `/api/ads/runs/${enc}/download`, name: `${id}-ads.zip` },
    { kind: "asset", path: `/api/ads/assets/${enc}/download`, name: `asset-${id}` },
    { kind: "render", path: `/api/studio/media?render=${enc}&kind=video&download=1`, name: `ozzy-${id}.mp4` },
  ];
  const tries = type ? attempts.filter((a) => a.kind === type) : attempts;
  let lastError: unknown;
  for (const a of tries) {
    try {
      ctx.log(`Downloading ${a.kind} ${id}…`);
      const saved = await downloadTo(api, a.path, out, a.name);
      ctx.print(`Saved ${saved.path} (${Math.max(1, Math.round(saved.bytes / 1024))} KB)`, { kind: a.kind, id, path: saved.path, bytes: saved.bytes });
      return;
    } catch (error) {
      lastError = error;
      const skip = !type && error instanceof ApiError && NOT_THIS_KIND.has(error.status) && error.code !== "locked";
      if (!skip) throw error;
    }
  }
  if (!type) throw new ApiError(`Nothing found with id ${id}. Use a render_id, asset_id or run_id from your account.`, 404, "not_found");
  throw lastError;
}

async function mcp(ctx: Ctx): Promise<void> {
  const api = await apiFor(ctx);
  const cfg = await loadConfig({ env: ctx.deps.env, home: ctx.deps.home ?? homedir(), keyFlag: flagString(ctx.args, "key"), baseUrlFlag: flagString(ctx.args, "base-url") });
  ctx.log(`[komendly mcp] bridging stdio to ${api.baseUrl}/api/mcp`);
  await runMcpBridge({ baseUrl: api.baseUrl, apiKey: cfg.apiKey ?? "", fetch: ctx.deps.fetch, input: ctx.deps.stdin, write: (line) => ctx.deps.stdout(`${line}\n`), log: ctx.log });
}

const HANDLERS: Record<string, (ctx: Ctx) => Promise<void>> = { login, whoami, video, say, sessions, session, upload, pack, runs, run: runCmd, download, mcp };

function exitFor(error: unknown): number {
  if (error instanceof UsageError) return EXIT.usage;
  if (error instanceof ApiError) return error.status === 401 ? EXIT.auth : error.status === 402 ? EXIT.payment : EXIT.error;
  return EXIT.error;
}

/** Entry point (testable): returns the process exit code. */
export async function run(argv: readonly string[], deps: Deps): Promise<number> {
  const parsed = parseArgs(argv);
  const jsonWanted = argv.includes("--json");
  if (!parsed.ok) {
    if (jsonWanted) deps.stdout(`${JSON.stringify({ error: parsed.error, code: "usage" })}\n`);
    else deps.stderr(`${parsed.error}\n\n${mainHelp()}`);
    return EXIT.usage;
  }
  const args = parsed.args;
  if (flagBool(args, "version")) {
    deps.stdout(`${VERSION}\n`);
    return EXIT.ok;
  }
  if (!args.command || args.command === "help") {
    const topic = args.positionals[0];
    deps.stdout(topic ? commandHelp(topic) : mainHelp());
    return EXIT.ok;
  }
  if (!COMMANDS.has(args.command)) {
    deps.stderr(`Unknown command "${args.command}".\n\n${mainHelp()}`);
    return EXIT.usage;
  }
  if (flagBool(args, "help")) {
    deps.stdout(commandHelp(args.command));
    return EXIT.ok;
  }
  const json = flagBool(args, "json");
  const ctx: Ctx = {
    args,
    deps,
    json,
    log: (line) => deps.stderr(`${line}\n`),
    print: (human, data) => deps.stdout(json ? `${JSON.stringify(data, null, 2)}\n` : `${human}\n`),
  };
  const handler = HANDLERS[args.command];
  if (!handler) return EXIT.usage;
  try {
    await handler(ctx);
    return EXIT.ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    if (json) {
      const extra = error instanceof ApiError ? { status: error.status, code: error.code ?? null, ...(error.upgradeUrl ? { upgrade_url: error.upgradeUrl } : {}) } : { code: error instanceof UsageError ? "usage" : "error" };
      deps.stdout(`${JSON.stringify({ error: message, ...extra }, null, 2)}\n`);
    } else {
      deps.stderr(`${message}\n`);
    }
    return exitFor(error);
  }
}
