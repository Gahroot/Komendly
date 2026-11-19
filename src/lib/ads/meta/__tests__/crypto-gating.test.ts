import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

import { decryptToken, encryptToken, tokenKey } from "../core/crypto";
import { metaAccessFor, metaPublishFlagKeys } from "../access";
import { GRAPH_SCOPES, revokeGraphToken } from "../core/oauth";

describe("token encryption", () => {
  it("roundtrips and rejects tampering / wrong key", () => {
    const key = randomBytes(32);
    const sealed = encryptToken('{"accessToken":"secret"}', key);
    expect(sealed).not.toContain("secret");
    expect(decryptToken(sealed, key)).toBe('{"accessToken":"secret"}');
    expect(() => decryptToken(sealed, randomBytes(32))).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."), key)).toThrow();
  });
  it("requires a 32-byte key", () => {
    expect(() => tokenKey(undefined)).toThrow();
    expect(() => tokenKey(Buffer.alloc(16).toString("base64"))).toThrow();
  });
});

describe("paid gating", () => {
  const paid = { adsPlan: "pro", subscriptionStatus: "active", suspendedAt: null };
  it("needs the flag and a paid plan", () => {
    expect(metaAccessFor(paid, true)).toBe("ok");
    expect(metaAccessFor(paid, false)).toBe("disabled");
    expect(metaAccessFor({ adsPlan: "trial", subscriptionStatus: "none" }, true)).toBe("upgrade");
    expect(metaAccessFor({ ...paid, suspendedAt: new Date(0) }, true)).toBe("upgrade");
  });
});

describe("meta publish flag + scopes", () => {
  it("checks the global flag and the per-workspace flag", () => {
    expect(metaPublishFlagKeys("ws1")).toEqual(["meta_publish", "meta_publish:ws1"]);
  });
  it("does not request ads_read in graph mode", () => {
    expect(GRAPH_SCOPES).not.toContain("ads_read");
  });
});

describe("revokeGraphToken", () => {
  it("DELETEs me/permissions and never throws", async () => {
    const f = vi.fn(async (_u: URL | string, _i?: RequestInit) => new Response("{}", { status: 200 }));
    expect(await revokeGraphToken("tok", "v21.0", f as never)).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain("https://graph.facebook.com/v21.0/me/permissions?access_token=tok");
    expect(init?.method).toBe("DELETE");
    const boom = vi.fn(async () => { throw new Error("net"); });
    expect(await revokeGraphToken("tok", "v21.0", boom as never)).toBe(false);
  });
});
