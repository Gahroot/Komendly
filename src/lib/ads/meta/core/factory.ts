import { GraphMetaPublisher } from "./graph-publisher";
import { McpMetaPublisher } from "./mcp-publisher";
import type { FetchLike, MetaPublishMode, MetaPublisher } from "./types";

/** Default is graph: the official MCP server has no upload tool and needs ads_mcp_management Advanced Access (see README). */
export function publishModeFromEnv(raw: string | undefined): MetaPublishMode {
  return raw === "mcp" ? "mcp" : "graph";
}

export function createMetaPublisher(o: { mode: MetaPublishMode; accessToken: string; graphVersion?: string; fetch?: FetchLike }): MetaPublisher {
  return o.mode === "mcp"
    ? new McpMetaPublisher({ accessToken: o.accessToken, graphVersion: o.graphVersion, fetch: o.fetch })
    : new GraphMetaPublisher({ accessToken: o.accessToken, version: o.graphVersion, fetch: o.fetch });
}
