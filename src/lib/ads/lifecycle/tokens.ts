// Signed tokens for lifecycle emails (unsubscribe, long-lived ad thumbnails) and the
// verification code hashing shared by web + engine. node:crypto only (engine imports it).
import crypto from "node:crypto";

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Hash stored in EmailVerificationToken for a 6-digit code (scoped to the user). */
export function verificationCodeHash(userId: string, code: string): string {
  return sha256Hex(`code:${userId}:${code}`);
}

/** Hash stored in EmailVerificationToken for a link token. */
export function verificationLinkHash(token: string): string {
  return sha256Hex(token);
}

export function newVerificationSecrets(): { token: string; code: string } {
  return { token: crypto.randomBytes(32).toString("base64url"), code: crypto.randomInt(0, 1_000_000).toString().padStart(6, "0") };
}

/** click: tracked link (user, email kind, app-relative path: never an absolute URL, so no open redirect). */
export type EmailTokenPayload = { p: "unsub"; u: string } | { p: "img"; a: string; e: number } | { p: "click"; u: string; k: string; l: string };

/** App-relative path safe to redirect to ("/x", not "//host" or "/\\host"). */
export function isSafeAppPath(l: string): boolean {
  return /^\/(?![\/\\])[^\s]*$/.test(l) && l.length <= 600;
}

function mac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

export function signEmailToken(payload: EmailTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

export function verifyEmailToken(token: string, secret: string, now: Date = new Date()): EmailTokenPayload | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || !secret) return null;
  const expected = Buffer.from(mac(secret, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (p.p === "unsub" && typeof p.u === "string") return { p: "unsub", u: p.u };
    if (p.p === "click" && typeof p.u === "string" && typeof p.k === "string" && typeof p.l === "string" && isSafeAppPath(p.l)) return { p: "click", u: p.u, k: p.k, l: p.l };
    if (p.p === "img" && typeof p.a === "string" && typeof p.e === "number") {
      return p.e * 1000 > now.getTime() ? { p: "img", a: p.a, e: p.e } : null;
    }
  } catch {
    return null;
  }
  return null;
}

export const IMG_TOKEN_TTL_DAYS = 30;
