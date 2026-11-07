import { AdsHttpError } from "@/lib/ads/workspace";
import { publishModeFromEnv } from "./core/factory";
import { DEFAULT_GRAPH_VERSION } from "./core/graph-publisher";
import type { MetaAppConfig } from "./core/oauth";
import { tokenKey } from "./core/crypto";

export function metaPublishMode() {
  return publishModeFromEnv(process.env.META_PUBLISH_MODE);
}

export function graphVersion(): string {
  return process.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
}

/** Meta app settings from env; 503 when the integration isn't configured yet (never invent keys). */
export function metaAppConfig(): MetaAppConfig {
  const { META_APP_ID, META_APP_SECRET, META_REDIRECT_URI } = process.env;
  if (!META_APP_ID || !META_APP_SECRET || !META_REDIRECT_URI) {
    throw new AdsHttpError(503, "meta_not_configured", "Meta publishing isn't configured yet.");
  }
  return {
    appId: META_APP_ID,
    appSecret: META_APP_SECRET,
    redirectUri: META_REDIRECT_URI,
    graphVersion: graphVersion(),
    loginConfigId: process.env.META_LOGIN_CONFIG_ID || undefined,
  };
}

export function metaTokenKey(): Buffer {
  return tokenKey(process.env.ADS_TOKEN_KEY);
}
