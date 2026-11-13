import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";

export const DEFAULT_BASE_URL = "https://www.komendly.com";

export interface StoredConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface ResolvedConfig {
  apiKey: string | undefined;
  baseUrl: string;
  keySource: "env" | "flag" | "file" | "none";
  path: string;
}

export function configPath(home: string): string {
  return join(home, ".config", "komendly", "cli.json");
}

function cleanBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function readStoredConfig(path: string): Promise<StoredConfig> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const o = parsed as Record<string, unknown>;
    return {
      ...(typeof o.apiKey === "string" ? { apiKey: o.apiKey } : {}),
      ...(typeof o.baseUrl === "string" ? { baseUrl: o.baseUrl } : {}),
    };
  } catch {
    return {};
  }
}

/** Precedence: --key flag > KOMENDLY_API_KEY > config file. Base URL: --base-url > KOMENDLY_BASE_URL > file > default. */
export async function loadConfig(opts: { env: Record<string, string | undefined>; home: string; keyFlag?: string; baseUrlFlag?: string }): Promise<ResolvedConfig> {
  const path = configPath(opts.home);
  const stored = await readStoredConfig(path);
  const envKey = opts.env.KOMENDLY_API_KEY?.trim();
  let apiKey: string | undefined;
  let keySource: ResolvedConfig["keySource"] = "none";
  if (opts.keyFlag) {
    apiKey = opts.keyFlag.trim();
    keySource = "flag";
  } else if (envKey) {
    apiKey = envKey;
    keySource = "env";
  } else if (stored.apiKey) {
    apiKey = stored.apiKey;
    keySource = "file";
  }
  const baseUrl = cleanBase(opts.baseUrlFlag ?? opts.env.KOMENDLY_BASE_URL ?? stored.baseUrl ?? DEFAULT_BASE_URL);
  return { apiKey, baseUrl, keySource, path };
}

export async function saveConfig(path: string, config: StoredConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export function looksLikeKey(key: string): boolean {
  return /^kmd_[A-Za-z0-9]{20,}$/.test(key);
}
