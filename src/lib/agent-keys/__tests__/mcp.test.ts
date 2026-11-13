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
      ["ads_create_pack", "ads_get_run", "ads_list_runs", "autopilot_get", "autopilot_set", "get_account", "get_download_url", "studio_create_video", "studio_get_session", "studio_launch_video", "studio_list_sessions", "studio_remix", "studio_send_message", "upload_media", "studio_ad_copy", "campaign_kit"],
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

  it("ads_get_run, studio_ad_copy and campaign_kit return Meta-ready creatives with 7-day links", async () => {
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    const run = await prisma.adRun.create({ data: { workspaceId, userId, url: "https://shop.example.com/", status: "completed", staticCount: 1, motionCount: 0 } });
    const ad = await prisma.ad.create({ data: { runId: run.id, workspaceId, index: 0, awareness: "problem_aware", angle: "Fit matters", hook: "My knees hurt after 5k", headline: "Shoes fitted to your stride", body: "Get a free gait check in store.", cta: "Shop now", status: "ready" } });
    await prisma.adAsset.createMany({ data: [
      { adId: ad.id, ratio: "4:5", storageKey: `ws/${workspaceId}/a/4x5.png`, mime: "image/png", width: 1080, height: 1350, bytes: 10 },
      { adId: ad.id, ratio: "4:5", storageKey: `ws/${workspaceId}/a/4x5.jpg`, mime: "image/jpeg", width: 1080, height: 1350, bytes: 8 },
    ] });
    const session = await prisma.studioSession.create({ data: { workspaceId, userId, title: "Launch video · cal.com", starterId: "launch", status: "idle" } });
    await prisma.studioMessage.create({ data: { sessionId: session.id, role: "user", content: "Make a launch video for what we just shipped: https://cal.com\n\nWhat we shipped: Routing forms for every lead.", status: "done" } });
    await prisma.studioRender.create({ data: { sessionId: session.id, workspaceId, version: 1, key: `studio/${workspaceId}/${session.id}/v1.mp4`, ratio: "9:16", seconds: 24.04, width: 1080, height: 1920 } });

    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } }), null);
      return ((await res.json()) as { result: { isError?: boolean; structuredContent: Record<string, unknown> } }).result;
    };

    const got = await call("ads_get_run", { run_id: run.id });
    expect(got.isError).toBeFalsy();
    expect(got.structuredContent.landing_url).toBe("https://shop.example.com/");
    const ads = got.structuredContent.ads as Record<string, unknown>[];
    expect(ads[0]).toMatchObject({ headline: "Shoes fitted to your stride", primary_text: "Get a free gait check in store.", cta: "Shop now", cta_type: "SHOP_NOW", hook: "My knees hurt after 5k", angle: "Fit matters", awareness: "problem_aware" });
    const assets = ads[0]?.assets as { url: string; width: number; mime: string; filename: string }[];
    expect(assets[0]?.url).toContain("X-Amz-Expires=604800");
    expect(assets.map((a) => a.filename).sort()).toEqual(["ad-01-problem-aware-4x5.jpg", "ad-01-problem-aware-4x5.png"]);

    const copy = await call("studio_ad_copy", { session_id: session.id });
    expect(copy.structuredContent).toMatchObject({ landing_url: "https://cal.com", cta_type: "SIGN_UP" });

    const kit = await call("campaign_kit", { run_id: run.id, session_ids: [session.id] });
    expect(kit.isError).toBeFalsy();
    const items = kit.structuredContent.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ source: "ad_pack", type: "image", mime: "image/jpeg", ratio: "4:5", placements: ["feed"], landing_url: "https://shop.example.com/" });
    expect(items[1]).toMatchObject({ source: "studio", type: "video", mime: "video/mp4", width: 1080, height: 1920, ratio: "9:16", duration_seconds: 24, placements: ["stories", "reels"], landing_url: "https://cal.com" });
    expect(String(items[1]?.url)).toMatch(/v1\.mp4\?.*X-Amz-Expires=604800/);

    expect((await call("campaign_kit", {})).isError).toBe(true);
  });
});
