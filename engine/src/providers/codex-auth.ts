// ChatGPT OAuth credentials for the Codex backend.
// Source order: CODEX_TOKEN_STORE (refreshed tokens persisted on the volume) when newer,
// else CODEX_AUTH_JSON (the `openai` entry of ~/.ezcoder/auth.json as JSON), else
// CODEX_AUTH_FILE (a whole ~/.ezcoder/auth.json, or just the openai entry).
// Refresh mirrors @prestyj/core (oauth/openai.ts refreshOpenAIToken + AuthStorage threshold).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const MIN_REFRESH_THRESHOLD_MS = 300_000;
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

export const CodexCredsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number(),
  accountId: z.string().optional(),
});
export type CodexCreds = z.infer<typeof CodexCredsSchema>;

export function parseCredsJson(raw: string): CodexCreds {
  const o = JSON.parse(raw) as Record<string, unknown>;
  const entry = "openai" in o && typeof o.openai === "object" ? o.openai : o;
  return CodexCredsSchema.parse(entry);
}

export function accountIdFromToken(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const auth = claims[JWT_CLAIM_PATH] as { chatgpt_account_id?: unknown } | undefined;
    return typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : undefined;
  } catch {
    return undefined;
  }
}

export interface CodexAuthOptions {
  authJson?: string;
  authFile?: string;
  tokenStore?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class CodexAuth {
  private creds: CodexCreds | null = null;
  private loading: Promise<CodexCreds | null> | null = null;
  private refreshing: Promise<CodexCreds> | null = null;
  private lastError: string | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly o: CodexAuthOptions) {
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.now = o.now ?? Date.now;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): CodexAuth {
    return new CodexAuth({
      authJson: env.CODEX_AUTH_JSON || undefined,
      authFile: env.CODEX_AUTH_FILE || undefined,
      tokenStore: env.CODEX_TOKEN_STORE || undefined,
    });
  }

  get configured(): boolean {
    return Boolean(this.o.authJson || this.o.authFile);
  }

  /** Concurrent first callers share one in-flight load (a flag set before the read finished let them see null). */
  private load(): Promise<CodexCreds | null> {
    this.loading ??= this.readCreds().catch((e: unknown) => {
      this.loading = null;
      throw e;
    });
    return this.loading;
  }

  private async readCreds(): Promise<CodexCreds | null> {
    const candidates: CodexCreds[] = [];
    if (this.o.tokenStore) {
      try {
        candidates.push(parseCredsJson(await readFile(this.o.tokenStore, "utf8")));
      } catch {
        /* no stored refresh yet */
      }
    }
    if (this.o.authJson) candidates.push(parseCredsJson(this.o.authJson));
    else if (this.o.authFile) candidates.push(parseCredsJson(await readFile(this.o.authFile, "utf8")));
    // Newest expiry wins (refresh tokens rotate; the store holds the latest pair).
    candidates.sort((a, b) => b.expiresAt - a.expiresAt);
    this.creds = candidates[0] ?? null;
    return this.creds;
  }

  /** Valid access token + account id, refreshing when within the threshold of expiry. */
  async resolve(): Promise<{ accessToken: string; accountId: string | undefined }> {
    const creds = await this.load();
    if (!creds) throw new Error("Codex login not configured");
    let c = creds;
    if (this.now() >= c.expiresAt - MIN_REFRESH_THRESHOLD_MS) c = await this.refresh();
    return { accessToken: c.accessToken, accountId: c.accountId ?? accountIdFromToken(c.accessToken) };
  }

  async refresh(): Promise<CodexCreds> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<CodexCreds> {
    const cur = await this.load();
    if (!cur) throw new Error("Codex login not configured");
    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cur.refreshToken, client_id: CLIENT_ID }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      this.lastError = `Codex token refresh failed (${res.status}); log in again`;
      throw new Error(this.lastError);
    }
    const d = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    const next: CodexCreds = {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresAt: this.now() + d.expires_in * 1000,
      accountId: accountIdFromToken(d.access_token) ?? cur.accountId,
    };
    this.creds = next;
    this.lastError = null;
    await this.persist(next);
    return next;
  }

  private async persist(c: CodexCreds): Promise<void> {
    if (!this.o.tokenStore) return;
    await mkdir(path.dirname(this.o.tokenStore), { recursive: true });
    const tmp = `${this.o.tokenStore}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(c), { mode: 0o600 });
    await rename(tmp, this.o.tokenStore);
  }

  async health(): Promise<{ ok: boolean; message?: string }> {
    if (!this.configured) return { ok: false, message: "Codex login not configured" };
    try {
      const c = await this.load();
      if (!c) return { ok: false, message: "Codex login not configured" };
      if (this.lastError) return { ok: false, message: this.lastError };
      if (this.now() >= c.expiresAt - MIN_REFRESH_THRESHOLD_MS) await this.refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
}
