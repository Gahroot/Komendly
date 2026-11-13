import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runMcpBridge } from "../src/mcp.js";
import { json, mockFetch } from "./helpers.js";

function sse(events: unknown[]): Response {
  const body = events.map((e) => `event: message\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

async function bridge(lines: string[], fetchImpl: Parameters<typeof runMcpBridge>[0]["fetch"]) {
  const written: string[] = [];
  await runMcpBridge({ baseUrl: "https://k.test", apiKey: "kmd_x", fetch: fetchImpl, input: Readable.from(lines.map((l) => `${l}\n`)), write: (l) => written.push(l), log: () => {} });
  return written;
}

describe("mcp bridge", () => {
  it("forwards newline-delimited JSON-RPC, handles JSON + SSE, keeps Mcp-Session-Id and protocol version", async () => {
    const m = mockFetch({
      "POST /api/mcp": [
        () => json({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "ozzy" } } }, 200, { "mcp-session-id": "sess-9" }),
        () => new Response(null, { status: 202 }),
        () => sse([{ jsonrpc: "2.0", method: "notifications/progress", params: {} }, { jsonrpc: "2.0", id: 2, result: { tools: [] } }]),
      ],
    });
    const out = await bridge(
      [
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      ],
      m.fetch,
    );
    expect(out.map((l) => JSON.parse(l))).toEqual([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "ozzy" } } },
      { jsonrpc: "2.0", method: "notifications/progress", params: {} },
      { jsonrpc: "2.0", id: 2, result: { tools: [] } },
    ]);
    for (const l of out) expect(l).not.toContain("\n");
    expect(m.calls[0]?.headers.authorization).toBe("Bearer kmd_x");
    expect(m.calls[0]?.headers.accept).toBe("application/json, text/event-stream");
    expect(m.calls[0]?.headers["mcp-session-id"]).toBeUndefined();
    expect(m.calls[2]?.headers["mcp-session-id"]).toBe("sess-9");
    expect(m.calls[2]?.headers["mcp-protocol-version"]).toBe("2025-06-18");
  });

  it("answers parse errors and HTTP failures with JSON-RPC errors for the right id", async () => {
    const m = mockFetch({ "POST /api/mcp": () => json({ error: "Unauthorized" }, 401) });
    const out = await bridge(["not json", JSON.stringify({ jsonrpc: "2.0", id: "a", method: "tools/list" })], m.fetch);
    const parsed = out.map((l) => JSON.parse(l));
    expect(parsed[0]).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    expect(parsed[1]).toMatchObject({ jsonrpc: "2.0", id: "a", error: { code: -32000 } });
    expect(parsed[1].error.message).toContain("/dashboard/api");
  });
});
