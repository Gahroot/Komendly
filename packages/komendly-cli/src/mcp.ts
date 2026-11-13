import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { friendlyError, USER_AGENT, type FetchLike } from "./client.js";

export interface BridgeOptions {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
  input: Readable;
  /** Receives exactly one JSON-RPC message per call (newline added by the bridge). */
  write: (line: string) => void;
  log: (line: string) => void;
}

type JsonRpcId = string | number | null;

function idsOf(msg: unknown): JsonRpcId[] {
  const list = Array.isArray(msg) ? msg : [msg];
  const out: JsonRpcId[] = [];
  for (const m of list) {
    if (m && typeof m === "object" && "id" in m && "method" in m) {
      const id = (m as { id: unknown }).id;
      if (typeof id === "string" || typeof id === "number") out.push(id);
    }
  }
  return out;
}

function isInitialize(msg: unknown): boolean {
  return !!msg && typeof msg === "object" && !Array.isArray(msg) && (msg as { method?: unknown }).method === "initialize";
}

function errorLine(id: JsonRpcId, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

/** Parse an SSE body incrementally; call `onData` with each event's joined `data:` payload. */
export async function readSse(body: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let data: string[] = [];
  const flushLine = (line: string) => {
    if (line === "") {
      if (data.length) onData(data.join("\n"));
      data = [];
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const fieldName = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (fieldName === "data") data.push(value);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.search(/\r\n|\n|\r/)) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(buf[nl] === "\r" && buf[nl + 1] === "\n" ? nl + 2 : nl + 1);
      flushLine(line);
    }
  }
  buf += decoder.decode();
  if (buf) flushLine(buf);
  flushLine("");
}

/**
 * stdio <-> hosted MCP bridge. Each stdin line is one JSON-RPC message, POSTed to /api/mcp with the key.
 * JSON and SSE responses are written back as single lines; the Mcp-Session-Id header is kept and replayed.
 */
export async function runMcpBridge(opts: BridgeOptions): Promise<void> {
  const endpoint = `${opts.baseUrl}/api/mcp`;
  let sessionId: string | undefined;
  let protocolVersion: string | undefined;
  let gate: Promise<void> = Promise.resolve();
  const pending = new Set<Promise<void>>();

  const emit = (payload: string) => {
    try {
      opts.write(JSON.stringify(JSON.parse(payload)));
    } catch {
      opts.log(`[komendly mcp] dropped a non-JSON message from the server`);
    }
  };

  const forward = async (msg: unknown): Promise<void> => {
    const ids = idsOf(msg);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": USER_AGENT,
      "X-Komendly-Client": "cli",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
    let res: Response;
    try {
      res = await opts.fetch(endpoint, { method: "POST", headers, body: JSON.stringify(msg) });
    } catch (error) {
      const text = `Couldn't reach Komendly (${error instanceof Error ? error.message : "network error"}).`;
      for (const id of ids) opts.write(errorLine(id, -32000, text));
      if (!ids.length) opts.log(`[komendly mcp] ${text}`);
      return;
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) sessionId = sid;
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      // A JSON-RPC error body is already a proper reply.
      if (body && typeof body === "object" && "jsonrpc" in body) {
        opts.write(JSON.stringify(body));
        return;
      }
      const message = friendlyError(res.status, body, opts.baseUrl, res.headers.get("retry-after")).message;
      for (const id of ids) opts.write(errorLine(id, -32000, message));
      if (!ids.length) opts.log(`[komendly mcp] ${message}`);
      return;
    }
    if (res.status === 202 || res.status === 204 || !res.body) return;
    if (type.includes("text/event-stream")) {
      await readSse(res.body, (data) => {
        if (isInitialize(msg)) captureVersion(data);
        emit(data);
      });
      return;
    }
    const text = await res.text();
    if (!text.trim()) return;
    if (isInitialize(msg)) captureVersion(text);
    emit(text);
  };

  const captureVersion = (payload: string) => {
    try {
      const v = (JSON.parse(payload) as { result?: { protocolVersion?: unknown } }).result?.protocolVersion;
      if (typeof v === "string") protocolVersion = v;
    } catch {
      /* ignore */
    }
  };

  const rl = createInterface({ input: opts.input, crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      opts.write(errorLine(null, -32700, "Parse error"));
      continue;
    }
    // initialize runs alone so its Mcp-Session-Id is known before anything else is sent.
    if (isInitialize(msg)) {
      await Promise.all(pending);
      gate = forward(msg);
      await gate;
      continue;
    }
    const p = gate.then(() => forward(msg)).finally(() => pending.delete(p));
    pending.add(p);
  }
  await Promise.all(pending);
}
