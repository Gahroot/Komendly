// DB-backed shared Codex login (CodexCredential row "codex"), enabled with CODEX_SHARED_STORE=db.
// ChatGPT refresh tokens rotate: the engine and Kly must refresh ONE pair. Refresh runs inside a transaction holding
// pg_advisory_xact_lock(hashtext('codex-credential')); the row is re-read under the lock. Tokens are AES-GCM sealed
// with ADS_TOKEN_KEY (same helper as the Meta tokens).
import { decryptToken, encryptToken, tokenKey } from "../../../src/lib/ads/meta/core/crypto";
import type { CodexCredStore, CodexCreds } from "./codex-auth";

export const CODEX_CREDENTIAL_ID = "codex";

interface CredRow {
  accessToken: string;
  refreshToken: string;
  expiresAt: bigint | number;
  accountId: string | null;
}

/** The raw-SQL slice of a Prisma client (structural, so the engine's and Kly's generated clients both fit). */
export interface CredSql {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<number>;
}
export interface CredDb extends CredSql {
  $transaction<R>(fn: (tx: CredSql) => Promise<R>, options?: { maxWait?: number; timeout?: number }): Promise<R>;
}

export function sealCreds(c: CodexCreds, key: Buffer): CredRow {
  return { accessToken: encryptToken(c.accessToken, key), refreshToken: encryptToken(c.refreshToken, key), expiresAt: BigInt(Math.round(c.expiresAt)), accountId: c.accountId ?? null };
}

export function openCreds(r: CredRow, key: Buffer): CodexCreds {
  return { accessToken: decryptToken(r.accessToken, key), refreshToken: decryptToken(r.refreshToken, key), expiresAt: Number(r.expiresAt), ...(r.accountId ? { accountId: r.accountId } : {}) };
}

async function readRow(q: CredSql, key: Buffer): Promise<CodexCreds | null> {
  const rows = await q.$queryRaw<CredRow[]>`SELECT "accessToken", "refreshToken", "expiresAt", "accountId" FROM "CodexCredential" WHERE id = ${CODEX_CREDENTIAL_ID}`;
  const r = rows[0];
  if (!r) return null;
  try {
    return openCreds(r, key);
  } catch {
    return null; // sealed with another key: treat as missing (re-seeded from env)
  }
}

async function writeRow(q: CredSql, c: CodexCreds, key: Buffer, by: string): Promise<void> {
  const s = sealCreds(c, key);
  await q.$executeRaw`INSERT INTO "CodexCredential" (id, "accessToken", "refreshToken", "expiresAt", "accountId", "refreshedBy", "updatedAt")
    VALUES (${CODEX_CREDENTIAL_ID}, ${s.accessToken}, ${s.refreshToken}, ${s.expiresAt}, ${s.accountId}, ${by}, now())
    ON CONFLICT (id) DO UPDATE SET "accessToken" = EXCLUDED."accessToken", "refreshToken" = EXCLUDED."refreshToken",
      "expiresAt" = EXCLUDED."expiresAt", "accountId" = EXCLUDED."accountId", "refreshedBy" = EXCLUDED."refreshedBy", "updatedAt" = now()`;
}

export function dbCodexStore(db: CredDb, key: Buffer, by: string): CodexCredStore {
  const lock = (tx: CredSql) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('codex-credential'))`;
  return {
    read: () => readRow(db, key),
    seed: (c) =>
      db.$transaction(async (tx) => {
        await lock(tx);
        const cur = await readRow(tx, key);
        if (!cur || c.expiresAt > cur.expiresAt) await writeRow(tx, c, key, by);
      }),
    locked: (fn) =>
      db.$transaction(
        async (tx) => {
          await lock(tx);
          const r = await fn(await readRow(tx, key));
          if (r.write) await writeRow(tx, r.creds, key, by);
          return r.creds;
        },
        { maxWait: 60_000, timeout: 60_000 },
      ),
  };
}

/** CODEX_SHARED_STORE=db -> the DB store (needs ADS_TOKEN_KEY); else undefined (file/env behaviour unchanged). */
export function sharedCodexStore(db: CredDb | undefined, env: NodeJS.ProcessEnv, by: string): CodexCredStore | undefined {
  if (env.CODEX_SHARED_STORE !== "db" || !db) return undefined;
  return dbCodexStore(db, tokenKey(env.ADS_TOKEN_KEY), by);
}
