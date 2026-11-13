// Hits the dev DB from .env.local (creates and deletes its own user + workspace).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { handleMcp } from "../mcp-handler";
import { generateApiKey, hashApiKey, keyPrefix } from "../keys";

const tag = `agentmcp-test-${Date.now()}`;
let userId = "";
let workspaceId = "";
let key = "";

function rpc(body: unknown, auth: string | null = key) {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${tag}@example.com`, passwordHash: "x", name: "MCP" } });
  userId = user.id;
  workspaceId = (await getOrCreateWorkspace(user)).id;
  key = generateApiKey();
  await prisma.agentApiKey.create({ data: { userId, workspaceId, name: "mcp", prefix: keyPrefix(key), keyHash: hashApiKey(key) } });
});

afterAll(async () => {
  await prisma.adsEvent.deleteMany({ where: { userId } });
  await prisma.adsWorkspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("hosted MCP server", () => {
  it("rejects a missing or unknown key", async () => {
    expect((await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null), null)).status).toBe(401);
    expect((await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, generateApiKey()), null)).status).toBe(401);
  });

  it("initializes as ozzy and lists every tool", async () => {
    const init = await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }), null);
    const initBody = (await init.json()) as { result: { serverInfo: { name: string }; instructions?: string } };
    expect(initBody.result.serverInfo.name).toBe("ozzy");
    expect(initBody.result.instructions).toContain("Ozzy");
    const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }), null);
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(expect.arrayContaining(
      ["ads_create_pack", "ads_get_run", "ads_list_runs", "autopilot_get", "autopilot_set", "get_account", "get_download_url", "studio_create_video", "studio_get_session", "studio_launch_video", "studio_list_sessions", "studio_remix", "studio_send_message", "upload_media"],
    ));
  });

  it("get_account returns the key owner's plan and credits (also via the path key)", async () => {
    const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_account", arguments: {} } }, null), key);
    const body = (await res.json()) as { result: { isError?: boolean; structuredContent: Record<string, unknown> } };
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent).toMatchObject({ plan: "free", credits: 0, upgrade_url: "https://www.komendly.com/pricing?utm_source=mcp" });
  });

  it("returns plain sentences for errors", async () => {
    const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "ads_get_run", arguments: { run_id: "nope" } } }), null);
    const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toMatch(/^Not found/);
  });
});
