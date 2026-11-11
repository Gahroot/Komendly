// Referral code format + share URL. Pure (node:crypto only): shared by the web app and the engine (lifecycle emails).
import { randomInt } from "node:crypto";

export const SHARE_ORIGIN = "https://www.komendly.com";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_RE = /^[a-z0-9]{1,12}-[a-z0-9]{4}$/;

/** Pure: "Sarah Kim" -> "sarah-k3x9". `pick(n)` returns 0..n-1 (injected for tests). */
export function makeReferralCode(name: string | null | undefined, pick: (n: number) => number = randomInt): string {
  const first = (name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().split(/\s+/)[0] ?? "";
  const slug = first.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "friend";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += CODE_ALPHABET[pick(CODE_ALPHABET.length)] ?? "x";
  return `${slug}-${tail}`;
}

export function isReferralCode(v: string | null | undefined): v is string {
  return typeof v === "string" && CODE_RE.test(v);
}

export function shareUrl(code: string): string {
  return `${SHARE_ORIGIN}/r/${code}`;
}
