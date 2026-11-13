import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, isApiKeyFormat, isJobCreatingRoute, isRefusedForApiKey, keyPrefix, parseBearer, viaFrom } from "../keys";

describe("api key format", () => {
  it("generates kmd_ + 40 base62 chars, unique", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).toMatch(/^kmd_[0-9A-Za-z]{40}$/);
    expect(isApiKeyFormat(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(keyPrefix(a)).toBe(a.slice(0, 12));
    expect(keyPrefix(a)).toHaveLength(12);
  });

  it("hashes with sha256 hex, deterministic", () => {
    expect(hashApiKey("kmd_x")).toBe(hashApiKey("kmd_x"));
    expect(hashApiKey("kmd_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("kmd_x")).not.toBe(hashApiKey("kmd_y"));
  });

  it("parses only well-formed bearer kmd_ keys", () => {
    const k = generateApiKey();
    expect(parseBearer(`Bearer ${k}`)).toBe(k);
    expect(parseBearer(`bearer   ${k} `)).toBe(k);
    expect(parseBearer(k)).toBeNull();
    expect(parseBearer("Bearer kmd_short")).toBeNull();
    expect(parseBearer(`Basic ${k}`)).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });

  it("refuses key management, admin and auth routes", () => {
    expect(isRefusedForApiKey("/api/account/api-keys")).toBe(true);
    expect(isRefusedForApiKey("/api/account/api-keys/abc")).toBe(true);
    expect(isRefusedForApiKey("/api/admin/users/1")).toBe(true);
    expect(isRefusedForApiKey("/api/auth/update")).toBe(true);
    expect(isRefusedForApiKey("/api/auth/verify-email/change-email")).toBe(true);
    expect(isRefusedForApiKey("/api/ads/runs")).toBe(false);
    expect(isRefusedForApiKey("/api/studio/sessions")).toBe(false);
    expect(isRefusedForApiKey("/api/administrator")).toBe(false);
  });

  it("classifies job-creating calls", () => {
    expect(isJobCreatingRoute("POST /api/ads/runs")).toBe(true);
    expect(isJobCreatingRoute("GET /api/ads/runs")).toBe(false);
    expect(isJobCreatingRoute("POST /api/studio/sessions/abc/messages")).toBe(true);
    expect(isJobCreatingRoute("POST /api/studio/sessions")).toBe(false);
    expect(isJobCreatingRoute(null)).toBe(false);
    expect(viaFrom("cli")).toBe("cli");
    expect(viaFrom("whatever")).toBe("api");
  });
});
