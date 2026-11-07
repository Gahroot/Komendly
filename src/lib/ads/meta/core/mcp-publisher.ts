// MetaPublisher over Meta's official Ads MCP server (https://mcp.facebook.com/ads).
// Auth: the bearer is the OAuth token obtained via the MCP auth flow (see ../mcp-auth.ts).
// The server has no media-upload tool, so media goes through the Marketing API with the same
// user token (the MCP authorization server issues Graph user tokens: token endpoint is graph.facebook.com).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { GraphClient, uploadViaGraph } from "./graph-publisher";
import { actId, adSetPayload, campaignPayload, creativePayload } from "./mapping";
import { MetaApiError, type FetchLike, type MetaAdAccount, type MetaPage, type MetaPublisher, type UploadedMedia } from "./types";

export const META_MCP_URL = "https://mcp.facebook.com/ads";

/** Minimal MCP client surface we use (lets tests inject a fake). */
export interface McpToolClient {
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(req: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpOptions {
  accessToken: string;
  graphVersion?: string;
  serverUrl?: string;
  fetch?: FetchLike;
  /** Injected client (tests); otherwise a Streamable HTTP client is connected lazily. */
  client?: McpToolClient;
}

/** Known/likely tool names, matched against the server's live tool list (beta: names may vary per account). */
const TOOL_PATTERNS = {
  adAccounts: [/^ads_get_ad_accounts$/, /ad_?accounts/],
  pages: [/^ads_get_pages$/, /pages/],
  campaign: [/^ads_create_campaign$/],
  adSet: [/^ads_create_ad_set$/],
  creative: [/^ads_create_creative$/, /create.*creative/],
  ad: [/^ads_create_ad$/],
} as const;

type ToolKey = keyof typeof TOOL_PATTERNS;

export function parseToolResult(result: unknown): unknown {
  const r = result as { isError?: boolean; structuredContent?: unknown; content?: Array<{ type: string; text?: string }> };
  const text = (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  if (r.isError) throw new MetaApiError(text || "Meta MCP tool failed");
  if (r.structuredContent !== undefined) return r.structuredContent;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function pickId(v: unknown, keys: string[]): string {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["id", ...keys]) if (typeof o[k] === "string" || typeof o[k] === "number") return String(o[k]);
    for (const nested of Object.values(o)) if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      try { return pickId(nested, keys); } catch { /* keep looking */ }
    }
  }
  if (typeof v === "string") {
    const m = v.match(/\b(\d{6,})\b/);
    if (m?.[1]) return m[1];
  }
  throw new MetaApiError("Meta MCP response had no id");
}

function listOf(v: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
  if (v && typeof v === "object") {
    for (const k of ["data", "ad_accounts", "accounts", "pages", "results"]) {
      const x = (v as Record<string, unknown>)[k];
      if (Array.isArray(x)) return x as Array<Record<string, unknown>>;
    }
  }
  return [];
}

export class McpMetaPublisher implements MetaPublisher {
  readonly mode = "mcp" as const;
  private client: McpToolClient | null;
  private tools: Map<ToolKey, string> | null = null;
  private readonly graph: GraphClient;

  constructor(private readonly o: McpOptions) {
    this.client = o.client ?? null;
    this.graph = new GraphClient({ accessToken: o.accessToken, version: o.graphVersion, fetch: o.fetch });
  }

  private async connect(): Promise<McpToolClient> {
    if (this.client) return this.client;
    const transport = new StreamableHTTPClientTransport(new URL(this.o.serverUrl ?? META_MCP_URL), {
      requestInit: { headers: { authorization: `Bearer ${this.o.accessToken}` } },
      fetch: this.o.fetch,
    });
    const client = new Client({ name: "komendly-website2ads", version: "1.0.0" });
    await client.connect(transport);
    this.client = client;
    return client;
  }

  private async tool(key: ToolKey): Promise<string> {
    const client = await this.connect();
    if (!this.tools) {
      const names = (await client.listTools()).tools.map((t) => t.name).sort();
      this.tools = new Map();
      for (const k of Object.keys(TOOL_PATTERNS) as ToolKey[]) {
        for (const re of TOOL_PATTERNS[k]) {
          const hit = names.find((n) => re.test(n));
          if (hit) { this.tools.set(k, hit); break; }
        }
      }
    }
    const name = this.tools.get(key);
    if (!name) throw new MetaApiError(`Meta MCP server does not expose a tool for "${key}" on this account`);
    return name;
  }

  private async call(key: ToolKey, args: Record<string, unknown>): Promise<unknown> {
    const name = await this.tool(key);
    return parseToolResult(await (await this.connect()).callTool({ name, arguments: args }));
  }

  async listAdAccounts(): Promise<MetaAdAccount[]> {
    return listOf(await this.call("adAccounts", {})).map((a) => ({
      id: String(a.id ?? a.account_id ?? ""), name: String(a.name ?? a.id ?? ""), currency: typeof a.currency === "string" ? a.currency : undefined,
    })).filter((a) => a.id);
  }

  async listPages(): Promise<MetaPage[]> {
    return listOf(await this.call("pages", {})).map((p) => ({ id: String(p.id ?? p.page_id ?? ""), name: String(p.name ?? p.id ?? "") })).filter((p) => p.id);
  }

  uploadMedia(adAccountId: string, media: Parameters<MetaPublisher["uploadMedia"]>[1], signal?: AbortSignal): Promise<UploadedMedia> {
    return uploadViaGraph(this.graph, adAccountId, media, signal);
  }

  async createCampaign(adAccountId: string, input: Parameters<MetaPublisher["createCampaign"]>[1]) {
    return pickId(await this.call("campaign", { ad_account_id: actId(adAccountId), ...campaignPayload(input) }), ["campaign_id"]);
  }

  async createAdSet(adAccountId: string, input: Parameters<MetaPublisher["createAdSet"]>[1]) {
    return pickId(await this.call("adSet", { ad_account_id: actId(adAccountId), ...adSetPayload(input) }), ["ad_set_id", "adset_id"]);
  }

  async createAd(adAccountId: string, input: Parameters<MetaPublisher["createAd"]>[1]) {
    const creativeId = pickId(
      await this.call("creative", { ad_account_id: actId(adAccountId), ...creativePayload({ name: input.name, pageId: input.pageId, objective: input.objective, copy: input.copy, media: input.media }) }),
      ["creative_id"]);
    const adId = pickId(
      await this.call("ad", { ad_account_id: actId(adAccountId), name: input.name, adset_id: input.adSetId, creative_id: creativeId, creative: { creative_id: creativeId }, status: "PAUSED" }),
      ["ad_id"]);
    return { adId, creativeId };
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }
}
