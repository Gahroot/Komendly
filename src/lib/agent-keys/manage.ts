// Key management helpers (cookie session only: an API key can never list, mint or revoke keys).
import type { AgentApiKey } from "@prisma/client";
import { getCookieUser } from "@/lib/auth";
import { AdsHttpError } from "@/lib/ads/workspace";

export function apiKeyView(k: AgentApiKey) {
  return { id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null };
}

export type ApiKeyView = ReturnType<typeof apiKeyView>;

export async function requireCookieUser() {
  const user = await getCookieUser();
  if (!user) throw new AdsHttpError(401, "unauthenticated", "Please sign in to manage API keys.");
  return user;
}
