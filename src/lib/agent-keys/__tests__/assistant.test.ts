// AI assistants (growth system ai_assistant): discovery metadata, attribution, kill switch, probe, tool annotations.
// Pure: prisma and analytics are mocked (no DB reads or writes).
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ flag: null as { enabled: boolean } | null, grants: 0, events: [] as { name: string; data: unknown }[] }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adsFeatureFlag: { findUnique: async () => state.flag },
    oAuthGrant: { count: async () => state.grants },
  },
}));
vi.mock("@/lib/ads/events", () => ({ trackAdsEvent: async (name: string, data: unknown) => void state.events.push({ name, data }) }));

import type { User } from "@prisma/client";
import { systemForTouch } from "@/lib/growth/systems";
import { assistantLink, assistantTouchUrl, clientSlug } from "@/lib/oauth/assistant-touch";
import { authorizationServerMetadata, protectedResourceMetadata, wwwAuthenticate } from "@/lib/oauth/core";
import { GET as prmGET } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as asGET } from "@/app/.well-known/oauth-authorization-server/route";
import { POST as registerPOST } from "@/app/api/oauth/register/route";
import { isRefusedForApiKey } from "../policy";
import { runAsAgent } from "../context";
import { handleMcp } from "../mcp-handler";
import { connectionAllowed, isProbeBody, linkForAgent, recordAssistantToolCall, upgradeUrlForAgent } from "../assistant";

const ORIGIN = "https://www.komendly.com";
const user = { id: "u1" } as User;

function rpc(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
}

beforeEach(() => {
  state.flag = null;
  state.grants = 0;
  state.events = [];
});

describe("discovery metadata", () => {
  it("serves RFC 9728 + RFC 8414 metadata with dynamic client registration and PKCE", async () => {
    const prm = (await (await prmGET(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`))).json()) as Record<string, unknown>;
    expect(prm).toEqual(protectedResourceMetadata(ORIGIN));
    expect(prm.resource).toBe(`${ORIGIN}/api/mcp`);
    const as = (await (await asGET(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`))).json()) as Record<string, unknown>;
    expect(as).toEqual(authorizationServerMetadata(ORIGIN));
    expect(as.registration_endpoint).toBe(`${ORIGIN}/api/oauth/register`);
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("challenges unauthenticated MCP calls with the resource metadata URL", async () => {
    const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }), null);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(wwwAuthenticate(ORIGIN));
  });
});

describe("anonymous probe (health check / directory scans)", () => {
  it("allows only discovery methods", () => {
    expect(isProbeBody({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toBe(true);
    expect(isProbeBody({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_account" } })).toBe(false);
    expect(isProbeBody([{ method: "tools/list" }])).toBe(false);
  });

  it("initializes and lists every tool with a title and explicit hints", async () => {
    const probe = { "x-komendly-client": "probe" };
    const init = (await (await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, probe), null)).json()) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("ozzy");
    const list = (await (await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, probe), null)).json()) as { result: { tools: { name: string; title?: string; description: string; annotations: Record<string, unknown> }[] } };
    const tools = list.result.tools;
    expect(tools.length).toBeGreaterThan(10);
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      for (const h of ["readOnlyHint", "destructiveHint", "openWorldHint"]) expect(typeof t.annotations[h], `${t.name}.${h}`).toBe("boolean");
    }
    const pack = tools.find((t) => t.name === "ads_create_pack");
    expect(pack?.description).toMatch(/make, create or design ads/);
    expect(pack?.annotations.readOnlyHint).toBe(false);
    expect(tools.find((t) => t.name === "ads_get_run")?.annotations.readOnlyHint).toBe(true);
  });

  it("refuses tools/call on the probe", async () => {
    const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_account", arguments: {} } }, { "x-komendly-client": "probe" }), null);
    expect(res.status).toBe(401);
  });
});

describe("attribution", () => {
  it("tags the consent page visit and assistant links as ai_assistant", () => {
    const touched = assistantTouchUrl(new URL(`${ORIGIN}/oauth/authorize?client_id=kmc_x`));
    expect(touched.searchParams.get("utm_source")).toBe("ai_assistant");
    expect(touched.searchParams.get("client_id")).toBe("kmc_x");
    expect(systemForTouch({ utm_source: touched.searchParams.get("utm_source") })).toBe("ai_assistant");
    expect(assistantTouchUrl(new URL(`${ORIGIN}/oauth/authorize?utm_source=blog`)).searchParams.get("utm_source")).toBe("blog");
    expect(assistantTouchUrl(new URL(`${ORIGIN}/pricing`)).search).toBe("");
    expect(clientSlug("Claude Desktop")).toBe("claude-desktop");
    expect(new URL(assistantLink(`${ORIGIN}/ads/runs/r1`, "ChatGPT")).searchParams.get("utm_campaign")).toBe("chatgpt");
  });

  it("links and upgrade URLs carry utm_source=ai_assistant only on OAuth (assistant) connections", async () => {
    const url = `${ORIGIN}/ads/runs/r1`;
    const viaOauth = await runAsAgent({ user, keyId: "g1", via: "mcp", auth: "oauth", clientName: "ChatGPT" }, async () => [linkForAgent(url), upgradeUrlForAgent()]);
    expect(new URL(viaOauth[0]!).searchParams.get("utm_source")).toBe("ai_assistant");
    expect(new URL(viaOauth[1]!).searchParams.get("utm_source")).toBe("ai_assistant");
    const viaKey = await runAsAgent({ user, keyId: "k1", via: "cli", auth: "key" }, async () => [linkForAgent(url), upgradeUrlForAgent()]);
    expect(viaKey[0]).toBe(url);
    expect(new URL(viaKey[1]!).searchParams.get("utm_source")).toBe("mcp");
  });

  it("records assistant_tool_called for assistant connections, not API keys", async () => {
    await runAsAgent({ user, keyId: "g1", via: "mcp", auth: "oauth", clientName: "Claude", workspaceId: "w1" }, () => recordAssistantToolCall("ads_create_pack"));
    await runAsAgent({ user, keyId: "k1", via: "cli", auth: "key" }, () => recordAssistantToolCall("ads_create_pack"));
    expect(state.events).toEqual([{ name: "assistant_tool_called", data: { userId: "u1", workspaceId: "w1", props: { system: "ai_assistant", tool: "ads_create_pack", client: "Claude", grantId: "g1" } } }]);
  });
});

describe("kill switch sys_ai_assistant", () => {
  const register = () => registerPOST(new Request(`${ORIGIN}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"] }) }));

  it("refuses new registrations politely while off (missing flag = off)", async () => {
    const res = await register();
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("temporarily_unavailable");
  });

  it("refuses new connections but lets users who already connected this app re-authorize", async () => {
    expect(await connectionAllowed(null, "kmc_x")).toBe(false);
    expect(await connectionAllowed("u1", "kmc_x")).toBe(false);
    state.grants = 1;
    expect(await connectionAllowed("u1", "kmc_x")).toBe(true);
    state.grants = 0;
    state.flag = { enabled: true };
    expect(await connectionAllowed(null, "kmc_x")).toBe(true);
  });

  it("never touches API-key routing (published CLI behaviour)", () => {
    expect(isRefusedForApiKey("/api/oauth/register")).toBe(true);
    expect(isRefusedForApiKey("/api/mcp")).toBe(false);
    expect(isRefusedForApiKey("/api/ads/runs")).toBe(false);
  });
});

describe("MCP server card (/.well-known/mcp/server-card.json)", () => {
  it("is public and lists the same tools as the probe", async () => {
    const { GET } = await import("@/app/.well-known/mcp/server-card.json/route");
    const res = await GET(new Request(`${ORIGIN}/.well-known/mcp/server-card.json`));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const card = (await res.json()) as { serverInfo: { name: string }; remotes: { url: string }[]; authentication: { required: boolean }; tools: { name: string }[] };
    expect(card.serverInfo.name).toBe("ozzy");
    expect(card.remotes[0].url).toBe(`${ORIGIN}/api/mcp`);
    expect(card.authentication.required).toBe(true);
    expect(card.tools.map((t) => t.name)).toContain("ads_create_pack");
  });
});
