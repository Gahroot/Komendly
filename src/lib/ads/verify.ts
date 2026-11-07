import crypto from "crypto";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { renderEmailLayout } from "@/lib/email/layout";

const TOKEN_TTL_MINUTES = 60 * 24;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function appUrl(fallbackOrigin: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin).replace(/\/$/, "");
}

/** Create a single-use token (only its hash is stored) and email the link. Dev without SMTP: logs it. */
export async function sendVerificationEmail(user: { id: string; email: string; name: string | null }, origin: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000) },
  });
  const link = `${appUrl(origin)}/verify-email?token=${token}`;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.info(`[ads] SMTP not configured. Verification link for ${user.email}: ${link}`);
    return;
  }
  const port = Number(SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: user.email,
    subject: "Confirm your email: Ozzy's ready to make your ads",
    text: `Hi${user.name ? ` ${user.name}` : ""},\n\nOne click and Ozzy gets to work. Confirm your email to unlock your free Komendly ads: 10 static ads plus 1 animated ad, no card needed.\n\nConfirm my email: ${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
    html: verificationEmailHtml(user.name, link, appUrl(origin)),
  });
}

export function verificationEmailHtml(name: string | null, link: string, baseUrl: string, imageUrl?: string): string {
  return renderEmailLayout({
    appUrl: baseUrl,
    imageUrl,
    preheader: "Confirm your email to unlock 10 free static ads and 1 animated ad.",
    heading: "One click and Ozzy gets to work",
    paragraphs: [
      `Hi${name ? ` ${name}` : " there"},`,
      "Confirm your email and your free trial is unlocked: 10 static ads plus 1 animated ad, made from your website. No card needed.",
    ],
    button: { label: "Confirm my email", href: link },
    note: "This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.",
  });
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" };

/** Consume a token: single use, expiring; sets User.emailVerifiedAt. */
export async function consumeVerificationToken(token: string): Promise<VerifyResult> {
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt) return { ok: false, reason: "invalid" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "expired" };
  const used = await prisma.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) return { ok: false, reason: "invalid" };
  await prisma.user.updateMany({ where: { id: record.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  return { ok: true, userId: record.userId };
}
