// Personal plain-text notes from Nolan to users the lifecycle drip doesn't cover (or who we had to make whole).
// Recipients + copy live in a JSON file: [{ "email", "kind", "subject", "body" }]. Body placeholders:
//   {first} first name, {base} app URL, {verify} fresh confirm-email link (issues a new code), {unsub} unsubscribe URL.
// Skips paid, unsubscribed and test users, and anyone who already got the same kind. Records AdsEvent email_sent
// (so the drip keeps its 24h gap). Dry run by default; --send to send.
// Run: set -a; . /tmp/prod.env; set +a; npx tsx scripts/ads-founder-outreach.ts notes.json [--send]
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";
import { newVerificationSecrets, signEmailToken, verificationCodeHash, verificationLinkHash } from "../src/lib/ads/lifecycle/tokens";
import { isTestEmail } from "../src/lib/ads/lifecycle/select";
import { founderFrom } from "../src/lib/ads/lifecycle/founder";

interface Note { email: string; kind: string; subject: string; body: string }

async function main() {
  const file = process.argv[2];
  const send = process.argv.includes("--send");
  if (!file) throw new Error("usage: ads-founder-outreach.ts notes.json [--send]");
  const notes = JSON.parse(readFileSync(file, "utf8")) as Note[];
  const env = process.env;
  const base = (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
  const secret = env.LIFECYCLE_EMAIL_SECRET;
  if (!secret) throw new Error("LIFECYCLE_EMAIL_SECRET missing");
  const db = new PrismaClient();
  const port = Number(env.SMTP_PORT || 587);
  const mail = send ? nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }) : null;
  for (const n of notes) {
    const user = await db.user.findUnique({ where: { email: n.email.toLowerCase() }, select: { id: true, name: true, emailVerifiedAt: true } });
    if (!user) { console.log(`skip ${n.email}: no user`); continue; }
    const member = await db.adsWorkspaceMember.findFirst({ where: { userId: user.id }, select: { workspace: { select: { id: true, subscriptionStatus: true, adsPlan: true } } } });
    const ws = member?.workspace;
    const unsub = await db.adsEvent.findFirst({ where: { userId: user.id, name: { in: ["email_unsubscribed", "unsubscribed"] } }, select: { id: true } });
    const already = await db.adsEvent.findFirst({ where: { userId: user.id, name: "email_sent", props: { path: ["kind"], equals: n.kind } }, select: { id: true } });
    const paid = ws && ["active", "trialing", "past_due"].includes(String(ws.subscriptionStatus));
    const why = isTestEmail(n.email) ? "test" : unsub ? "unsubscribed" : paid ? "paid" : already ? "already sent" : null;
    if (why) { console.log(`skip ${n.email}: ${why}`); continue; }
    let verify = `${base}/login`;
    if (n.body.includes("{verify}") && send) {
      const { token, code } = newVerificationSecrets();
      const expiresAt = new Date(Date.now() + 72 * 3_600_000);
      await db.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await db.emailVerificationToken.createMany({ data: [{ userId: user.id, tokenHash: verificationLinkHash(token), expiresAt }, { userId: user.id, tokenHash: verificationCodeHash(user.id, code), expiresAt }] });
      verify = `${base}/verify-email?token=${token}`;
    } else if (n.body.includes("{verify}")) verify = `${base}/verify-email?token=DRY_RUN`;
    const unsubUrl = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: user.id }, secret)}`;
    const first = user.name?.trim().split(/\s+/)[0] || "there";
    const text = `${n.body.replaceAll("{first}", first).replaceAll("{base}", base).replaceAll("{verify}", verify)}\n\n--\nDon't want these emails? Unsubscribe: ${unsubUrl}`;
    if (!send) { console.log(`\n=== DRY ${n.email} | ${n.subject}\n${text}`); continue; }
    await mail!.sendMail({ from: founderFrom(env.LIFECYCLE_FOUNDER_FROM), replyTo: env.SMTP_REPLY_TO || undefined, to: n.email, subject: n.subject, text, headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    await db.adsEvent.create({ data: { name: "email_sent", userId: user.id, workspaceId: ws?.id ?? null, props: { kind: n.kind, subject: n.subject, source: "founder_personal" } } });
    console.log(`sent ${n.email} (${n.kind})`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
