// Request-scoped agent identity for the hosted MCP server: getCurrentUser() returns this user inside runAsAgent().
import { AsyncLocalStorage } from "node:async_hooks";
import type { User } from "@prisma/client";
import type { ApiVia } from "./keys";

export interface AgentContext {
  user: User;
  keyId: string;
  via: ApiVia;
  /** "oauth" = an app connected through sign-in + Allow (ChatGPT, Claude...); "key" = a kmd_ personal API key (CLI). */
  auth?: "oauth" | "key";
  /** OAuth client name (e.g. "ChatGPT"), when known. */
  clientName?: string | null;
  workspaceId?: string;
}

const storage = new AsyncLocalStorage<AgentContext>();

export function runAsAgent<T>(ctx: AgentContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentAgent(): AgentContext | null {
  return storage.getStore() ?? null;
}
