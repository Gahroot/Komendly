// Personal API keys: generation and hashing (Node only). Policy/format helpers live in ./policy (edge-safe).
import crypto from "node:crypto";
import { API_KEY_PREFIX } from "./policy";

export * from "./policy";

const BODY_LENGTH = 40;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A new random key: "kmd_" + 40 base62 chars (rejection sampling, no modulo bias). */
export function generateApiKey(): string {
  let body = "";
  while (body.length < BODY_LENGTH) {
    for (const b of crypto.randomBytes(64)) {
      if (b < 248 && body.length < BODY_LENGTH) body += BASE62[b % 62];
    }
  }
  return API_KEY_PREFIX + body;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** First 12 chars, shown in the key list. */
export function keyPrefix(key: string): string {
  return key.slice(0, 12);
}

