import { describe, expect, it } from "vitest";
import { aiAssistantTick, probeMcp } from "./ai-assistant";
import type { Db } from "../db";

const BASE = "https://example.test";
const TOOLS = ["ads_create_pack", "ads_get_run", "get_account", "studio_create_video"].map((name) => ({ name, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true } }));

function fakeFetch(opts: { toolsList?: unknown[]; prmStatus?: number } = {}) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.endsWith("/.well-known/oauth-protected-resource/api/mcp")) return Response.json({ resource: `${BASE}/api/mcp`, authorization_servers: [BASE] }, { status: opts.prmStatus ?? 200 });
    if (url.endsWith("/.well-known/oauth-authorization-server")) return Response.json({ registration_endpoint: "r", authorization_endpoint: "a", token_endpoint: "t" });
    const h = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as { method: string; id: number };
    if (h.get("x-komendly-client") !== "probe") return Response.json({ error: "x" }, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"` } });
    if (body.method === "initialize") return Response.json({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "ozzy" } } });
    return Response.json({ jsonrpc: "2.0", id: 2, result: { tools: opts.toolsList ?? TOOLS } });
  };
}

function fakeDb(enabled: boolean, counts: Record<string, number>) {
  const beats: { id: string; ok: boolean; meta: unknown }[] = [];
  const db = {
    adsFeatureFlag: { findUnique: async () => ({ enabled }) },
    engineHeartbeat: {
      findUnique: async () => null,
      upsert: async (a: { create: { id: string; ok: boolean; meta: unknown } }) => void beats.push(a.create),
    },
    adsEvent: { count: async (a: { where: { name: string } }) => counts[a.where.name] ?? 0 },
  };
  return { db: db as unknown as Db, beats };
}

describe("ai_assistant MCP health check", () => {
  it("passes against a healthy server", async () => {
    expect(await probeMcp(BASE, fakeFetch())).toEqual({ error: null, tools: 4 });
  });

  it("fails when metadata breaks or a tool disappears / loses annotations", async () => {
    expect((await probeMcp(BASE, fakeFetch({ prmStatus: 500 }))).error).toMatch(/protected-resource/);
    expect((await probeMcp(BASE, fakeFetch({ toolsList: TOOLS.slice(1) }))).error).toMatch(/ads_create_pack/);
    expect((await probeMcp(BASE, fakeFetch({ toolsList: TOOLS.map((t) => ({ name: t.name })) }))).error).toMatch(/annotations/);
  });

  it("records outputs (sign-ups + tool calls) and a failing heartbeat when the endpoint breaks", async () => {
    const good = fakeDb(true, { signed_up: 2, assistant_tool_called: 5 });
    expect(await aiAssistantTick(good.db, { fetch: fakeFetch(), base: BASE })).toEqual({ ok: true, outputs: 7 });
    expect(good.beats[0]).toMatchObject({ id: "system:ai_assistant", ok: true });
    const bad = fakeDb(true, {});
    expect(await aiAssistantTick(bad.db, { fetch: async () => { throw new Error("ECONNREFUSED"); }, base: BASE })).toEqual({ ok: false, outputs: 0 });
    expect(bad.beats[0]).toMatchObject({ ok: false });
  });

  it("does nothing while the kill switch is off", async () => {
    const off = fakeDb(false, {});
    expect(await aiAssistantTick(off.db, { fetch: fakeFetch(), base: BASE })).toBeNull();
    expect(off.beats).toHaveLength(0);
  });
});
