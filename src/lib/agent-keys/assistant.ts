// AI assistants (growth system `ai_assistant`): kill switch for NEW OAuth connections, tool annotations required by the
// ChatGPT / Claude directories, usage events and the anonymous discovery probe. Node only.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { systemEnabled, type SystemDb } from "@/lib/growth/systems";
import { ASSISTANT_SYSTEM, assistantLink } from "@/lib/oauth/assistant-touch";
import { currentAgent } from "./context";
import { UPGRADE_URL } from "./policy";

export const CONNECTIONS_PAUSED_MESSAGE = "Komendly isn't accepting new app connections right now. Please try again later; apps you already connected keep working.";
export const PRICING_URL = "https://www.komendly.com/pricing";

/** Kill switch `sys_ai_assistant` (missing row = off). Only gates NEW connections; API keys and existing grants are untouched. */
export function assistantConnectionsOpen(db: SystemDb = prisma as unknown as SystemDb): Promise<boolean> {
  return systemEnabled(db, ASSISTANT_SYSTEM);
}

/** A user who already connected this client (re-authorizing, e.g. after a token expired) is not a new connection. */
export async function connectionAllowed(userId: string | null, clientId: string): Promise<boolean> {
  if (await assistantConnectionsOpen()) return true;
  if (!userId) return false;
  return (await prisma.oAuthGrant.count({ where: { userId, clientId, revokedAt: null } })) > 0;
}

/** True inside an MCP request made with an OAuth token (ChatGPT, Claude...), not a CLI / personal API key. */
export function isAssistantRequest(): boolean {
  return currentAgent()?.auth === "oauth";
}

/** Links shown to the human: tagged utm_source=ai_assistant on assistant connections, unchanged otherwise. */
export function linkForAgent(url: string): string {
  const agent = currentAgent();
  return agent?.auth === "oauth" ? assistantLink(url, agent.clientName) : url;
}

export function upgradeUrlForAgent(): string {
  return isAssistantRequest() ? linkForAgent(PRICING_URL) : UPGRADE_URL;
}

/**
 * Whether a UI may offer an Upgrade button to a free account that hasn't hit a limit. ChatGPT's app guidelines forbid
 * promoting upgrades (only explaining an unavailable feature with a link to the plans page), so not for ChatGPT clients.
 */
export function upgradePromptAllowed(agent = currentAgent()): boolean {
  return !/chatgpt|openai/i.test(agent?.clientName ?? "");
}

type Hints = { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
const READ: Hints = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = (openWorld: boolean): Hints => ({ readOnlyHint: false, destructiveHint: false, openWorldHint: openWorld });

/** Explicit hints for every tool (OpenAI blocks missing ones; Claude needs readOnly/destructive). Nothing deletes data. */
export const TOOL_HINTS: Record<string, Hints> = {
  get_account: READ,
  autopilot_get: READ,
  studio_get_session: READ,
  studio_ad_copy: READ,
  campaign_kit: READ,
  studio_list_sessions: READ,
  ads_get_run: READ,
  ads_list_runs: READ,
  get_download_url: READ,
  autopilot_set: write(false),
  studio_create_video: write(false),
  studio_send_message: write(false),
  studio_remix: write(true), // fetches the ad link the user gives
  studio_launch_video: write(true), // opens the user's public site
  upload_media: write(true), // downloads a public URL
  ads_create_pack: write(true), // reads the user's website
};

export function toolAnnotations(name: string, existing: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(existing ?? {}), ...(TOOL_HINTS[name] ?? write(false)) };
}

/** `assistant_tool_called` for tool calls over an OAuth (assistant) connection. Never throws. */
export async function recordAssistantToolCall(tool: string): Promise<void> {
  const agent = currentAgent();
  if (agent?.auth !== "oauth") return;
  await trackAdsEvent("assistant_tool_called", { userId: agent.user.id, workspaceId: agent.workspaceId, props: { system: ASSISTANT_SYSTEM, tool, client: agent.clientName ?? null, grantId: agent.keyId } });
}

/** Every registerTool on this server gets full annotations and records assistant usage. */
export function instrumentTools(server: McpServer): void {
  const original = server.registerTool.bind(server) as (...a: unknown[]) => unknown;
  (server as unknown as { registerTool: (...a: unknown[]) => unknown }).registerTool = (name: unknown, config: unknown, cb: unknown) => {
    const c = (config ?? {}) as { annotations?: Record<string, unknown> };
    const fn = cb as (...a: unknown[]) => unknown;
    return original(name, { ...c, annotations: toolAnnotations(String(name), c.annotations) }, async (...args: unknown[]) => {
      await recordAssistantToolCall(String(name));
      return fn(...args);
    });
  };
}

/** Methods an unauthenticated health probe (X-Komendly-Client: probe) may call: discovery only, no account data. */
const PROBE_METHODS = new Set(["initialize", "notifications/initialized", "tools/list", "ping"]);
export const PROBE_CLIENT = "probe";

export function isProbeBody(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const m = (body as { method?: unknown }).method;
  return typeof m === "string" && PROBE_METHODS.has(m);
}
