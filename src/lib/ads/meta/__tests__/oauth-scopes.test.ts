import { afterEach, describe, expect, it, vi } from "vitest";
import { GRAPH_SCOPES, graphAuthorizeUrl, graphScopes, metaExtraScopes, type MetaAppConfig } from "../core/oauth";

const cfg: MetaAppConfig = { appId: "123", appSecret: "s", redirectUri: "https://www.komendly.com/api/ads/meta/callback", graphVersion: "v23.0" };
const scopeOf = (url: string) => new URL(url).searchParams.get("scope");

afterEach(() => vi.unstubAllEnvs());

describe("Graph OAuth scopes", () => {
  it("asks for exactly the submitted scopes when META_EXTRA_SCOPES is unset", () => {
    vi.stubEnv("META_EXTRA_SCOPES", "");
    expect(scopeOf(graphAuthorizeUrl(cfg, "st", "verifier"))).toBe(GRAPH_SCOPES.join(","));
    expect(GRAPH_SCOPES).toEqual(["ads_management", "business_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads"]);
  });

  it("appends META_EXTRA_SCOPES (read at call time), trimmed and deduped", () => {
    vi.stubEnv("META_EXTRA_SCOPES", " ads_read, leads_retrieval ,pages_manage_metadata,ads_management,,bad scope!");
    expect(scopeOf(graphAuthorizeUrl(cfg, "st", "verifier"))).toBe([...GRAPH_SCOPES, "ads_read", "leads_retrieval", "pages_manage_metadata"].join(","));
  });

  it("uses the Login for Business config instead of scopes when a config id is set", () => {
    vi.stubEnv("META_EXTRA_SCOPES", "ads_read");
    const u = new URL(graphAuthorizeUrl({ ...cfg, loginConfigId: "cfg1" }, "st", "verifier"));
    expect(u.searchParams.get("config_id")).toBe("cfg1");
    expect(u.searchParams.get("scope")).toBeNull();
  });

  it("pure helpers take an env", () => {
    expect(metaExtraScopes({})).toEqual([]);
    expect(graphScopes({ META_EXTRA_SCOPES: "leads_retrieval" })).toContain("leads_retrieval");
  });
});
