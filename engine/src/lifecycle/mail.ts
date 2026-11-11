// SMTP (Resend) for lifecycle emails; same SMTP_* env as the web app.
import nodemailer from "nodemailer";

export interface OutMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  /** Per-email From override (e.g. the founder note); default SMTP_FROM. */
  from?: string;
}

export type SendMail = (mail: OutMail) => Promise<void>;

export function smtpConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export function createSmtpSender(env: NodeJS.ProcessEnv = process.env): SendMail {
  const port = Number(env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  const from = env.SMTP_FROM || env.SMTP_USER;
  const replyTo = env.SMTP_REPLY_TO || undefined;
  return async (m) => {
    await transporter.sendMail({ from: m.from || from, replyTo, to: m.to, subject: m.subject, text: m.text, html: m.html || undefined, headers: m.headers });
  };
}
