import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

import { decryptToken, encryptToken, tokenKey } from "../core/crypto";
import { metaAccessFor } from "../access";

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
