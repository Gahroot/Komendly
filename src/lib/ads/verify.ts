import { prisma } from "@/lib/prisma";
import { rewardStudioInviteSender } from "@/lib/studio/invite-server";
import { renderEmailLayout } from "@/lib/email/layout";
import { appBaseUrl, sendAdsMail } from "./mailer";
import { newVerificationSecrets, verificationCodeHash, verificationLinkHash } from "./lifecycle/tokens";

const TOKEN_TTL_MINUTES = 60 * 24;
/** Wrong code entries allowed per issued code; then the user must request a new email. */
export const CODE_MAX_ATTEMPTS = 5;

/** Codes live in EmailVerificationToken too; the hash is scoped to the user so it can't collide with links or other users. */
export const codeHash = verificationCodeHash;

/** Accepts "123 456", "123-456"; null if not exactly 6 digits. */
export function normalizeCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function codeAttemptsKey(userId: string): string {
  return `verify-code:${userId}`;
}

/** Issue a fresh link token + code (only hashes stored; older unused ones are revoked). */
export async function issueVerification(userId: string): Promise<{ token: string; code: string }> {
  const { token, code } = newVerificationSecrets();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);
  await prisma.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.emailVerificationToken.createMany({
    data: [
      { userId, tokenHash: verificationLinkHash(token), expiresAt },
      { userId, tokenHash: codeHash(userId, code), expiresAt },
    ],
  });
  // A new code resets the wrong-attempt counter.
  await prisma.adsRateLimit.deleteMany({ where: { key: codeAttemptsKey(userId) } });
  return { token, code };
}

export function verificationEmail(name: string | null, code: string, link: string, baseUrl: string) {
  const hi = `Hi${name ? ` ${name}` : " there"},`;
  return {
    subject: `Your Komendly code: ${code}`,
    text: `${hi}\n\nYour Komendly code is: ${code}\n\nType it on the "Check your inbox" screen, or click this link to confirm your email:\n${link}\n\nOnce confirmed, your free ads unlock: 10 static ads plus 1 animated ad, made from your website. No card needed.\n\nThe code and link expire in 24 hours. If you didn't sign up, ignore this email.`,
    html: verificationEmailHtml(name, link, baseUrl, undefined, code),
  };
}

/** Email the code + link. Dev without SMTP: logs it. */
export async function sendVerificationEmail(user: { id: string; email: string; name: string | null }, origin: string): Promise<void> {
  const { token, code } = await issueVerification(user.id);
  const base = appBaseUrl(origin);
  const mail = verificationEmail(user.name, code, `${base}/verify-email?token=${token}`, base);
  await sendAdsMail({ to: user.email, ...mail });
}

export function verificationEmailHtml(name: string | null, link: string, baseUrl: string, imageUrl?: string, code?: string): string {
  return renderEmailLayout({
    appUrl: baseUrl,
    imageUrl,
    preheader: code ? `Your code is ${code}. Confirm your email to unlock your free ads.` : "Confirm your email to unlock 10 free static ads and 1 animated ad.",
    heading: code ? `Your code: ${code}` : "One click and Ozzy gets to work",
    paragraphs: [
      `Hi${name ? ` ${name}` : " there"},`,
      ...(code ? [`Type ${code} on the "Check your inbox" screen, or use the button below.`] : []),
      "Confirm your email and your free trial is unlocked: 10 static ads plus 1 animated ad, made from your website. No card needed.",
    ],
    button: { label: "Confirm my email", href: link },
    note: code ? "The code and link expire in 24 hours. If you didn't sign up, you can safely ignore this email." : "This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.",
  });
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

async function consumeByHash(tokenHash: string, userId?: string): Promise<VerifyResult> {
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || (userId && record.userId !== userId)) return { ok: false, reason: "invalid" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "expired" };
  const used = await prisma.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) return { ok: false, reason: "invalid" };
  // Verified: the sibling link/code for this email is no longer needed.
  await prisma.emailVerificationToken.deleteMany({ where: { userId: record.userId, usedAt: null } });
  const verified = await prisma.user.updateMany({ where: { id: record.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  // Ozzy Studio invite: the sender earns +1 free video once the invited friend verifies (no-op without a claimed invite).
  if (verified.count === 1) await rewardStudioInviteSender(record.userId);
  return { ok: true, userId: record.userId };
}

/** Consume a link token: single use, expiring; sets User.emailVerifiedAt. Works without a session. */
export async function consumeVerificationToken(token: string): Promise<VerifyResult> {
  return consumeByHash(verificationLinkHash(token));
}

/**
 * Check a typed code for the signed-in user. Each try counts against CODE_MAX_ATTEMPTS
 * (`attempt` is the rate limiter; injected for tests). Single use, same expiry as the link.
 */
export async function consumeVerificationCode(
  userId: string,
  input: string,
  attempt: (key: string, limit: number, windowSeconds: number) => Promise<boolean>,
): Promise<VerifyResult> {
  if (!(await attempt(codeAttemptsKey(userId), CODE_MAX_ATTEMPTS, TOKEN_TTL_MINUTES * 60))) return { ok: false, reason: "too_many_attempts" };
  const code = normalizeCode(input);
  if (!code) return { ok: false, reason: "invalid" };
  return consumeByHash(codeHash(userId, code), userId);
}
