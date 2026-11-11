import nodemailer from "nodemailer";

export interface AdsMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export type MailOutcome = "sent" | "logged";

/**
 * Send via SMTP (Resend). Logs instead of sending when SMTP isn't configured or ADS_EMAIL_LOG_ONLY=1
 * (use that for local testing so no real user gets mail).
 */
export async function sendAdsMail(mail: AdsMail): Promise<MailOutcome> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ADS_EMAIL_LOG_ONLY } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || ADS_EMAIL_LOG_ONLY === "1") {
    console.info(`[ads-mail] (log only) to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}`);
    return "logged";
  }
  const port = Number(SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transporter.sendMail({ from: SMTP_FROM || SMTP_USER, replyTo: process.env.SMTP_REPLY_TO || undefined, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers });
  return "sent";
}

export function appBaseUrl(fallbackOrigin: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin).replace(/\/$/, "");
}
