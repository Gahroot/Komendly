// System #2 ai_assistant (engine side): hourly synthetic check of the production MCP server (OAuth discovery, 401 challenge,
// initialize + tools/list via the anonymous probe) + outputs = assistant sign-ups and tool calls since the last cycle.
import { parseBeat, recordSystemRun, systemEnabled, systemHeartbeatId } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import { errMsg, log } from "../log";

export const AI_KEY = "ai_assistant" as const;
/** Tools the listings promise; the check fails if one disappears. */
export const REQUIRED_TOOLS = ["ads_create_pack", "ads_get_run", "get_account", "studio_create_video"];

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function appBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.MCP_PROBE_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
}

async function rpc(f: Fetch, url: string, body: object, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown> | null; headers: Headers }> {
  const res = await f(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // SSE fallback: last "data:" line
    const line = text.split("\n").filter((l) => l.startsWith("data:")).pop();
    if (line) json = JSON.parse(line.slice(5)) as Record<string, unknown>;
  }
  return { status: res.status, json, headers: res.headers };
}

/** Real end-to-end check, no account needed. Returns null when healthy, else what broke. */
export async function probeMcp(base: string, f: Fetch = fetch): Promise<{ error: string | null; tools: number }> {
  const mcp = `${base}/api/mcp`;
  const prm = await f(`${base}/.well-known/oauth-protected-resource/api/mcp`, { signal: AbortSignal.timeout(15_000) });
  const prmJson = (await prm.json().catch(() => null)) as { resource?: string; authorization_servers?: string[] } | null;
  if (prm.status !== 200 || !prmJson?.resource?.endsWith("/api/mcp") || !prmJson.authorization_servers?.length) return { error: `protected-resource metadata broken (HTTP ${prm.status})`, tools: 0 };
  const as = await f(`${prmJson.authorization_servers[0]}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15_000) });
  const asJson = (await as.json().catch(() => null)) as { registration_endpoint?: string; authorization_endpoint?: string; token_endpoint?: string } | null;
  if (as.status !== 200 || !asJson?.registration_endpoint || !asJson.authorization_endpoint || !asJson.token_endpoint) return { error: `authorization-server metadata broken (HTTP ${as.status})`, tools: 0 };
  const challenge = await rpc(f, mcp, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  if (challenge.status !== 401 || !/resource_metadata=/.test(challenge.headers.get("www-authenticate") ?? "")) return { error: `unauthenticated call didn't get the OAuth challenge (HTTP ${challenge.status})`, tools: 0 };
  const probe = { "x-komendly-client": "probe" };
  const init = await rpc(f, mcp, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "komendly-health", version: "1" } } }, probe);
  const server = (init.json?.result as { serverInfo?: { name?: string } } | undefined)?.serverInfo;
  if (init.status !== 200 || !server?.name) return { error: `initialize failed (HTTP ${init.status})`, tools: 0 };
  const list = await rpc(f, mcp, { jsonrpc: "2.0", id: 2, method: "tools/list" }, probe);
  const tools = ((list.json?.result as { tools?: { name: string; annotations?: Record<string, unknown> }[] } | undefined)?.tools ?? []);
  if (list.status !== 200 || !tools.length) return { error: `tools/list failed (HTTP ${list.status})`, tools: 0 };
  const names = new Set(tools.map((t) => t.name));
  const missing = REQUIRED_TOOLS.filter((t) => !names.has(t));
  if (missing.length) return { error: `tools missing: ${missing.join(", ")}`, tools: tools.length };
  const unannotated = tools.filter((t) => typeof t.annotations?.readOnlyHint !== "boolean" || typeof t.annotations?.openWorldHint !== "boolean").map((t) => t.name);
  if (unannotated.length) return { error: `tools without annotations (directory review blocker): ${unannotated.join(", ")}`, tools: tools.length };
  return { error: null, tools: tools.length };
}

/** Assistant-originated sign-ups + tool calls since `since`. */
export async function assistantOutputs(db: Db, since: Date): Promise<{ signups: number; toolCalls: number }> {
  const [signups, toolCalls] = await Promise.all([
    db.adsEvent.count({ where: { name: "signed_up", createdAt: { gt: since }, props: { path: ["firstTouch", "utm_source"], equals: "ai_assistant" } } }),
    db.adsEvent.count({ where: { name: "assistant_tool_called", createdAt: { gt: since } } }),
  ]);
  return { signups, toolCalls };
}

/** One hourly cycle (skipped while sys_ai_assistant is off). */
export async function aiAssistantTick(db: Db, opts: { now?: Date; fetch?: Fetch; base?: string } = {}): Promise<{ ok: boolean; outputs: number } | null> {
  const now = opts.now ?? new Date();
  if (!(await systemEnabled(db, AI_KEY))) return null;
  try {
    const prev = parseBeat((await db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(AI_KEY) } }))?.meta);
    const since = prev.lastRunAt ? new Date(prev.lastRunAt) : new Date(now.getTime() - 3_600_000);
    const [check, out] = await Promise.all([probeMcp(opts.base ?? appBase(), opts.fetch).catch((e: unknown) => ({ error: `MCP check failed: ${errMsg(e)}`, tools: 0 })), assistantOutputs(db, since)]);
    const outputs = out.signups + out.toolCalls;
    const ok = check.error === null;
    await recordSystemRun(db, AI_KEY, { ok, outputs, error: check.error }, now);
    log(ok ? "info" : "warn", "ai assistant tick", { ...out, tools: check.tools, error: check.error });
    return { ok, outputs };
  } catch (e) {
    await recordSystemRun(db, AI_KEY, { ok: false, error: errMsg(e) }, now);
    return { ok: false, outputs: 0 };
  }
}

export function startAiAssistantLoop(db: Db, everyMs = 60 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    aiAssistantTick(db).catch((e: unknown) => log("warn", "ai assistant tick failed", { error: errMsg(e) })).finally(() => (running = false));
  };
  const first = setTimeout(tick, 120_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
