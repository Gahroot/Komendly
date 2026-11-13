import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CodexAuth, type CodexCredStore, type CodexCreds } from "../src/providers/codex-auth";
import { openCreds, sealCreds } from "../src/providers/codex-store";

const NOW = 1_800_000_000_000;

/** In-memory stand-in for the CodexCredential row + advisory lock (a promise chain = one holder at a time). */
function memoryStore(initial: CodexCreds | null): CodexCredStore & { row: () => CodexCreds | null } {
  let row = initial;
  let chain: Promise<unknown> = Promise.resolve();
  return {
    row: () => row,
    read: async () => row,
    seed: async (c) => {
      if (!row || c.expiresAt > row.expiresAt) row = c;
    },
    locked: (fn) => {
      const p = chain.then(async () => {
        const r = await fn(row);
        if (r.write) row = r.creds;
        return r.creds;
      });
      chain = p.catch(() => undefined);
      return p;
    },
  };
}

function tokenFetch(counter: { n: number }): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    counter.n++;
    const body = new URLSearchParams(String(init?.body));
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify({ access_token: `at-${counter.n}`, refresh_token: `rt-${counter.n}-from-${body.get("refresh_token")}`, expires_in: 864_000 }), { status: 200 });
  }) as typeof fetch;
}

const old: CodexCreds = { accessToken: "at-0", refreshToken: "rt-0", expiresAt: NOW - 1000 };

describe("shared Codex store", () => {
  it("two processes refreshing at once: one refreshes, the other adopts its pair", async () => {
    const store = memoryStore(old);
    const calls = { n: 0 };
    const a = new CodexAuth({ store, fetchImpl: tokenFetch(calls), now: () => NOW });
    const b = new CodexAuth({ store, fetchImpl: tokenFetch(calls), now: () => NOW });
    const [ra, rb] = await Promise.all([a.resolve(), b.resolve()]);
    expect(calls.n).toBe(1);
    expect(ra.accessToken).toBe("at-1");
    expect(rb.accessToken).toBe("at-1");
    expect(store.row()?.refreshToken).toBe("rt-1-from-rt-0");
  });

  it("seeds the row from env when missing or older; a newer row wins over env", async () => {
    const env: CodexCreds = { accessToken: "env", refreshToken: "rt-env", expiresAt: NOW + 86_400_000 };
    const empty = memoryStore(null);
    await new CodexAuth({ authJson: JSON.stringify({ openai: env }), store: empty, now: () => NOW }).resolve();
    expect(empty.row()?.accessToken).toBe("env");
    const newer = memoryStore({ ...env, accessToken: "db", refreshToken: "rt-db", expiresAt: env.expiresAt + 1000 });
    const r = await new CodexAuth({ authJson: JSON.stringify({ openai: env }), store: newer, now: () => NOW }).resolve();
    expect(r.accessToken).toBe("db");
    expect(newer.row()?.accessToken).toBe("db");
  });

  it("encrypts tokens at rest and round-trips", () => {
    const key = randomBytes(32);
    const c: CodexCreds = { accessToken: "secret-access", refreshToken: "secret-refresh", expiresAt: NOW, accountId: "acc" };
    const sealed = sealCreds(c, key);
    expect(sealed.accessToken).not.toContain("secret");
    expect(sealed.expiresAt).toBe(BigInt(NOW));
    expect(openCreds(sealed, key)).toEqual(c);
    expect(() => openCreds(sealed, randomBytes(32))).toThrow();
  });
});
