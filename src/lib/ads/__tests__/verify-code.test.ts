import { beforeEach, describe, expect, it, vi } from "vitest";

type Tok = { id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null };
const db = vi.hoisted(() => ({ tokens: [] as Array<{ id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>, verified: new Set<string>() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailVerificationToken: {
      deleteMany: async ({ where }: { where: { userId: string; usedAt: null } }) => {
        db.tokens = db.tokens.filter((t) => !(t.userId === where.userId && t.usedAt === null));
        return { count: 0 };
      },
      createMany: async ({ data }: { data: Array<Omit<Tok, "id" | "usedAt">> }) => {
        for (const d of data) db.tokens.push({ ...d, id: `t${db.tokens.length + 1}`, usedAt: null });
        return { count: data.length };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => db.tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; usedAt: null }; data: { usedAt: Date } }) => {
        const t = db.tokens.find((x) => x.id === where.id && x.usedAt === null);
        if (t) t.usedAt = data.usedAt;
        return { count: t ? 1 : 0 };
      },
    },
    adsRateLimit: { deleteMany: async () => ({ count: 0 }) },
    user: { updateMany: async ({ where }: { where: { id: string } }) => (db.verified.add(where.id), { count: 1 }) },
  },
}));

import { consumeVerificationCode, consumeVerificationToken, CODE_MAX_ATTEMPTS, issueVerification, normalizeCode } from "../verify";

function limiter() {
  const used = new Map<string, number>();
  return async (key: string, limit: number) => {
    const n = used.get(key) ?? 0;
    if (n >= limit) return false;
    used.set(key, n + 1);
    return true;
  };
}

beforeEach(() => {
  db.tokens = [];
  db.verified = new Set();
});

describe("verification code", () => {
  it("normalizes input", () => {
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("abcdef")).toBeNull();
  });

  it("stores only hashes and verifies once", async () => {
    const { code, token } = await issueVerification("u1");
    expect(code).toMatch(/^\d{6}$/);
    expect(db.tokens.some((t) => t.tokenHash.includes(code) || t.tokenHash === token)).toBe(false);
    const attempt = limiter();
    expect(await consumeVerificationCode("u1", code, attempt)).toEqual({ ok: true, userId: "u1" });
    expect(db.verified.has("u1")).toBe(true);
    expect((await consumeVerificationCode("u1", code, attempt)).ok).toBe(false);
    // the sibling link is revoked once verified
    expect((await consumeVerificationToken(token)).ok).toBe(false);
  });

  it("is scoped to the user", async () => {
    const { code } = await issueVerification("u1");
    expect(await consumeVerificationCode("u2", code, limiter())).toEqual({ ok: false, reason: "invalid" });
  });

  it("expires like the link", async () => {
    const { code } = await issueVerification("u1");
    for (const t of db.tokens) t.expiresAt = new Date(Date.now() - 1000);
    expect(await consumeVerificationCode("u1", code, limiter())).toEqual({ ok: false, reason: "expired" });
  });

  it("locks after the max wrong attempts", async () => {
    const { code } = await issueVerification("u1");
    const wrong = code === "000000" ? "111111" : "000000";
    const attempt = limiter();
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) expect((await consumeVerificationCode("u1", wrong, attempt)).ok).toBe(false);
    expect(await consumeVerificationCode("u1", code, attempt)).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("link still verifies without a session", async () => {
    const { token } = await issueVerification("u1");
    expect(await consumeVerificationToken(token)).toEqual({ ok: true, userId: "u1" });
  });
});
