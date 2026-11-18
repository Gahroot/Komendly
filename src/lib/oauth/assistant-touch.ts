// AI-assistant attribution for the OAuth consent page (growth system `ai_assistant`). Pure + edge-safe (middleware imports it).
import { withSystemUtm } from "@/lib/growth/systems";

export const ASSISTANT_SYSTEM = "ai_assistant" as const;
export const OAUTH_AUTHORIZE_PATH = "/oauth/authorize";

/** "ChatGPT" -> "chatgpt", "Claude Desktop" -> "claude-desktop"; used as utm_campaign. */
export function clientSlug(name: string | null | undefined): string {
  const s = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "assistant";
}

/** Link put in front of a person by an assistant connection: carries utm_source=ai_assistant (+ the client as campaign). */
export function assistantLink(url: string, clientName?: string | null, content?: string): string {
  return withSystemUtm(url, ASSISTANT_SYSTEM, { campaign: clientSlug(clientName), ...(content ? { content } : {}) });
}

/**
 * A visit to the consent page counts as an `ai_assistant` touch: the assistant (ChatGPT, Claude...) opened it, so a
 * first touch recorded here (and the sign-up that follows) traces to this system. Other URLs are returned unchanged.
 */
export function assistantTouchUrl(url: URL): URL {
  if (url.pathname !== OAUTH_AUTHORIZE_PATH || url.searchParams.has("utm_source")) return url;
  return new URL(withSystemUtm(url.toString(), ASSISTANT_SYSTEM, { campaign: "connect" }));
}
